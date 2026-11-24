# SBD AI Solutions — website and customer platform

The public marketing site plus the customer platform: accounts, a private
dashboard, AI assistant creation, training and testing. React 19 + Vite on the
front, Express + Postgres on the back, OpenAI for assistant replies.

## Public pages

| URL                     | Component                     |
| ----------------------- | ----------------------------- |
| `/`                     | `src/pages/Home.jsx`          |
| `/services.html`        | `src/pages/Services.jsx`      |
| `/projects.html`        | `src/pages/Projects.jsx`      |
| `/about.html`           | `src/pages/About.jsx`         |
| `/who-we-help.html`     | `src/pages/Clients.jsx`       |
| `/contact.html`         | `src/pages/Contact.jsx`       |
| `/start-a-project.html` | `src/pages/StartProject.jsx`  |

## Customer platform

| URL                        | Component |
| -------------------------- | --------- |
| `/register.html`           | `src/pages/auth/Register.jsx` |
| `/login.html`              | `src/pages/auth/Login.jsx` |
| `/forgot-password.html`    | `src/pages/auth/ForgotPassword.jsx` |
| `/reset-password.html`     | `src/pages/auth/ResetPassword.jsx` |
| `/verify-email.html`       | `src/pages/auth/VerifyEmail.jsx` |
| `/dashboard.html`          | `src/pages/dashboard/Dashboard.jsx` |

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
| `APP_URL` | public origin, used in verification and reset links |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | assistant replies (default `gpt-4o-mini`) |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | verification and reset email |

## Build and hosting

`npm run build` builds the app, prerenders every route to its own `.html` file
and copies the output to the repository root (the current Render static site
publishes the repo root and runs no build). Run it before committing any
source change; never hand-edit the generated root `*.html` or `assets/`.

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

## Contact details used on the site

- Calling: +234 812 210 4576
- WhatsApp: +234 906 392 4288
- Email: sbdiam.solutions@gmail.com
