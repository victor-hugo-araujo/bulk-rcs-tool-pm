# RCS / SMS / WhatsApp Sender — Programmable Messaging

Messaging app built with React + Vite that sends via Twilio's Programmable
Messaging API (one HTTP request per message) and respects a configurable
messages-per-second budget. Supports SMS, WhatsApp and RCS.

> Sibling of `bulk-rcs-tool-jobs` which uses the Bulk Messaging API. This
> project trades raw throughput for fine-grained per-contact retry and the
> ability to honor strict MPS limits (RCS default = 100).

## Features

- CSV upload and contact validation (streaming — supports up to 500,000 contacts per job)
- Immediate send and scheduled sending
- SMS, WhatsApp and **RCS** sender configuration
- Twilio Content Template support (WhatsApp and RCS)
- **Free-text RCS messages with optional Media URL** (image / video / document)
- **Local SQLite-backed job queue** with background worker — survives page reloads, reports real progress
- Uses Twilio's **Programmable Messaging API** (one HTTP request per outgoing message), pacing dispatch with a token bucket that honors a configurable MPS budget
- **Per-contact retry on 429 / 5xx** with exponential backoff (and honors `Retry-After` headers)
- Auto-cleanup: contacts rows are deleted from the local database after the job finishes; Twilio keeps delivery logs for up to 400 days
- Replies (Beta): two-way conversation view for SMS and WhatsApp

## RCS Channel

When you pick **RCS** as the channel:

- In the *Compose Message* step you can choose **Use Content Template** to pick any Twilio Content template from your account (the same picker used for WhatsApp), or **Free-text Message** to type a body with the usual `{name}` / `{phone}` placeholders.
- In free-text mode an optional **Media URL** field is available. Provide a public `https://` URL to attach an image, video, audio or document. Variable placeholders such as `{photo}` are also supported and are replaced per contact.
- We recommend pairing RCS with a Messaging Service that includes a verified RCS agent. Destination devices without RCS support may not receive the message — configure fallback behavior in your Twilio Messaging Service if needed.

## Replies (Beta)

The Replies section combines server-side conversation listing with realtime Twilio Conversations updates:

- Conversation list is fetched via backend `/api/conversations` (full SMS/WhatsApp list)
- Realtime updates use the Twilio Conversations browser SDK
- Conversations auto-subscribe when opened if needed
- "New messages" card badges appear for inbound updates
- Background badge sync runs every 3 minutes, plus an initial sync after page load

WhatsApp reply behavior:

- If last inbound user message is within 24 hours: free-text and template send are both available
- If last inbound user message is older than 24 hours: free-text is disabled, template send is required
- Inside 24 hours, the template picker shows approved + unapproved templates
- Outside 24 hours, the template picker shows approved templates only

For full implementation details, see [CONVERSATIONS_FEATURE.md](CONVERSATIONS_FEATURE.md).

## Quick Start

### Prerequisites

- Node.js **22+** (the backend uses the built-in `node:sqlite` module)
- Twilio account credentials
  - Account SID
  - Auth Token (or API Key SID + Secret)
  - API Key SID + API Key Secret (for realtime Replies)
- Twilio sender setup
  - SMS number and/or
  - WhatsApp-enabled sender (Sandbox or approved production sender) and/or
  - RCS-enabled Messaging Service / agent

### Run it (one command)

```bash
npm install
npm start
```

Then open http://localhost:3001 in your browser. That's it — a single process serves both the UI and the API.

The first `npm install` also installs the backend dependencies automatically. The first `npm start` builds the UI; subsequent runs use the cached build (delete the `dist/` folder to force a rebuild).

### Developer mode (hot reload)

If you're hacking on the code, use `npm run dev` instead — it boots Vite (UI hot reload on port 5173) and the backend (port 3001) side-by-side via `concurrently`. The Vite dev server proxies `/api/*` to the backend automatically.

### Where the data lives

- `server/data/app.db` — local SQLite file. Holds the job queue and per-contact rows during processing. Contact rows are deleted as soon as a job finishes; only job summaries (total / sent / failed) stay around.
- Delete the file at any time to start fresh.

## Usage

1. Configure Twilio credentials and sender settings (pick **SMS**, **WhatsApp** or **RCS** as the channel)
2. Upload a CSV contact list
3. Compose:
   - SMS → free text with variables
   - WhatsApp → pick an approved Content template
   - RCS → pick a Content template **or** type free text + optional Media URL
4. Send now or schedule
5. Open Replies (Beta) to monitor and respond to inbound messages

## Deduplication policy

Duplicate recipients in your CSV are detected on upload. By default the job
is refused so you don't send the same person twice — you can opt into
automatic deduplication by re-submitting with `dedupMode=auto`, which keeps
the first occurrence of each number.

The upload response includes a summary: `{ rowsParsed, valid, invalid,
duplicates, finalImported }`. The UI surfaces this in a confirmation dialog
when duplicates are present.

## How sending works

1. The user uploads a CSV via the UI. The file is streamed via `multipart/form-data` to `POST /api/jobs`.
2. The backend parses the CSV row-by-row (no full-file load in memory) and writes contacts into SQLite in batches of 5,000.
3. A `jobId` is returned to the UI; the React app polls `GET /api/jobs/:id` every 2.5s for progress.
4. An in-process worker reads pending contacts from SQLite and dispatches them through a token-bucket rate limiter — by default **100 messages per second** with **50 concurrent in-flight requests**. Each contact is one POST to Twilio's Programmable Messaging API.
5. On `HTTP 429` (rate limited) or `HTTP 5xx` (transient), the contact is requeued in SQLite with `next_retry_at = now + exponential backoff` (with jitter, honoring `Retry-After` when present). The worker picks it up again on the next cycle.
6. When the job finishes, contact rows are deleted from SQLite. The job summary (`total / successful / failed`) is preserved.

### Tuning via env

| Variable | Default | Notes |
|---|---|---|
| `TWILIO_MPS` | `100` | Messages per second budget |
| `TWILIO_CONCURRENCY` | `50` | Concurrent in-flight requests |
| `TWILIO_MAX_RETRIES_429` | `5` | Per-contact retries on rate-limit |
| `TWILIO_MAX_RETRIES_5XX` | `2` | Per-contact retries on transient server errors |
| `TWILIO_BACKOFF_BASE_MS` | `1000` | Backoff doubles each attempt |
| `TWILIO_BACKOFF_MAX_MS` | `30000` | Cap on backoff per attempt |
| `MAX_RECIPIENTS_PER_JOB` | `500000` | Hard cap per job (set to 0 for unlimited) |
| `SAFE_TEST_MODE` | `false` | When `true`, caps job at 100 / mps 5 / concurrency 2 |

## CSV Format

```csv
phone,name,city
+1234567890,John Doe,Austin
+1987654321,Jane Smith,Boston
```

Any extra column is automatically available as a personalization variable, e.g. `{name}` or `{city}` in the message body, or as a ContentVariable when using a template.

## Code of Conduct

Your safety and comfort are important to us. The Code of Conduct lets everyone know what's expected, so we can do a better job of interacting with one another. All contributions to and interactions with Twilio's open-source projects have to adhere to our Code of Conduct. You can report violations at open-source@twilio.com.

[Read the Code of Conduct](https://github.com/twilio-labs/.github/blob/master/CODE_OF_CONDUCT.md)

## License

MIT License

