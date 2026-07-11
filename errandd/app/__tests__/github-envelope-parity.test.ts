import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  __resetDeliveryStoreForTests,
  recentDeliveries,
} from "../hooks/deliveries";
import { handleWebhook } from "../hooks/receiver";
import { parseTriggers } from "../hooks/schema";
import type { Job } from "../jobs";

/**
 * GitHub-fold parity: GitHub now rides the shared `webhookEnvelope` path (its
 * bespoke `handleWebhook` was killed and re-expressed as a `WebhookSpec` with
 * `evaluate: "match"` + a `preRecord` CI-drop). These tests lock the behaviors
 * that must NOT regress across the fold: header-based identity derivation, ping
 * handling, `dispatchHook` fan-out (the signal `prLifecycle` runs off), the
 * non-terminal-CI early-drop, and signed-attempt recording.
 */

// Deterministic self-login so skipSelf is exact (no `gh` spawn).
const SELF = "errandd-bot";
let prevSelf: string | undefined;
beforeAll(() => {
  prevSelf = process.env.ERRANDD_SELF_LOGIN;
  process.env.ERRANDD_SELF_LOGIN = SELF;
});
afterAll(() => {
  if (prevSelf === undefined) {
    delete process.env.ERRANDD_SELF_LOGIN;
  } else {
    process.env.ERRANDD_SELF_LOGIN = prevSelf;
  }
});
afterEach(() => __resetDeliveryStoreForTests());

