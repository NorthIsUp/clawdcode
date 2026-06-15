import { describe, expect, test } from "bun:test";
import {
  RATE_LIMIT_PATTERN,
  RATE_LIMIT_RESET_PATTERN,
  clearRateLimitDetected,
  extractRateLimitMessage,
  parseRateLimitResetTime,
  recordRateLimit,
  wasRateLimitDetected,
} from "../rate-limit";

describe("RATE_LIMIT_PATTERN — credit/limit detection (queue, don't fail)", () => {
  // The subscription-cap phrasings that were always caught.
  test.each([
    "You've hit your limit · resets 1:50am",
    "you've hit your usage limit",
    "You've hit your session limit",
    "You are out of extra usage for this period",
  ])("subscription cap: %s", (msg) => {
    expect(RATE_LIMIT_PATTERN.test(msg)).toBe(true);
  });

  // The generalized "out of credits" / API-billing phrasings — these used to
  // fall through to fail-after-cap; now they defer-and-queue.
  test.each([
    "Your credit balance is too low to access the Anthropic API",
    "Error: insufficient credits remaining",
    "out of credits",
    "Usage limit reached for this organization",
    "usage limit exceeded",
  ])("credit/billing limit: %s", (msg) => {
    expect(RATE_LIMIT_PATTERN.test(msg)).toBe(true);
  });

  // Ordinary failures must NOT be mistaken for a limit (they should retry/fail
  // on their own backoff, not defer indefinitely waiting for "credits").
  test.each([
    "TypeError: cannot read property 'x' of undefined",
    "fatal: not a git repository",
    "the credit card on file was declined",
  ])("non-limit failure: %s", (msg) => {
    expect(RATE_LIMIT_PATTERN.test(msg)).toBe(false);
  });

  test("extractRateLimitMessage returns the matching stream, else null", () => {
    expect(
      extractRateLimitMessage("Your credit balance is too low", ""),
    ).toContain("credit balance is too low");
    expect(extractRateLimitMessage("all good", "warning: noise")).toBeNull();
  });
});

describe("RATE_LIMIT_RESET_PATTERN — reset time extraction", () => {
  // Bug 1 fix: the pattern must match bare am/pm times WITHOUT requiring "UTC".
  test.each([
    "You've hit your limit · resets 1:50am",
    "resets 3pm",
    "Resets 12:30 AM",
    "Your limit resets 11pm",
  ])("matches bare am/pm time: %s", (msg) => {
    expect(RATE_LIMIT_RESET_PATTERN.test(msg)).toBe(true);
  });

  test("also matches when UTC is present (backwards compat)", () => {
    expect(RATE_LIMIT_RESET_PATTERN.test("resets 3pm (UTC)")).toBe(true);
    expect(RATE_LIMIT_RESET_PATTERN.test("resets 1:50am UTC")).toBe(true);
  });
});

describe("parseRateLimitResetTime — DST-correct Pacific parsing", () => {
  test("returns null when no time in message", () => {
    expect(parseRateLimitResetTime("You've hit your usage limit")).toBeNull();
    expect(parseRateLimitResetTime("")).toBeNull();
  });

  test("returns a future timestamp for 'resets 1:50am'", () => {
    const result = parseRateLimitResetTime("You've hit your limit · resets 1:50am");
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(Date.now());
  });

  // Bug 1 (DST fix): the reset epoch must decode to 1:50 AM in Pacific time,
  // NOT 1:50 AM UTC. Under the old setUTCHours bug, converting back to Pacific
  // would give ~6:50 PM (PDT) or ~5:50 PM (PST) — not 1:50 AM.
  test("'resets 1:50am' parses as Pacific local time, not UTC (DST-correct)", () => {
    const result = parseRateLimitResetTime("Your limit resets 1:50am");
    expect(result).not.toBeNull();

    // Convert the epoch back to America/Los_Angeles to verify the Pacific wall-
    // clock time — should be 01:50 regardless of whether it's PDT or PST today.
    const pacificTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(result!));

    expect(pacificTime).toBe("01:50");
  });

  test("'resets 3pm' parses as 15:00 Pacific, not 15:00 UTC", () => {
    const result = parseRateLimitResetTime("resets 3pm");
    expect(result).not.toBeNull();

    const pacificTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(result!));

    expect(pacificTime).toBe("15:00");
  });

  test("reset time is strictly in the future", () => {
    const now = Date.now();
    // Use a time that is definitely in the past right now, which forces the
    // "advance to next day" branch.
    const result = parseRateLimitResetTime("resets 12:00am"); // midnight
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(now);
  });

  test("am/pm conversion: 12am → 0, 12pm → 12", () => {
    const noon = parseRateLimitResetTime("resets 12pm");
    const midnight = parseRateLimitResetTime("resets 12am");
    expect(noon).not.toBeNull();
    expect(midnight).not.toBeNull();

    const noonPacific = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(noon!));
    const midnightPacific = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(midnight!));

    expect(noonPacific).toBe("12:00");
    expect(midnightPacific).toBe("00:00");
  });
});

describe("recordRateLimit + wasRateLimitDetected", () => {
  test("explicit reset → returns epoch, sets rateLimitResetAt (isRateLimited=true)", () => {
    // We can't directly call isRateLimited here without side effects on the
    // global singleton, but we CAN verify the return value is a future epoch.
    clearRateLimitDetected();
    const msg = "You've hit your usage limit · resets 3pm";
    const result = recordRateLimit(msg);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(Date.now());
    // wasRateLimitDetected must be true after recordRateLimit
    expect(wasRateLimitDetected()).toBe(true);
  });

  // Bug 2 fix: no explicit reset must NOT default to +1 hour.
  test("no parseable reset → returns null (no +1h block)", () => {
    clearRateLimitDetected();
    const msg = "You've hit your usage limit"; // no reset time
    const result = recordRateLimit(msg);
    expect(result).toBeNull();
    // rateLimitResetAt is 0, so isRateLimited() returns false → queue can drain.
    // wasRateLimitDetected lets callers detect the transient condition.
    expect(wasRateLimitDetected()).toBe(true);
  });

  test("clearRateLimitDetected resets the flag", () => {
    recordRateLimit("out of credits");
    expect(wasRateLimitDetected()).toBe(true);
    clearRateLimitDetected();
    expect(wasRateLimitDetected()).toBe(false);
  });

  test("no recordRateLimit call → wasRateLimitDetected is false after clear", () => {
    clearRateLimitDetected();
    expect(wasRateLimitDetected()).toBe(false);
  });
});
