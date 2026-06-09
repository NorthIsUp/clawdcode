import { describe, expect, test } from "bun:test";
import { buildCoalescedHookPrompt } from "../commands/start";
import type { QueuedMessage } from "../hookQueue";

function msg(over: Partial<QueuedMessage>): QueuedMessage {
  return {
    id: "d1",
    threadId: "job:hook:pr-1-x",
    jobName: "job",
    event: "pull_request",
    scope: "pr-1-x",
    payload: null,
    enqueuedAt: 0,
    status: "pending",
    attempts: 0,
    notBefore: 0,
    prRepo: null,
    prNumber: null,
    outcome: null,
    error: null,
    updatedAt: 0,
    ...over,
  };
}

describe("buildCoalescedHookPrompt — web:message branch (spec §8)", () => {
  test("single web:message renders raw payload.text, not a hook summary", () => {
    const out = buildCoalescedHookPrompt(
      "JOB-PROMPT",
      "pr-1-x",
      [msg({ event: "web:message", payload: { type: "user-message", text: "ship it please" } })],
    );
    expect(out).toContain("ship it please");
    expect(out).not.toContain("Triggered by");
    // No multi-event header for a single message.
    expect(out).not.toContain("new events on scope");
    expect(out.trim().endsWith("JOB-PROMPT")).toBe(true);
  });

  test("web:message with missing text renders an empty block (no crash)", () => {
    const out = buildCoalescedHookPrompt("P", "s", [msg({ event: "web:message", payload: {} })]);
    expect(out).not.toContain("Triggered by");
    expect(out).toContain("P");
  });

  test("a normal hook message still renders a Triggered-by summary", () => {
    const out = buildCoalescedHookPrompt(
      "P",
      "pr-1-x",
      [msg({ event: "pull_request", payload: { action: "opened" } })],
    );
    expect(out).toContain("Triggered by GitHub pull_request");
  });

  test("mixed batch: web:message text + a hook summary coalesced with header", () => {
    const out = buildCoalescedHookPrompt("P", "pr-1-x", [
      msg({ id: "a", event: "web:message", payload: { type: "user-message", text: "hello" } }),
      msg({ id: "b", event: "pull_request", payload: { action: "synchronize" } }),
    ]);
    expect(out).toContain("new events on scope `pr-1-x`");
    expect(out).toContain("hello");
    expect(out).toContain("Triggered by GitHub pull_request");
  });
});

describe("buildCoalescedHookPrompt — resume vs new session", () => {
  test("new session (default) includes the full routine prompt", () => {
    const out = buildCoalescedHookPrompt(
      "ROUTINE-INSTRUCTIONS",
      "pr-1-x",
      [msg({ event: "pull_request", payload: { action: "opened" } })],
      true,
    );
    expect(out).toContain("Triggered by GitHub pull_request");
    expect(out.trim().endsWith("ROUTINE-INSTRUCTIONS")).toBe(true);
  });

  test("resume keeps the new-event details but DROPS the routine prompt", () => {
    const out = buildCoalescedHookPrompt(
      "ROUTINE-INSTRUCTIONS",
      "pr-1-x",
      [msg({ event: "pull_request_review_comment", payload: { action: "created" } })],
      false,
    );
    // The real event context is still present...
    expect(out).toContain("Triggered by GitHub pull_request_review_comment");
    expect(out).toContain("with the context you already have");
    // ...but the routine boilerplate is NOT re-sent.
    expect(out).not.toContain("ROUTINE-INSTRUCTIONS");
  });

  test("resume with multiple events uses the plural nudge", () => {
    const out = buildCoalescedHookPrompt(
      "P",
      "pr-1-x",
      [
        msg({ id: "a", event: "pull_request", payload: { action: "synchronize" } }),
        msg({ id: "b", event: "pull_request_review_comment", payload: { action: "created" } }),
      ],
      false,
    );
    expect(out).toContain("2 new events on `pr-1-x`");
    expect(out).not.toContain("P\n");
  });
});
