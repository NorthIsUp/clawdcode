import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outdir = "dist/web";
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

// Pre-process Tailwind CSS (Darwin UI uses @import "tailwindcss" which Bun can't handle natively)
const twBin = join("node_modules", ".bin", "tailwindcss");
const twResult = spawnSync(
  twBin,
  ["-i", "web/styles/darwin.css", "-o", "web/styles/darwin.gen.css"],
  { encoding: "utf8" },
);
if (twResult.status !== 0) {
  console.error("Tailwind CSS build failed:", twResult.stderr);
  process.exit(1);
}

const result = await Bun.build({
  entrypoints: ["web/index.tsx"],
  outdir,
  target: "browser",
  format: "esm",
  splitting: false,
  minify: process.env.NODE_ENV === "production",
  naming: { chunk: "[name]-[hash].[ext]" },
  loader: { ".css": "css" },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Bun emits <stem>.js + <stem>.css using the entrypoint filename as the stem.
// Our entrypoint is web/index.tsx so we get index.js + index.css.
// Rename to app.js / app.css so the HTML <link> + <script> resolve correctly.
const jsOut = result.outputs.find((o) => o.path.endsWith(".js"));
const cssOut = result.outputs.find((o) => o.path.endsWith(".css"));

if (jsOut) await rename(jsOut.path, `${outdir}/app.js`);
if (cssOut) await rename(cssOut.path, `${outdir}/app.css`);

// Copy index.html as-is (it already references /app.css and /app.js).
const html = await readFile("web/index.html", "utf8");
await writeFile(`${outdir}/index.html`, html, "utf8");

const fileCount = result.outputs.length + 1; // +1 for index.html
console.log(`built ${outdir}/  (${fileCount} files)`);
console.log(`  index.html`);
if (jsOut) console.log(`  app.js`);
if (cssOut) console.log(`  app.css`);
