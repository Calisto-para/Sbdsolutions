# SBD AI Solutions — website

Marketing site for SBD AI Solutions, built with React 19 and Vite. Client-side
routing, a shared header/footer, and one global stylesheet.

## Pages (React Router)

| Route             | Component                    |
| ----------------- | ---------------------------- |
| `/`               | `src/pages/Home.jsx`         |
| `/services`       | `src/pages/Services.jsx`     |
| `/projects`       | `src/pages/Projects.jsx`     |
| `/about`          | `src/pages/About.jsx`        |
| `/who-we-help`    | `src/pages/Clients.jsx`      |
| `/contact`        | `src/pages/Contact.jsx`      |
| `/start-a-project`| `src/pages/StartProject.jsx` |

Old `.html` URLs (`/services.html` and so on) redirect to their new routes in
`src/App.jsx`, so previously shared links keep working.

## Structure

- `src/components/Header.jsx` — navigation, Services / Who We Help dropdowns,
  mobile menu, active-page state.
- `src/components/Footer.jsx` — navy footer with contact channels and year.
- `src/components/ProjectForm.jsx` — enquiry form; posts JSON to FormSubmit,
  which emails the business inbox. Shows inline sending / success / failure.
- `src/components/RouteMeta.jsx` — per-route `<title>` and meta description.
- `src/hooks/useReveal.js` — scroll reveal, respects `prefers-reduced-motion`.
- `styles.css` — the single source of truth for the design system and the
  reference-refresh overrides.
- `public/assets/` — logo mark, hero and building illustrations, served at
  `/assets/...`.

## Commands

```bash
npm install
npm run dev       # Vite dev server on http://localhost:3001
npm run build     # production build into dist/
npm run preview   # serve the production build
```

## Deploy

`render.yaml` builds with `npm ci && npm run build` and publishes `dist`. A
catch-all rewrite sends every path to `index.html` so client-side routes and
deep links resolve. Pushing to `main` triggers the Render deploy.

## Contact details used on the site

- Calling: +234 812 210 4576
- WhatsApp: +234 906 392 4288
- Email: sbdiam.solutions@gmail.com
