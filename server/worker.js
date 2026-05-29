import Bottleneck from 'bottleneck'
import { compact } from './db/database.js'
import * as Jobs from './db/jobs.js'
import * as Contacts from './db/contacts.js'
import { sendOneMessage } from './lib/twilioMessagingSender.js'
import { runtimeConfig } from './lib/runtimeConfig.js'

const COMPACT_THRESHOLD = 1000

// Serial global queue: at most one job runs at a time. Multiple uploads are
// processed in order. Within a single job we use a Bottleneck-based token
// bucket to respect Twilio's per-second budget.
const pendingJobIds = []
let isDraining = false

export function enqueueJob(jobId) {
  if (!pendingJobIds.includes(jobId)) {
    pendingJobIds.push(jobId)
    console.log(`[worker] Enqueued job ${jobId} (queue depth=${pendingJobIds.length})`)
  }
  drain()
}

async function drain() {
  if (isDraining) return
  isDraining = true
  while (pendingJobIds.length > 0) {
    const jobId = pendingJobIds.shift()
    try {
      await processJob(jobId)
    } catch (err) {
      console.error(`[worker] Job ${jobId} crashed:`, err)
      try {
        Jobs.complete(jobId, { successful: 0, failed: 0, error: err.message })
        Contacts.deleteByJob(jobId)
      } catch { /* swallow */ }
    }
  }
  isDraining = false
}

export function queueSnapshot() {
  return { pending: [...pendingJobIds], isDraining }
}

const computeBackoffMs = (retryCount, retryAfterMs) => {
  if (retryAfterMs != null && retryAfterMs >= 0) return retryAfterMs
  const base = runtimeConfig.backoffBaseMs * Math.pow(2, retryCount)
  const capped = Math.min(runtimeConfig.backoffMaxMs, base)
  const jitter = capped * (Math.random() * 0.5 - 0.25)
  return Math.max(250, Math.round(capped + jitter))
}

