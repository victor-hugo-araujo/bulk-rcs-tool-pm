import db, { withTransaction } from './database.js'

const insertStmt = db.prepare(`
  INSERT INTO contacts (job_id, phone, variables_json, status) VALUES (?, ?, ?, 'pending')
`)

// Fetch the next batch of contacts that are eligible to send right now.
// Eligibility: status='pending' AND (no retry window OR window already past).
const fetchEligibleStmt = db.prepare(`
  SELECT id, phone, variables_json, retry_count
    FROM contacts
   WHERE job_id = ?
     AND status = 'pending'
     AND (next_retry_at IS NULL OR next_retry_at <= ?)
   ORDER BY id
   LIMIT ?
`)

// Count pending contacts (regardless of retry window) — used to know when the
// worker can stop the outer loop.
const countPendingStmt = db.prepare(`
  SELECT COUNT(*) AS n FROM contacts WHERE job_id = ? AND status = 'pending'
`)

// Earliest next_retry_at among pending rows — used by the worker to sleep
// before re-checking when nothing is currently eligible.
const earliestRetryStmt = db.prepare(`
  SELECT MIN(next_retry_at) AS t FROM contacts WHERE job_id = ? AND status = 'pending'
`)

const markSentStmt = db.prepare(`
  UPDATE contacts SET status = 'sent', message_sid = ?, last_http_status = ?, error = NULL WHERE id = ?
`)

const markFailedStmt = db.prepare(`
  UPDATE contacts SET status = 'failed', error = ?, last_http_status = ? WHERE id = ?
`)

const requeueStmt = db.prepare(`
  UPDATE contacts
     SET retry_count = retry_count + 1,
         next_retry_at = ?,
         last_http_status = ?,
         error = ?
   WHERE id = ?
`)

const deleteByJobStmt = db.prepare(`DELETE FROM contacts WHERE job_id = ?`)

const countByStatusStmt = db.prepare(`
  SELECT status, COUNT(*) as n FROM contacts WHERE job_id = ? GROUP BY status
`)

export function insertContacts(jobId, contacts) {
  withTransaction(() => {
    for (const c of contacts) {
      insertStmt.run(jobId, c.phone, c.variablesJson || null)
    }
  })
}

export function fetchEligible(jobId, limit, now = Date.now()) {
  return fetchEligibleStmt.all(jobId, now, limit).map((row) => ({
    id: row.id,
    phone: row.phone,
    variables: row.variables_json ? JSON.parse(row.variables_json) : {},
    retryCount: row.retry_count
  }))
}

export function countPending(jobId) {
  return countPendingStmt.get(jobId)?.n || 0
}

export function earliestNextRetry(jobId) {
  return earliestRetryStmt.get(jobId)?.t || null
}

export function markSent(contactId, messageSid, httpStatus = 201) {
  markSentStmt.run(messageSid || null, httpStatus, contactId)
}

export function markFailed(contactId, error, httpStatus = null) {
  markFailedStmt.run(String(error || 'unknown').slice(0, 1000), httpStatus, contactId)
}

export function requeue(contactId, nextRetryAt, httpStatus, error) {
  requeueStmt.run(nextRetryAt, httpStatus, String(error || '').slice(0, 1000), contactId)
}

export function deleteByJob(jobId) {
  deleteByJobStmt.run(jobId)
}

export function countByStatus(jobId) {
  const out = { pending: 0, sent: 0, failed: 0 }
  for (const row of countByStatusStmt.all(jobId)) {
    out[row.status] = row.n
  }
  return out
}
