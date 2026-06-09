import { describe, expect, test } from "bun:test";
// The web mirror MUST agree with the backend schema — import both and assert.
import * as webMirror from "../../web/ui/hookConfig";
import { readFrontmatter, writeFrontmatter } from "../../web/ui/schedule";
import {
  defaultGitHubTriggers,
  type GitHubTriggers,
  gitHubTriggersToHookConfig,
  type HookConfig,
  hookConfigToGitHubTriggers,
  summarizeGitHubTriggers,
} from "../hooks/schema";

/** Build a matrix from the 4 booleans + defaults, for terse cases. */
function matrix(
  hPr: boolean,
  hC: boolean,
  bPr: boolean,
  bC: boolean,
  over: Partial<GitHubTriggers> = {},
): GitHubTriggers {
  return {
    humans: { prUpdates: hPr, comments: hC },
    bots: { prUpdates: bPr, comments: bC },
    advanced: { base: ["!main"], labels: [], draft: false, repo: ["*/*"] },
    skipSelf: true,
    ...over,
  };
}

describe("gitHubTriggersToHookConfig — matrix → HookConfig", () => {
  test("easy defaults: humans PR+comments, bots off", () => {
    const cfg = gitHubTriggersToHookConfig(defaultGitHubTriggers());
    expect(cfg).not.toBeNull();
    expect(cfg?.pr).toEqual([
      {
        repo: "*/*",
        user: ["*", "!*[bot]"],
        action: ["opened", "synchronize", "reopened"],
        branch: ["!main"],
        labels: [],
        draft: false,
      },
    ]);
    expect(cfg?.comments).toEqual({ user: ["*", "!*[bot]"] });
    expect(cfg?.skipSelf).toBe(true);
  });

  test("both classes checked → a single `*` rule + comments true", () => {
    const cfg = gitHubTriggersToHookConfig(matrix(true, true, true, true));
    expect(cfg?.pr).toHaveLength(1);
    expect(cfg?.pr[0]?.user).toEqual(["*"]);
    expect(cfg?.comments).toBe(true);
  });

  test("bots-only PR updates → `*[bot]` glob, no comments", () => {
    const cfg = gitHubTriggersToHookConfig(matrix(false, false, true, false));
    expect(cfg?.pr[0]?.user).toEqual(["*[bot]"]);
    expect(cfg?.comments).toBeUndefined();
  });

  test("everything off → null (drop the on: block)", () => {
    expect(gitHubTriggersToHookConfig(matrix(false, false, false, false))).toBeNull();
  });

  test("skipSelf false is carried verbatim", () => {
    const cfg = gitHubTriggersToHookConfig(matrix(true, false, false, false, { skipSelf: false }));
    expect(cfg?.skipSelf).toBe(false);
  });
});

describe("round-trip stability: matrix → config → matrix", () => {
  // Every 2×2 combination of the 4 checkboxes.
  for (let bits = 0; bits < 16; bits++) {
    const hPr = !!(bits & 1);
    const hC = !!(bits & 2);
    const bPr = !!(bits & 4);
    const bC = !!(bits & 8);
    test(`combo h.pr=${hPr} h.c=${hC} b.pr=${bPr} b.c=${bC}`, () => {
      const m = matrix(hPr, hC, bPr, bC);
      const cfg = gitHubTriggersToHookConfig(m);
      const { matrix: back, representable } = hookConfigToGitHubTriggers(cfg);
      expect(representable).toBe(true);
      expect(back.humans).toEqual(m.humans);
      expect(back.bots).toEqual(m.bots);
      expect(back.skipSelf).toBe(m.skipSelf);
      // Advanced survives only when a PR rule exists to carry it; with no PR
      // row the projection legitimately resets to defaults.
      if (hPr || bPr) expect(back.advanced).toEqual(m.advanced);
    });
  }

  test("advanced fields survive the round-trip when a PR rule exists", () => {
    const m = matrix(true, false, false, false, {
      advanced: { base: ["release/*", "!main"], labels: ["ready"], draft: "any", repo: ["me/*"] },
    });
    const cfg = gitHubTriggersToHookConfig(m);
    const { matrix: back, representable } = hookConfigToGitHubTriggers(cfg);
    expect(representable).toBe(true);
    expect(back.advanced).toEqual(m.advanced);
  });
});