let seq = 0;
function ghRequest(
  event: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  seq += 1;
  return new Request("http://local/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": `parity-${seq}-${event}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeJob(name: string, on: unknown[]): Job {
  const { schedules, hookConfig } = parseTriggers(on, undefined);
  return {
    name,
    schedules,
    prompt: "do the thing",
    recurring: false,
    notify: true,
    reuseSession: false,
    ...(hookConfig ? { hookConfig } : {}),
  };
}

describe("github fold — identity derivation", () => {
  test("derives event + id from x-github-event / x-github-delivery headers", async () => {
    const req = ghRequest("pull_request", { action: "opened", sender: { login: "human" } });
    const res = await handleWebhook(req, {});
    expect(res.status).toBe(200);
    const rec = recentDeliveries()[0];
    expect(rec?.event).toBe("pull_request");
    expect(rec?.id).toMatch(/^parity-\d+-pull_request$/);
    // Enriched with the github source tag by dispatchHook (evaluate: "match").
    // No deps here → no evaluation recorded, but source is normalized on record.
    expect(rec?.source).toBe("github");
  });

  test("missing delivery header falls back to a local-* id", async () => {
    const req = new Request("http://local/api/webhooks/github", {
      method: "POST",
      headers: { "content-type": "application/json", "x-github-event": "push" },
      body: "{}",
    });
    await handleWebhook(req, {});
    const rec = recentDeliveries()[0];
    expect(rec?.id).toMatch(/^local-/);
  });
});

describe("github fold — ping", () => {
  test("ping is acknowledged 200 and recorded without a no-routine sentinel", async () => {
    const fired: string[] = [];
    const res = await handleWebhook(ghRequest("ping", { zen: "hi" }), {
      getJobs: () => [makeJob("j", [{ prs: true }])],
      onHookFire: (n: string) => {
        fired.push(n);
      },
    });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(fired).toEqual([]);
    const rec = recentDeliveries().find((d) => d.event === "ping");
    expect(rec).toBeDefined();
    // ping records an evaluation with NO routine rows (not the "(no routine)" sentinel).
    expect(rec?.routines ?? []).toEqual([]);
  });
});

describe("github fold — dispatchHook fan-out (prLifecycle signal)", () => {
  test("a matching PR fires onHookFire with (job, event, deliveryId, payload)", async () => {
    const calls: { name: string; event: string; id: string; payload: unknown }[] = [];
    const req = ghRequest("pull_request", {
      action: "opened",
      sender: { login: "human" },
      pull_request: {
        number: 7,
        user: { login: "human" },
        base: { ref: "main" },
        head: { ref: "feat/x" },
        draft: false,
        labels: [],
      },
      repository: { full_name: "org/repo" },
    });
    const res = await handleWebhook(req, {
      getJobs: () => [makeJob("pr-bot", [{ pr: { repo: "org/repo", user: ["*"] } }])],
      onHookFire: (name: string, event: string, id: string, payload: unknown) => {
        calls.push({ name, event, id, payload });
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.matched).toEqual(["pr-bot"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("pr-bot");
    expect(calls[0].event).toBe("pull_request");
    expect(calls[0].id).toMatch(/^parity-\d+-pull_request$/);
    // The full payload is threaded through (what buildPrLifecyclePrompt reads).
    expect((calls[0].payload as { pull_request: { number: number } }).pull_request.number).toBe(7);
    // dispatchHook recorded the evaluation (source github, trigger row).
    const rec = recentDeliveries().find((d) => d.id === calls[0].id);
    expect(rec?.source).toBe("github");
    expect(rec?.routines).toEqual([{ job: "pr-bot", outcome: "trigger" }]);
  });

  test("self-authored PR is skipped (skipSelf), no fire", async () => {
    const fired: string[] = [];
    await handleWebhook(
      ghRequest("pull_request", {
        action: "opened",
        sender: { login: SELF },
        pull_request: {
          number: 8,
          user: { login: SELF },
          base: { ref: "main" },
          head: { ref: "x" },
          draft: false,
          labels: [],
        },
        repository: { full_name: "org/repo" },
      }),
      {
        getJobs: () => [makeJob("pr-bot", [{ pr: { repo: "org/repo", user: ["*"] } }])],
        onHookFire: (n: string) => {
          fired.push(n);
        },
      },
    );
    expect(fired).toEqual([]);
  });
});

describe("github fold — non-terminal CI early-drop (preRecord)", () => {
  test("a check_run that isn't completed is dropped before recording", async () => {
    const res = await handleWebhook(
      ghRequest("check_run", { action: "created", check_run: { status: "in_progress" } }),
      { getJobs: () => [], onHookFire: () => {} },
    );
    expect(res).toEqual({ status: 200, body: { ok: true } });
    // Nothing recorded — the drop happens before recordDelivery.
    expect(recentDeliveries().some((d) => d.event === "check_run")).toBe(false);
  });

  test("a completed check_run IS recorded", async () => {
    await handleWebhook(
      ghRequest("check_run", {
        action: "completed",
        check_run: { status: "completed", conclusion: "failure", name: "ci" },
        repository: { full_name: "org/repo" },
      }),
      { getJobs: () => [], onHookFire: () => {} },
    );
    expect(recentDeliveries().some((d) => d.event === "check_run")).toBe(true);
  });
});

describe("github fold — signed-attempt recording", () => {
  test("bad signature → 401 and a bad-signature ring entry", async () => {
    const prev = process.env.ERRANDD_GITHUB_WEBHOOK_SECRET;
    process.env.ERRANDD_GITHUB_WEBHOOK_SECRET = "s3cret";
    try {
      const res = await handleWebhook(
        ghRequest("push", { ref: "refs/heads/main" }, { "x-hub-signature-256": "sha256=deadbeef" }),
        {},
      );
      expect(res.status).toBe(401);
      expect(recentDeliveries().some((d) => d.status === "bad-signature")).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.ERRANDD_GITHUB_WEBHOOK_SECRET;
      } else {
        process.env.ERRANDD_GITHUB_WEBHOOK_SECRET = prev;
      }
    }
  });

  test("a correct sha256= signature passes through the shared envelope", async () => {
    const prev = process.env.ERRANDD_GITHUB_WEBHOOK_SECRET;
    process.env.ERRANDD_GITHUB_WEBHOOK_SECRET = "s3cret";
    try {
      const body = JSON.stringify({ ref: "refs/heads/main" });
      const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
      const req = new Request("http://local/api/webhooks/github", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-github-delivery": "parity-signed-push",
          "x-hub-signature-256": sig,
        },
        body,
      });
      const res = await handleWebhook(req, {});
      expect(res.status).toBe(200);
      expect(recentDeliveries().some((d) => d.id === "parity-signed-push")).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.ERRANDD_GITHUB_WEBHOOK_SECRET;
      } else {
        process.env.ERRANDD_GITHUB_WEBHOOK_SECRET = prev;
      }
    }
  });
});
