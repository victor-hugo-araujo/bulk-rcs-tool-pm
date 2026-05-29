// Programmable Messaging sender: 1 HTTP request per outgoing message.
//
// Endpoint:  POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
// Body:      application/x-www-form-urlencoded
// Auth:      Basic with AccountSid + AuthToken (or APIKeySid + APIKeySecret)
//
// This is the granular alternative to the Bulk Messaging API. Each call delivers
// (or attempts) one message, which lets us:
//   - Respect a strict messages-per-second budget (token bucket upstream)
//   - Retry individual contacts on 429 / 5xx
//   - Observe per-contact delivery status
//
// Supports the three send modes the project exposes in the UI:
//   1. Free text                        → Body
//   2. Free text + media                → Body + MediaUrl
//   3. Pre-stored Content template      → ContentSid + ContentVariables
//
// Personalization (replacing `{column}` from CSV) is performed locally before
// posting, except for templates where the per-recipient values are passed via
// ContentVariables and Twilio substitutes them server-side.

import { runtimeConfig } from './runtimeConfig.js'

const MESSAGES_ENDPOINT = (accountSid) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

const normalizePhone = (p) => String(p || '').replace(/^(whatsapp:|rcs:|sms:)/i, '').trim()

// Format the destination address per channel for the Messages API:
//   sms       → +E.164
//   whatsapp  → whatsapp:+E.164
//   rcs       → rcs:+E.164 when sending from a direct agent, plain +E.164 with MessagingService
const toAddress = (phone, channel, viaMessagingService) => {
  const n = normalizePhone(phone)
  if (channel === 'whatsapp') return `whatsapp:${n}`
  if (channel === 'rcs') return viaMessagingService ? n : `rcs:${n}`
  return n
}

const toFromAddress = (raw, channel) => {
  const stripped = normalizePhone(raw)
  if (!stripped) return null
  if (channel === 'whatsapp') return `whatsapp:${stripped}`
  if (channel === 'rcs') return `rcs:${stripped}`
  return stripped
}

const authHeader = (twilioConfig) => {
  const useApiKey = !!(twilioConfig.apiKeySid && twilioConfig.apiKeySecret)
  const u = useApiKey ? twilioConfig.apiKeySid : twilioConfig.accountSid
  const p = useApiKey ? twilioConfig.apiKeySecret : twilioConfig.authToken
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64')
}

// Replace `{column}` (case-insensitive) with the contact's value for that
// column. Used for free-text Body and direct media URLs.
const personalize = (template, vars) => {
  if (typeof template !== 'string' || !template) return template
  let out = template
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), String(v ?? ''))
  }
  return out
}

// Per-recipient ContentVariables for templates: takes the user-typed values in
// contentTemplate.variables (which may contain `{column}` placeholders) and
// resolves them against the contact's CSV columns. Returns a flat map ready to
// JSON-stringify.
const resolveContentVariables = (contentTemplate, contact) => {
  const tplVars = contentTemplate?.variables || {}
  const ctxVars = contact.variables || {}
  const out = {}
  for (const [key, rawValue] of Object.entries(tplVars)) {
    out[key] = personalize(String(rawValue ?? ''), ctxVars)
  }
  return out
}

const parseRetryAfter = (headers) => {
  if (!headers || typeof headers.get !== 'function') return null
  const v = headers.get('retry-after')
  if (!v) return null
  const asInt = Number(v)
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000
  const asDate = Date.parse(v)
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now())
  return null
}

/**
 * Send a SINGLE message via the Programmable Messaging API.
 *
 * @returns {Promise<{
 *   status: 'sent' | 'retry' | 'failed',
 *   messageSid?: string,
 *   error?: string,
 *   httpStatus?: number,
 *   retryAfterMs?: number | null
 * }>}
 *
 * - 'sent'   → Twilio accepted the message (HTTP 2xx). messageSid present.
 * - 'retry'  → Transient failure (HTTP 429 / 5xx / network). Caller should
 *              requeue with backoff. retryAfterMs respects Retry-After if set.
 * - 'failed' → Permanent failure (HTTP 4xx other than 429). Caller marks the
 *              contact as failed.
 */
export async function sendOneMessage({ contact, message, mediaUrl, contentTemplate, channel, senderConfig, twilioConfig, scheduledAt }) {
  const accountSid = twilioConfig?.accountSid
  if (!accountSid) {
    return { status: 'failed', error: 'Missing accountSid' }
  }

  const viaMessagingService = senderConfig.type === 'messaging-service' && !!senderConfig.messagingServiceSid

  const params = new URLSearchParams()
  params.set('To', toAddress(contact.phone, channel, viaMessagingService))

  if (viaMessagingService) {
    params.set('MessagingServiceSid', senderConfig.messagingServiceSid)
  } else if (senderConfig.type === 'phone' && senderConfig.phoneNumber) {
    const from = toFromAddress(senderConfig.phoneNumber, channel)
    if (from) params.set('From', from)
  }

  const useTemplate = !!contentTemplate?.contentSid
  if (useTemplate) {
    params.set('ContentSid', contentTemplate.contentSid)
    const resolvedVars = resolveContentVariables(contentTemplate, contact)
    if (Object.keys(resolvedVars).length > 0) {
      params.set('ContentVariables', JSON.stringify(resolvedVars))
    }
  } else {
    const personalizedBody = personalize(message || '', contact.variables || {})
    if (personalizedBody) params.set('Body', personalizedBody)
    if (mediaUrl) {
      const personalizedMedia = personalize(String(mediaUrl), contact.variables || {}).trim()
      if (personalizedMedia) params.set('MediaUrl', personalizedMedia)
    }
  }

  if (scheduledAt && viaMessagingService) {
    params.set('SendAt', new Date(scheduledAt).toISOString())
    params.set('ScheduleType', 'fixed')
  }

  let response, text, parsed
  try {
    response = await fetch(MESSAGES_ENDPOINT(accountSid), {
      method: 'POST',
      headers: {
        'Authorization': authHeader(twilioConfig),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    })
    text = await response.text()
    try { parsed = JSON.parse(text) } catch { parsed = null }
  } catch (networkErr) {
    return { status: 'retry', error: `Network error: ${networkErr.message}`, retryAfterMs: null }
  }

  if (response.ok) {
    return {
      status: 'sent',
      messageSid: parsed?.sid || null,
      httpStatus: response.status
    }
  }

  const status = response.status
  const errMsg = parsed?.message || parsed?.error_message || parsed?.error || text || `HTTP ${status}`

  // 429 → always retry (rate limited)
  // 5xx → retry (server-side transient)
  // 4xx other → permanent
  const transient = status === 429 || (status >= 500 && status < 600)

  if (transient) {
    return {
      status: 'retry',
      httpStatus: status,
      error: errMsg,
      retryAfterMs: parseRetryAfter(response.headers)
    }
  }

  return {
    status: 'failed',
    httpStatus: status,
    error: `HTTP ${status}: ${errMsg}`
  }
}
