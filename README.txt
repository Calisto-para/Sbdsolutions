SBD SOLUTIONS — WEBSITE

A static marketing site for SBD Solutions, built with plain HTML, CSS and a
small shared JavaScript file. No build step, no dependencies.

PAGES
- index.html      Home: positioning, services, process, credibility, CTA
- services.html   Three service areas in depth with engagement details
- work.html       Deliverables, engagement models and delivery standards
- about.html      Company positioning, mission, vision, values and process
- clients.html    Who SBD Solutions serves and how engagements start
- contact.html    Contact channels, enquiry form and FAQs

Removed in the 2026 redesign: trust.html, future.html and start-project.html.
Their content was either internal planning copy or duplicated contact.html.

DESIGN SYSTEM
- styles.css is the single source of truth: colour tokens, type scale, layout
  and components all live in one documented file.
- Palette: deep ink (#080d17) for dark surfaces, a single blue accent
  (#1f5bea), neutral greys for text and borders. The metallic logo is always
  placed on the dark header or footer where it reads correctly.
- Type: NovaBold (the supplied brand font) for headings, eyebrows and
  numbering; a system sans stack for body copy. No web fonts are fetched.
- script.js handles the mobile navigation, scroll reveal, footer year and the
  enquiry form.

BEHAVIOUR
- Mobile navigation toggle with keyboard (Escape) support.
- Scroll-reveal respects prefers-reduced-motion.
- The enquiry form prepares an email in the visitor's mail client; nothing is
  submitted or stored by the site.
- Every page is responsive from small phones up to wide desktops.

CONTACT DETAILS USED ON THE SITE
Calling: +234 812 210 4576
WhatsApp: +234 906 392 4288
Email: sbdiam.solutions@gmail.com

HOSTING
render.yaml describes a static site: no build command, publish directory "."
Local preview: python3 -m http.server 3000 --bind 0.0.0.0