async function processJob(jobId) {
  const job = Jobs.getJob(jobId)
  if (!job) {
    console.warn(`[worker] Job ${jobId} not found, skipping`)
    return
  }
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return
  if (job.status === 'cancelling') {
    console.log(`[worker] Job ${jobId} cancelled before it started running`)
    Jobs.complete(jobId, { successful: 0, failed: 0, status: 'cancelled', error: 'Cancelled by user' })
    Contacts.deleteByJob(jobId)
    return
  }

  Jobs.setStatus(jobId, 'processing')
  const t0 = Date.now()
  console.log(JSON.stringify({
    evt: 'job.start',
    jobId,
    channel: job.channel,
    total: job.total,
    mps: runtimeConfig.mps,
    concurrency: runtimeConfig.concurrency,
    maxRetries429: runtimeConfig.maxRetries429,
    maxRetries5xx: runtimeConfig.maxRetries5xx
  }))

  // Token bucket: refill `mps` permits every second; cap concurrency on top of
  // that so we never have more than N requests in flight simultaneously.
  const limiter = new Bottleneck({
    reservoir: runtimeConfig.mps,
    reservoirRefreshAmount: runtimeConfig.mps,
    reservoirRefreshInterval: 1000,
    maxConcurrent: runtimeConfig.concurrency
  })

  let totalSent = 0
  let totalFailed = 0
  let totalRequeued429 = 0
  let totalRequeued5xx = 0
  let wasCancelled = false

  // Track per-contact retry counts for 429 vs 5xx so we can stop retrying at
  // the configured ceiling without conflating the two reasons.
  const retryCounters = new Map() // contactId → { r429, r5xx }
  const bumpRetry = (contactId, kind) => {
    const cur = retryCounters.get(contactId) || { r429: 0, r5xx: 0 }
    cur[kind] += 1
    retryCounters.set(contactId, cur)
    return cur
  }

  const handleResult = (contact, result) => {
    if (result.status === 'sent') {
      Contacts.markSent(contact.id, result.messageSid, result.httpStatus)
      totalSent++
      return
    }

    if (result.status === 'retry') {
      const kind = result.httpStatus === 429 ? 'r429' : 'r5xx'
      const counts = bumpRetry(contact.id, kind)
      const max = kind === 'r429' ? runtimeConfig.maxRetries429 : runtimeConfig.maxRetries5xx
      if (counts[kind] > max) {
        Contacts.markFailed(contact.id, `${result.error} (retry budget exhausted)`, result.httpStatus || null)
        totalFailed++
        return
      }
      const waitMs = computeBackoffMs(counts[kind], result.retryAfterMs)
      const nextAt = Date.now() + waitMs
      Contacts.requeue(contact.id, nextAt, result.httpStatus || null, result.error || '')
      if (kind === 'r429') totalRequeued429++
      else totalRequeued5xx++
      return
    }

    // Permanent failure
    Contacts.markFailed(contact.id, result.error, result.httpStatus || null)
    totalFailed++
  }

  const BATCH = Math.max(runtimeConfig.concurrency * 4, 100)

  while (true) {
    // Cancellation check
    const current = Jobs.getJob(jobId)
    if (current?.status === 'cancelling') {
      console.log(`[worker] Job ${jobId} cancellation detected — stopping after ${totalSent} sent`)
      wasCancelled = true
      break
    }

    const eligible = Contacts.fetchEligible(jobId, BATCH)

    if (eligible.length === 0) {
      const stillPending = Contacts.countPending(jobId)
      if (stillPending === 0) break

      // Everything pending is waiting on a retry timer. Sleep until the
      // earliest one becomes eligible (or 2s, whichever is sooner — lets us
      // check cancellation regularly).
      const earliest = Contacts.earliestNextRetry(jobId)
      const sleep = earliest ? Math.max(50, Math.min(2000, earliest - Date.now())) : 500
      await new Promise((r) => setTimeout(r, sleep))
      continue
    }

    const promises = eligible.map((contact) =>
      limiter.schedule(() =>
        sendOneMessage({
          contact,
          message: job.message,
          mediaUrl: job.mediaUrl,
          contentTemplate: job.contentTemplate,
          channel: job.channel,
          senderConfig: job.senderConfig,
          twilioConfig: job.twilioConfig,
          scheduledAt: job.scheduledAt
        })
          .then((result) => handleResult(contact, result))
          .catch((err) => {
            Contacts.markFailed(contact.id, `Worker error: ${err.message}`, null)
            totalFailed++
          })
      )
    )

    await Promise.all(promises)
    persistCounters(jobId, totalSent, totalFailed)

    console.log(JSON.stringify({
      evt: 'job.progress',
      jobId,
      sent: totalSent,
      failed: totalFailed,
      requeued429: totalRequeued429,
      requeued5xx: totalRequeued5xx,
      pending: Contacts.countPending(jobId)
    }))
  }

  if (wasCancelled) {
    Jobs.complete(jobId, {
      successful: totalSent,
      failed: totalFailed,
      status: 'cancelled',
      error: `Cancelled by user after ${totalSent} sent`
    })
  } else {
    Jobs.complete(jobId, { successful: totalSent, failed: totalFailed })
  }

  Contacts.deleteByJob(jobId)

  if (job.total >= COMPACT_THRESHOLD) {
    console.log(`[worker] Job ${jobId} reclaiming disk space (VACUUM)...`)
    const tc = Date.now()
    compact()
    console.log(`[worker] Job ${jobId} compacted in ${Date.now() - tc}ms`)
  }

  const finalLabel = wasCancelled ? 'cancelled' : 'done'
  const durationMs = Date.now() - t0
  console.log(JSON.stringify({
    evt: 'job.end',
    jobId,
    outcome: finalLabel,
    sent: totalSent,
    failed: totalFailed,
    requeued429: totalRequeued429,
    requeued5xx: totalRequeued5xx,
    durationMs,
    effectiveMsgPerSec: durationMs > 0 ? Math.round((totalSent * 1000) / durationMs) : 0
  }))
}

// Sync the per-loop aggregates onto the jobs row so the UI polling sees them.
function persistCounters(jobId, sent, failed) {
  const job = Jobs.getJob(jobId)
  if (!job) return
  const deltaSent = sent - (job.successful || 0)
  const deltaFailed = failed - (job.failed || 0)
  if (deltaSent !== 0 || deltaFailed !== 0) {
    Jobs.incrementCounters(jobId, { successful: deltaSent, failed: deltaFailed })
  }
}

// Recover any jobs that were left in 'pending', 'processing' or 'cancelling'
// after a crash. We mark them as failed so the UI doesn't show them stuck.
export function recoverOnBoot() {
  const all = Jobs.listJobs(200)
  for (const j of all) {
    if (j.status === 'processing' || j.status === 'cancelling' || j.status === 'pending') {
      Jobs.complete(j.id, {
        successful: j.successful || 0,
        failed: j.failed || 0,
        error: `Server restarted while job was ${j.status}`
      })
      Contacts.deleteByJob(j.id)
    }
  }
}
