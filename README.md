# SBD AI Solutions — website

Marketing site for SBD AI Solutions, built with React 19 and Vite. Every page is
prerendered to its own HTML file, then hydrated in the browser, so links and
refreshes work on any static host.

## Pages

| URL                   | Component                       |
| --------------------- | ------------------------------- |
| `/`                   | `src/pages/Home.jsx`            |
| `/services.html`      | `src/pages/Services.jsx`        |
| `/projects.html`      | `src/pages/Projects.jsx`        |
| `/about.html`         | `src/pages/About.jsx`           |
| `/who-we-help.html`   | `src/pages/Clients.jsx`         |
| `/contact.html`       | `src/pages/Contact.jsx`         |
| `/start-a-project.html` | `src/pages/StartProject.jsx`  |

Extensionless paths (`/services`, `/about`, …) redirect to their `.html` route
in-app. The old site used the same `.html` URLs, so existing links still work.

## How the build works

1. `vite build` compiles the app; `src/index.html` is the source entry.
2. `src/prerender.jsx` renders each route to static HTML with its own title,
   description and canonical URL.
3. `scripts/copy-to-root.mjs` mirrors the output into the repository root.

The Render static site publishes the repository root without running a build
(its publish path is `.`), so the generated `index.html`, per-page `.html`
files and `assets/` bundle are committed. `npm run build` regenerates them —
run it before committing any source change, and never edit the generated
`*.html` or `assets/` files at the root by hand.

If the Render service is later switched to a managed Blueprint with
`buildCommand: npm ci && npm run build` and `staticPublishPath: dist` (already
described in `render.yaml`), the root copies become unnecessary but harmless.

## Structure

- `src/components/Header.jsx` — navigation, Services / Who We Help dropdowns,
  mobile menu, active-page state.
- `src/components/Footer.jsx` — navy footer with contact channels and year.
- `src/components/ProjectForm.jsx` — enquiry form; posts JSON to FormSubmit,
  which emails the business inbox, with inline sending / success / failure.
- `src/components/RouteMeta.jsx` + `src/meta.js` — per-route title and
  description, shared with the prerender step.
- `src/hooks/useReveal.js` — scroll reveal, respects `prefers-reduced-motion`.
- `styles.css` — the single source of truth for the design system and the
  reference-refresh overrides.
- `public/assets/` — logo mark, hero and building illustrations.

## Commands

```bash
npm install
npm run dev       # Vite dev server, preview at /src/index.html
npm run build     # build + prerender + publish to repo root
npm run preview   # serve the production build in dist/
```

## Contact details used on the site

- Calling: +234 812 210 4576
- WhatsApp: +234 906 392 4288
- Email: sbdiam.solutions@gmail.com