describe("hookConfigToGitHubTriggers — representability", () => {
  test("null config → empty matrix, representable", () => {
    const { matrix: m, representable } = hookConfigToGitHubTriggers(null);
    expect(representable).toBe(true);
    expect(m.humans).toEqual({ prUpdates: false, comments: false });
    expect(m.bots).toEqual({ prUpdates: false, comments: false });
  });

  test("two PR rules → NOT representable", () => {
    const cfg: HookConfig = {
      pr: [
        {
          repo: "a/b",
          user: ["*"],
          action: ["opened", "synchronize", "reopened"],
          branch: ["*"],
          labels: [],
          draft: false,
        },
        {
          repo: "c/d",
          user: ["*"],
          action: ["opened", "synchronize", "reopened"],
          branch: ["*"],
          labels: [],
          draft: false,
        },
      ],
      skipSelf: true,
    };
    expect(hookConfigToGitHubTriggers(cfg).representable).toBe(false);
  });

  test("non-default action set → NOT representable", () => {
    const cfg: HookConfig = {
      pr: [
        { repo: "*/*", user: ["*"], action: ["closed"], branch: ["*"], labels: [], draft: false },
      ],
      skipSelf: true,
    };
    expect(hookConfigToGitHubTriggers(cfg).representable).toBe(false);
  });

  test("default action set, order-insensitive → representable", () => {
    const cfg: HookConfig = {
      pr: [
        {
          repo: "*/*",
          user: ["*"],
          action: ["reopened", "opened", "synchronize"],
          branch: ["*"],
          labels: [],
          draft: false,
        },
      ],
      skipSelf: true,
    };
    expect(hookConfigToGitHubTriggers(cfg).representable).toBe(true);
  });

  test("bespoke user glob → NOT representable", () => {
    const cfg: HookConfig = {
      pr: [
        {
          repo: "*/*",
          user: ["alice", "!bob"],
          action: ["opened", "synchronize", "reopened"],
          branch: ["*"],
          labels: [],
          draft: false,
        },
      ],
      skipSelf: true,
    };
    expect(hookConfigToGitHubTriggers(cfg).representable).toBe(false);
  });

  test("comment filter that isn't a class glob → NOT representable", () => {
    const cfg: HookConfig = { pr: [], comments: { user: ["specific-bot"] }, skipSelf: true };
    expect(hookConfigToGitHubTriggers(cfg).representable).toBe(false);
  });

  test("sentry/datadog present → NOT representable", () => {
    const cfg: HookConfig = { pr: [], comments: true, sentry: true, skipSelf: true };
    expect(hookConfigToGitHubTriggers(cfg).representable).toBe(false);
  });
});

describe("frontmatter round-trip through the .md `on:` block", () => {
  const SEED = `---
model: opus
effort: high
on:
  - schedule: "0 9 * * *"
---
Routine body stays put.
`;

  // matrix → config → writeFrontmatter → readFrontmatter → config → matrix
  for (let bits = 0; bits < 16; bits++) {
    const hPr = !!(bits & 1);
    const hC = !!(bits & 2);
    const bPr = !!(bits & 4);
    const bC = !!(bits & 8);
    test(`yaml stable for h.pr=${hPr} h.c=${hC} b.pr=${bPr} b.c=${bC}`, () => {
      const m = matrix(hPr, hC, bPr, bC);
      const cfg = gitHubTriggersToHookConfig(m);
      const written = writeFrontmatter(SEED, { schedules: [], hookConfig: cfg });
      // unrelated keys + body preserved
      expect(written).toContain("model: opus");
      expect(written).toContain("Routine body stays put.");

      const read = readFrontmatter(written);
      const { matrix: back, representable } = hookConfigToGitHubTriggers(read.hookConfig);
      expect(representable).toBe(true);
      expect(back.humans).toEqual(m.humans);
      expect(back.bots).toEqual(m.bots);
    });
  }

  test("easy defaults serialize to the spec's `on:` block (pr + comments)", () => {
    const cfg = gitHubTriggersToHookConfig(defaultGitHubTriggers());
    const written = writeFrontmatter(SEED, { schedules: [], hookConfig: cfg });
    expect(written).toContain("user");
    expect(written).toMatch(/pr:/);
    expect(written).toMatch(/comments:/);
    // skip_self is the default → omitted.
    expect(written).not.toContain("skip_self");
  });

  test("skip_self: false is emitted when disabled", () => {
    const m = matrix(true, false, false, false, { skipSelf: false });
    const cfg = gitHubTriggersToHookConfig(m);
    const written = writeFrontmatter(SEED, { schedules: [], hookConfig: cfg });
    expect(written).toContain("skip_self: false");
  });
});

describe("web mirror agrees with the backend schema", () => {
  const cases: GitHubTriggers[] = [
    defaultGitHubTriggers(),
    matrix(true, true, true, true),
    matrix(false, false, true, false),
    matrix(true, false, false, true, { skipSelf: false }),
  ];
  test("gitHubTriggersToHookConfig identical across both copies", () => {
    for (const m of cases) {
      expect(webMirror.gitHubTriggersToHookConfig(m as never)).toEqual(
        gitHubTriggersToHookConfig(m) as never,
      );
    }
  });
  test("summarizeGitHubTriggers identical across both copies", () => {
    for (const m of cases) {
      expect(webMirror.summarizeGitHubTriggers(m as never)).toBe(summarizeGitHubTriggers(m));
    }
  });
});

describe("summarizeGitHubTriggers", () => {
  test("humans both categories", () => {
    expect(summarizeGitHubTriggers(defaultGitHubTriggers())).toBe(
      "Fires on PR updates and comments from humans.",
    );
  });
  test("anyone PR only", () => {
    expect(summarizeGitHubTriggers(matrix(true, false, true, false))).toBe(
      "Fires on PR updates from anyone.",
    );
  });
  test("nothing", () => {
    expect(summarizeGitHubTriggers(matrix(false, false, false, false))).toBe("No GitHub triggers.");
  });
  test("advanced non-default branch appends a clause", () => {
    const m = matrix(true, false, false, false, {
      advanced: { base: ["release/*"], labels: [], draft: false, repo: ["*/*"] },
    });
    expect(summarizeGitHubTriggers(m)).toContain("targeting release/*");
  });
});
