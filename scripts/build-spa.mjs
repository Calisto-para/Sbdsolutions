/* After `vite build`, publish the single-page app shell:
   - dist/index.html is the React entry for every clean route
   - legacy .html paths get the same shell, so old links still boot the app
   - the same files are mirrored to the repo root, which a static host serves */
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const ROOT = process.cwd();

const LEGACY_PAGES = [
  "services",
  "pricing",
  "projects",
  "about",
  "who-we-help",
  "contact",
  "start-a-project",
  "register",
  "login",
  "forgot-password",
  "reset-password",
  "verify-email",
  "dashboard",
];

const source = path.join(DIST, "src/index.html");
if (!fs.existsSync(source)) {
  console.error("dist/src/index.html is missing — did the Vite build run?");
  process.exit(1);
}

const shell = fs.readFileSync(source, "utf8");
fs.writeFileSync(path.join(DIST, "index.html"), shell);
for (const page of LEGACY_PAGES) {
  fs.writeFileSync(path.join(DIST, `${page}.html`), shell);
}
fs.rmSync(path.join(DIST, "src"), { recursive: true, force: true });

/* Mirror to the repository root for hosts that publish it without a build. */
const published = ["index.html", ...fs.readdirSync(DIST).filter((file) => file.endsWith(".html"))];
fs.rmSync(path.join(ROOT, "assets"), { recursive: true, force: true });
fs.cpSync(path.join(DIST, "assets"), path.join(ROOT, "assets"), { recursive: true });
for (const file of new Set(published)) {
  fs.copyFileSync(path.join(DIST, file), path.join(ROOT, file));
}
for (const file of fs.readdirSync(DIST).filter((name) => name.endsWith(".html"))) {
  fs.copyFileSync(path.join(DIST, file), path.join(ROOT, file));
}
/* Root-level files from public/ (icons) need mirroring too. */
for (const file of ["sbd-solutions-icon.png", "sbd-ai-solutions-icon.png"]) {
  if (fs.existsSync(path.join(DIST, file))) {
    fs.copyFileSync(path.join(DIST, file), path.join(ROOT, file));
  }
}

console.log(`published SPA shell + ${LEGACY_PAGES.length} legacy aliases to dist/ and the repo root`);
