import { existsSync } from "fs";
import { join } from "path";
import { getJobsRepoDirForRepo, getSettings, slugForRepo } from "./config";
import { discoverPlugins } from "./jobsRepoPlugins";

/**
 * errandd `@`-imports for routine/job MD files.
 *
 * A routine prompt can reference shared MD files with these forms — none of
 * which force the author to know the daemon's internal path layout:
 *   - `@<repo>/<path>/<file>.md`   — <repo> is a known jobsRepo slug or plugin
 *     name → resolve <path>/<file>.md WITHIN that repo/plugin's dir.
 *   - `@<plugin>/<name>/<file>.md` — same "leading segment is a known name"
 *     shape (plugin names are registered alongside repo slugs).
 *   - `@<path>/<file>.md`          — leading segment is NOT a known name →
 *     resolve relative to the CURRENT repo/plugin ROOT (the job's `sourceDir`).
 *   - `@./<file>.md`, `@../<path>/<file>.md` — resolve relative to the
 *     REFERENCING FILE's own directory. Since routine files load flat from
 *     `sourceDir`, that directory IS `sourceDir`, so `@../shared/x.md` from a
 *     routine reaches `<sourceDir>/../shared/x.md`.
 *
 * We REWRITE each resolvable ref to a concrete absolute path (`@/abs/.../file.md`)
 * and let Claude Code's own `@file` include mechanism do the actual inlining —
 * the least-surprising option, and the same mechanism the legacy
 * `@~/.claude/errandd/jobs/*.md` symlink scheme already relies on.
 *
 * Backcompat ONLY: `@~/...` and `@/abs/...` are left untouched (the CLI already
 * resolves them), but they leak the daemon's path layout — prefer the
 * namespaced/relative forms above. A ref that doesn't resolve to an existing
 * file is left untouched too — a typo'd include must never crash a routine.
 */

/**
 * Match an `@`-import ref. We only touch refs ending in `.md` (the routine
 * include use case) so we never mangle `@mentions`, npm scopes (`@org/pkg`),
 * decorators, or email addresses. The leading boundary (start / whitespace /
 * open bracket) is captured so it can be preserved on rewrite.
 */
const AT_IMPORT_RE = /(^|[\s([])@([A-Za-z0-9._~/-]+\.md)(?=$|[\s).,;:\]])/g;

export interface ImportRegistry {
  /** Known name (jobsRepo slug or plugin name) → its absolute base dir. */
  names: Map<string, string>;
}

/**
 * Build the registry of known repo/plugin names → their absolute dirs.
 * jobsRepo slugs are registered first, then discovered plugins; on a name
 * collision the first registered wins (repos before plugins) so resolution is
 * deterministic. Best-effort throughout — before settings load (tests, early
 * boot) it simply yields fewer/zero known names, and the current-repo fallback
 * still works.
 */
export async function buildImportRegistry(): Promise<ImportRegistry> {
  const names = new Map<string, string>();
  try {
    for (const repo of getSettings().jobsRepos) {
      if (!repo.url) continue;
      const slug = repo.slug ?? slugForRepo(repo.url);
      if (!names.has(slug)) names.set(slug, getJobsRepoDirForRepo(repo));
    }
  } catch {
    /* settings not loaded — no known repos, current-repo fallback still applies */
  }
  try {
    for (const plugin of await discoverPlugins()) {
      if (!names.has(plugin.name)) names.set(plugin.name, plugin.dir);
    }
  } catch {
    /* plugin discovery is best-effort */
  }
  return { names };
}

/**
 * Rewrite errandd `@`-imports in a routine prompt to concrete absolute paths.
 * Pure over (prompt, sourceDir, registry) plus filesystem existence checks —
 * see the module doc for the resolution rules.
 */
export function expandAtImports(
  prompt: string,
  sourceDir: string | undefined,
  registry: ImportRegistry,
): string {
  return prompt.replace(AT_IMPORT_RE, (match: string, lead: string, ref: string) => {
    // Backcompat: home-relative / absolute refs already resolve via the CLI.
    if (ref.startsWith("~") || ref.startsWith("/")) return match;

    const parts = ref.split("/").filter(Boolean);
    const first = parts[0] ?? "";
    // `@./x` and `@../x` are explicit relative refs — resolve against the
    // referencing file's dir (= sourceDir), never against the known-name
    // registry (a `.`/`..` segment can't be a repo/plugin name anyway).
    const isRelative = first === "." || first === "..";

    let resolved: string | undefined;
    const knownBase = isRelative ? undefined : registry.names.get(first);
    if (knownBase && parts.length > 1) {
      // `@<repo>/<rest>.md` → resolve <rest> within the named repo/plugin dir.
      resolved = join(knownBase, ...parts.slice(1));
    } else if (sourceDir) {
      // Either an explicit `@./`|`@../` relative ref (against the referencing
      // file's dir) or a bare `@<path>.md` (against the current repo root) —
      // both anchor on sourceDir; `join` normalizes any `.`/`..` segments.
      resolved = join(sourceDir, ...parts);
    }

    // Only rewrite when the target actually exists; otherwise leave the ref
    // untouched so a bad include is visible rather than silently swallowed.
    if (resolved && existsSync(resolved)) return `${lead}@${resolved}`;
    return match;
  });
}
