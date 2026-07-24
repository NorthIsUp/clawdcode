import { test, expect, describe } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { expandAtImports, type ImportRegistry } from "../atImports";

/** Build a throwaway tree: a jobsRepo `repoA`, a plugin `plug`, and a
 *  "current repo" `cur`, each seeded with a shared MD file. Returns the
 *  registry (repoA + plug) and the current-repo dir. */
async function fixture(): Promise<{
  root: string;
  cur: string;
  registry: ImportRegistry;
}> {
  const root = await mkdtemp(join(tmpdir(), "atimports-"));
  const repoA = join(root, "repos", "repoA");
  const plug = join(root, "plugins", "plug");
  const cur = join(root, "repos", "cur");

  await mkdir(join(repoA, "shared"), { recursive: true });
  await writeFile(join(repoA, "shared", "helper.md"), "# repoA helper\n");

  await mkdir(join(plug, "prompts"), { recursive: true });
  await writeFile(join(plug, "prompts", "review.md"), "# plug review\n");

  await mkdir(join(cur, "lib"), { recursive: true });
  await writeFile(join(cur, "lib", "local.md"), "# cur local\n");
  await writeFile(join(cur, "top.md"), "# cur top\n");

  const registry: ImportRegistry = {
    names: new Map([
      ["repoA", repoA],
      ["plug", plug],
    ]),
  };
  return { root, cur, registry };
}

describe("expandAtImports", () => {
  test("@repo/path/file.md → resolves within the named jobsRepo", async () => {
    const { root, cur, registry } = await fixture();
    try {
      const out = expandAtImports("see @repoA/shared/helper.md now", cur, registry);
      const repoA = registry.names.get("repoA")!;
      expect(out).toBe(`see @${join(repoA, "shared", "helper.md")} now`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("@plugin/path/file.md → resolves within the named plugin", async () => {
    const { root, cur, registry } = await fixture();
    try {
      const out = expandAtImports("run @plug/prompts/review.md", cur, registry);
      const plug = registry.names.get("plug")!;
      expect(out).toBe(`run @${join(plug, "prompts", "review.md")}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("@path/file.md with unknown leading segment → resolves relative to current repo", async () => {
    const { root, cur, registry } = await fixture();
    try {
      const out = expandAtImports("include @lib/local.md here", cur, registry);
      expect(out).toBe(`include @${join(cur, "lib", "local.md")} here`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("bare @file.md (no slash) → resolves relative to current repo", async () => {
    const { root, cur, registry } = await fixture();
    try {
      const out = expandAtImports("@top.md", cur, registry);
      expect(out).toBe(`@${join(cur, "top.md")}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("@./file.md → relative to the referencing file's directory", async () => {
    const { root, cur, registry } = await fixture();
    try {
      const out = expandAtImports("preamble @./top.md end", cur, registry);
      expect(out).toBe(`preamble @${join(cur, "top.md")} end`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("@../path/file.md → relative to the referencing file's directory (can escape root)", async () => {
    const { root, cur, registry } = await fixture();
    try {
      // cur is <root>/repos/cur; repoA is <root>/repos/repoA, so
      // @../repoA/shared/helper.md from cur reaches repoA's file.
      const out = expandAtImports("@../repoA/shared/helper.md", cur, registry);
      const repoA = registry.names.get("repoA")!;
      expect(out).toBe(`@${join(repoA, "shared", "helper.md")}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("@./ never hits the known-name registry", async () => {
    const { root, cur, registry } = await fixture();
    try {
      // `@./lib/local.md` resolves against cur, not any repo named "." (none).
      const out = expandAtImports("@./lib/local.md", cur, registry);
      expect(out).toBe(`@${join(cur, "lib", "local.md")}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("backcompat: @~/... and @/abs/... are left untouched", async () => {
    const { root, cur, registry } = await fixture();
    try {
      const input = "old @~/.claude/errandd/jobs/pull-request.md and @/etc/thing.md";
      expect(expandAtImports(input, cur, registry)).toBe(input);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("not found → ref left untouched (never crashes a routine)", async () => {
    const { root, cur, registry } = await fixture();
    try {
      // Known repo prefix but missing file → untouched.
      expect(expandAtImports("@repoA/nope.md", cur, registry)).toBe("@repoA/nope.md");
      // Unknown prefix, missing current-repo file → untouched.
      expect(expandAtImports("@ghost/missing.md", cur, registry)).toBe("@ghost/missing.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("does not mangle non-.md @tokens (mentions, npm scopes)", async () => {
    const { root, cur, registry } = await fixture();
    try {
      const input = "ping @alice and install @org/pkg — email a@b.md";
      // @alice / @org/pkg lack a .md suffix; `a@b.md` has no leading boundary.
      expect(expandAtImports(input, cur, registry)).toBe(input);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("known-name resolution wins over current-repo path", async () => {
    const { root, cur, registry } = await fixture();
    try {
      // `repoA` is a known name AND cur has no repoA/ subdir → resolves in repoA.
      const out = expandAtImports("@repoA/shared/helper.md", cur, registry);
      const repoA = registry.names.get("repoA")!;
      expect(out).toBe(`@${join(repoA, "shared", "helper.md")}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("no sourceDir + unknown prefix → untouched", async () => {
    const { root, registry } = await fixture();
    try {
      expect(expandAtImports("@lib/local.md", undefined, registry)).toBe("@lib/local.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
