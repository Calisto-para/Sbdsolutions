# SBD Solutions — website and customer platform

The public marketing site plus the customer platform: accounts, a private
dashboard, AI assistant creation, training and testing. React 19 + Vite on the
front, Express + Postgres on the back, OpenAI for assistant replies.

## Public pages

| URL                     | Component                     |
| ----------------------- | ----------------------------- |
| `/`                     | `src/pages/Home.jsx`          |
| `/services`            | `src/pages/Services.jsx`      |
| `/projects`        | `src/pages/Projects.jsx`      |
| `/about`           | `src/pages/About.jsx`         |
| `/who-we-help`     | `src/pages/Clients.jsx`       |
| `/contact`         | `src/pages/Contact.jsx`       |
| `/start-a-project` | `src/pages/StartProject.jsx`  |

## Customer platform

| URL                        | Component |
| -------------------------- | --------- |
| `/register`           | `src/pages/auth/Register.jsx` |
| `/login`              | `src/pages/auth/Login.jsx` |
| `/forgot-password`    | `src/pages/auth/ForgotPassword.jsx` |
| `/reset-password`     | `src/pages/auth/ResetPassword.jsx` |
| `/verify-email`       | `src/pages/auth/VerifyEmail.jsx` |
| `/dashboard`          | `src/pages/dashboard/Dashboard.jsx` |

The dashboard has five sections, switched with the `?tab=` query parameter so
every URL is a real file (no rewrite rules needed):

- `?tab=overview` — account statistics and recent activity
- `?tab=business` — My Business profile, used by the assistants
- `?tab=assistants` — create and manage assistants
- `?tab=assistant&id=<uuid>` — workspace: AI training, Test chat, settings
- `?tab=conversations` — all conversations with transcripts
- `?tab=settings` — profile, password and preferences

### API

`server/` is an Express app. All data is scoped to the signed-in user.

- `POST /api/auth/register|login|logout|verify-email|resend-verification|forgot-password|reset-password`
- `GET /api/auth/me`, `PATCH /api/auth/profile`, `PATCH /api/auth/password`
- `GET|PUT /api/business`
- `GET|POST /api/assistants`, `GET|PATCH|DELETE /api/assistants/:id`
- `GET|POST /api/assistants/:id/knowledge`, `POST /api/assistants/:id/knowledge/pdf`,
  `PATCH|DELETE /api/assistants/:id/knowledge/:itemId`
- `POST /api/assistants/:id/chat`, `GET /api/assistants/:id/conversations`
- `GET /api/conversations`, `GET|DELETE /api/conversations/:id`
- `GET /api/overview`, `GET /api/health`

Sessions are signed, http-only cookies (7 days). Passwords are bcrypt hashed.
Email verification and password reset tokens are random, hashed at rest and
expire (24 hours / 1 hour).

Schema lives in `server/schema.sql` and is applied idempotently at boot.

## Running locally

```bash
npm install
npm run api      # Express + embedded PGlite on :3002
npm run dev      # Vite on :3001, proxies /api to :3002
```

Without `DATABASE_URL` the server uses an embedded Postgres (PGlite) in
`.data/pglite`, so registration and chat work end to end offline. With SMTP
unset, verification and reset links are logged and shown on screen instead of
being emailed.

End-to-end check (needs the API running and a fake OpenAI base URL):

```bash
node scripts/smoke-platform.mjs http://127.0.0.1:3002
```

## Environment

