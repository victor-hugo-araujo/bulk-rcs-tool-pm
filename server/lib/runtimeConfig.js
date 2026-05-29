// Centralized, env-driven runtime configuration for the worker / sender.
//
// This project sends via the Programmable Messaging API (one HTTP request per
// outgoing message). Defaults respect the RCS sender default of 100 messages
// per second. Raise via env only if your Twilio account capacity supports it.

const num = (envValue, fallback, { min = 0, max = Infinity } = {}) => {
  const v = Number(envValue)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

const bool = (envValue, fallback) => {
  if (envValue == null) return fallback
  const s = String(envValue).toLowerCase().trim()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

export const SAFE_TEST_MODE = bool(process.env.SAFE_TEST_MODE, false)

const baseDefaults = {
  // Messages per second the worker will dispatch. RCS sender default = 100.
  mps: 100,
  // Concurrent in-flight Messages API calls. Each call takes ~250–500 ms, so a
  // few dozen are needed to actually saturate the MPS budget.
  concurrency: 50,
  // Retry budget per contact on 429 (rate limit) and 5xx (transient server).
  maxRetries429: 5,
  maxRetries5xx: 2,
  // Base backoff for retries; capped at backoffMaxMs. Honors Retry-After when
  // the response provides it.
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
  // Hard ceiling per job. 500k matches the project's documented capacity.
  // 0 = unlimited.
  maxRecipientsPerJob: 500000
}

const safeTestOverrides = {
  mps: 5,
  concurrency: 2,
  maxRetries429: 5,
  maxRetries5xx: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 10000,
  maxRecipientsPerJob: 100
}

const startingDefaults = SAFE_TEST_MODE
  ? { ...baseDefaults, ...safeTestOverrides }
  : baseDefaults

export const runtimeConfig = {
  mps:                 num(process.env.TWILIO_MPS,              startingDefaults.mps,                 { min: 1, max: 10000 }),
  concurrency:         num(process.env.TWILIO_CONCURRENCY,      startingDefaults.concurrency,         { min: 1, max: 500 }),
  maxRetries429:       num(process.env.TWILIO_MAX_RETRIES_429,  startingDefaults.maxRetries429,       { min: 0, max: 20 }),
  maxRetries5xx:       num(process.env.TWILIO_MAX_RETRIES_5XX,  startingDefaults.maxRetries5xx,       { min: 0, max: 10 }),
  backoffBaseMs:       num(process.env.TWILIO_BACKOFF_BASE_MS,  startingDefaults.backoffBaseMs,       { min: 100, max: 60000 }),
  backoffMaxMs:        num(process.env.TWILIO_BACKOFF_MAX_MS,   startingDefaults.backoffMaxMs,        { min: 100, max: 600000 }),
  maxRecipientsPerJob: num(process.env.MAX_RECIPIENTS_PER_JOB,  startingDefaults.maxRecipientsPerJob, { min: 0, max: 10_000_000 })
}

export function logConfigOnBoot() {
  console.log('[runtimeConfig] effective configuration:')
  console.log(`  SAFE_TEST_MODE              ${SAFE_TEST_MODE}`)
  console.log(`  mps                         ${runtimeConfig.mps}`)
  console.log(`  concurrency                 ${runtimeConfig.concurrency}`)
  console.log(`  maxRetries429               ${runtimeConfig.maxRetries429}`)
  console.log(`  maxRetries5xx               ${runtimeConfig.maxRetries5xx}`)
  console.log(`  backoffBaseMs               ${runtimeConfig.backoffBaseMs}`)
  console.log(`  backoffMaxMs                ${runtimeConfig.backoffMaxMs}`)
  console.log(`  maxRecipientsPerJob         ${runtimeConfig.maxRecipientsPerJob || '∞'}`)
}
