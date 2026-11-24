/* The Render static site publishes the repository root without running a build,
   so the production output is mirrored out of dist/ into the root here. */
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const ROOT = process.cwd();

const pages = fs.readdirSync(DIST).filter((file) => file.endsWith(".html"));

fs.rmSync(path.join(ROOT, "assets"), { recursive: true, force: true });
fs.cpSync(path.join(DIST, "assets"), path.join(ROOT, "assets"), { recursive: true });

for (const file of pages) {
  fs.copyFileSync(path.join(DIST, file), path.join(ROOT, file));
}

for (const file of ["sbd-solutions-icon.png"]) {
  const from = path.join(DIST, file);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(ROOT, file));
}

console.log(`published ${pages.length} pages and ${fs.readdirSync(path.join(ROOT, "assets")).length} assets to the repo root`);
