import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outRoot = "dist/web";
await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });

// Pre-process Tailwind CSS for the Darwin bundle (Darwin UI uses
// @import "tailwindcss" which Bun can't handle natively).
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

interface Bundle {
  /** Subdir under dist/web/ */
  name: string;
  /** Entrypoint file */
  entry: string;
  /** HTML template path */
  html: string;
}

const bundles: Bundle[] = [
  { name: "darwin", entry: "web/index.tsx", html: "web/index.html" },
  { name: "os9", entry: "web/os9/index.tsx", html: "web/os9/index.html" },
];

for (const bundle of bundles) {
  const outdir = `${outRoot}/${bundle.name}`;
  await mkdir(outdir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [bundle.entry],
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

  const jsOut = result.outputs.find((o) => o.path.endsWith(".js"));
  const cssOut = result.outputs.find((o) => o.path.endsWith(".css"));
  if (jsOut) await rename(jsOut.path, `${outdir}/app.js`);
  if (cssOut) await rename(cssOut.path, `${outdir}/app.css`);

  const html = await readFile(bundle.html, "utf8");
  await writeFile(`${outdir}/index.html`, html, "utf8");

  console.log(`built ${outdir}/`);
  console.log(`  index.html`);
  if (jsOut) console.log(`  app.js`);
  if (cssOut) console.log(`  app.css`);
}
