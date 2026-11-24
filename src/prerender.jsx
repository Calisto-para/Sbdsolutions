import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import App from "./App";
import { META } from "./meta";

const DIST = path.resolve("dist");
const template = fs.readFileSync(path.join(DIST, "src/index.html"), "utf8");

const escape = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

for (const route of Object.keys(META)) {
  const meta = META[route];
  const markup = renderToString(
    <StaticRouter location={route}>
      <App />
    </StaticRouter>
  );

  const canonical = `https://sbdsolutions.onrender.com${route === "/" ? "/" : route}`;
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(meta.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="${escape(meta.description)}">`
    )
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`)
    .replace('<div id="root"></div>', `<div id="root">${markup}</div>`);

  const file = route === "/" ? "index.html" : route.slice(1);
  fs.writeFileSync(path.join(DIST, file), html);
  console.log(`prerendered ${route} -> dist/${file} (${html.length} bytes)`);
}

fs.rmSync(path.join(DIST, "src/index.html"));