Copy `.env.example` to `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (`?sslmode=require`) |
| `SESSION_SECRET` | long random string used to sign sessions |
| `APP_URL` | public origin, used in verification and reset links — in production it must be the live site, because a localhost value would email links customers cannot open (Render's `RENDER_EXTERNAL_URL` is used automatically when `APP_URL` is unset or local) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | assistant replies (default `gpt-4o-mini`) |
| `BREVO_API_KEY` | Brevo API key — the default transactional sender |
| `RESEND_API_KEY` | Resend API key — used if Brevo fails or is not set |
| `EMAIL_PROVIDER` | `brevo` (default), `resend` or `smtp` — which provider is tried first |
| `MAIL_FROM`, `MAIL_REPLY_TO` | sender identity and reply-to for verification and reset email |
| `SMTP_HOST/PORT/USER/PASS` | optional SMTP fallback, used only when no API key is set |
| `ADMIN_EMAILS` | comma-separated accounts allowed into the unlisted operator area at `/admin` |

### Operator area

The operations dashboard lives at `/admin`. It is not linked from the website or
from the customer dashboard, is served with `noindex`, and its API (`/api/admin`)
answers 404 to anything that is not an admin session — signed-in clients only see
the normal "page does not exist" screen.

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are the operator login: on boot the app
creates that account if it does not exist, marks it verified and admin, and
resets its password to whatever `ADMIN_PASSWORD` currently holds — so changing
the variable in Render is also the way to recover a lost operator password.
`ADMIN_NAME` sets its display name. `ADMIN_EMAILS` adds further operator
addresses, which sign in with their own existing password. An existing admin can
also promote or demote another account from the Customers tab. The area shows account totals,
newest signups, a searchable customer list with each customer's assistants and
conversations, and every conversation started on the platform.

### Customer platform features

- **Website chatbot** — every assistant has a public key and a one-line install
  snippet (`/widget.js`, served by the Node app). Customers set the chatbot
  name, brand colour, bubble position and welcome message in the dashboard's
  **Website Chatbot** tab, preview it, copy the code and paste it into their
  site. The embed renders its own scoped markup and styles, so it cannot clash
  with the host page, and it refuses to render for a paused assistant.
- **Lead collection** — the assistant asks website visitors for their name,
  email, phone and what they need. Details typed in ordinary sentences are
  extracted server-side, and the widget also offers a "leave my details" form.
  One lead is kept per conversation and enriched as more details arrive; the
  **Leads** tab lists them all with search.
- **Conversations** — website and dashboard chats in one place, searchable by
  message, visitor or email, filterable by status and assistant. Customers can
  read the full transcript, mark a chat resolved or reopen it, take it over from
  the assistant, and reply as the team. The widget polls the public conversation
  endpoint, so a visitor sees the team's replies and the assistant stops
  answering once a person takes over.
- **Subscriptions** — Starter (USD 100/month, 200 messages, 1 assistant),
  Professional (USD 200/month, 2,000 messages, 3 assistants), Business
  (USD 400/month, 10,000 messages, 10 assistants) and Enterprise (custom,
  monthly or agreed billing; chosen with the SBD team over WhatsApp). Prices,
  names and limits live in the `plans` seed in `server/schema.sql` and are kept
  in step on every boot. Customers see their plan, usage against the monthly
  allowances, upgrade/downgrade or cancel, and a payment history. Registering
  does **not** start a paid plan: choosing a plan opens an invoice, and the plan
  activates only when the money is verified. With `PAYSTACK_SECRET_KEY` set the
  checkout hands the customer to Paystack and the server verifies the charge
  instantly; bank transfers are shown from `PAYMENT_BANK_*` and verified by an
  operator in **Admin → Payments** (verify or reject, both one click). Allowances
  are enforced when adding an assistant and when a visitor sends a message.
- **Operator monitoring** — the unlisted `/admin` area adds a **Businesses &
  usage** tab with every business and assistant, weekly activity per day, the
  busiest customers, and suspend/reactivate controls on any non-operator
  account. Suspend blocks sign-in and refuses an existing session immediately;
  reactivating restores both.

### Email delivery

`server/mail.js` sends verification and password-reset email through HTTP APIs,
so no SMTP host is needed:

- **Brevo** (`BREVO_API_KEY`) posts to `https://api.brevo.com/v3/smtp/email`
- **Resend** (`RESEND_API_KEY`) posts to `https://api.resend.com/emails`

`EMAIL_PROVIDER` picks the first attempt; the other configured provider is
tried automatically if that call fails, and SMTP is the last resort. With no
provider configured, links are logged and shown on screen in development.

`MAIL_FROM` must use a domain (or verified sender) the chosen provider allows:
Brevo verifies the sender address in its dashboard, Resend needs a verified
domain for anything other than `onboarding@resend.dev`.

### Why verification email does not arrive

The provider accepts the request and then rejects the message; the API now
returns `emailDelivered: false` with `code: "EMAIL_NOT_SENT"` so the page can
say so instead of telling the customer to check an inbox.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `403 ... domain is not verified` from Resend | Resend only sends from a domain you verified. A free mailbox such as `@gmail.com` can never be verified | Verify a domain at resend.com/domains and set `MAIL_FROM` to it, or switch to Brevo |
| Brevo `401/400 sender not valid` | The sender address is not verified in Brevo | Brevo → Senders & IP → Senders → add and confirm the address |
| Email arrives only for the account owner | Sending from `onboarding@resend.dev` | Fine for testing, but customers need your own verified domain |

Sends through a free mailbox (Gmail, Yahoo, Outlook…) with Resend are logged as
an error at boot, and the operator dashboard's **Email delivery** card checks the
provider live and can send a test message to the operator's own address.

## Build and hosting

`npm run build` builds the React app, writes the single-page shell plus one
`.html` alias per old route, and copies the output to the repository root (a
host that publishes the repo root without building still works). Run it before
committing any source change; never hand-edit the generated root `*.html` or
`assets/`.

Brand artwork lives in `public/assets/`: `sbd-ai-solutions-logo.png` (full
lockup, header and auth pages), `sbd-ai-mark.png` (swirl only, favicon),
`sbd-ai-robot.png` (home hero) and `sbd-office-building.png` (home office
band). `public/sbd-ai-solutions-icon.png` is the app/touch icon used on dark
surfaces such as the footer and dashboard sidebar.

The platform needs a Node server, which a static site cannot run:

1. In Render, change the service to a **Web Service** (or have the Blueprint in
   `render.yaml` apply) with build `npm ci && npm run build`, start `npm start`,
   health check `/api/health`.
2. Add `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `OPENAI_API_KEY` and the
   SMTP settings as environment variables. `render.yaml` lists them.
3. Deploy once, then confirm `/api/health` reports `database: postgres` and
   `aiConfigured: true`.

Until that switch happens the account pages are served by the static host and
show a clear "platform is not connected" message instead of failing silently.

### If a Render deploy fails

The previous failure was `sh: 1: vite: not found`: with `NODE_ENV=production`
set on the service, `npm ci` skips devDependencies, so the build tool was
missing. Vite, its React plugin and PGlite now live in `dependencies`, so a
production install still builds.

Settings to check on the service:

- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Node version: 22.12 or newer (`engines` in `package.json`)
- `DATABASE_URL` set, otherwise the app falls back to an embedded database that
  is wiped on every deploy

The server binds its port before connecting to the database and retries for a
minute, so a slow Neon wake-up no longer fails the deploy. If the build step is
skipped entirely, it serves the prerendered pages committed at the repo root.

## Contact details used on the site

- Calling: +234 812 210 4576
- WhatsApp: +234 906 392 4288
- Email: sbdiam.solutions@gmail.com
