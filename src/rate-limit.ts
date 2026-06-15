// Rate-limit singleton state + detection helpers, extracted from runner.ts.
//
// Behavior-preserving: the module-level `rateLimitResetAt` / `rateLimitNotified`
// pair is a process-global singleton exactly as it was when inlined in runner.ts.
// Callers in runner.ts read/write it through these helpers.

// Any "you can't run right now because of capacity/billing" signal — a
// subscription usage cap OR a depleted API credit balance. All of these mean the
// SAME thing for the queue: don't fail the work and burn its retry budget; defer
// it and try again once the limit/balance recovers (the queue uses the parsed
// reset time, or falls back to ~1h via recordRateLimit). Broadened from the
// original subscription-only phrasing so genuine "out of credits" API errors
// queue-until-funded instead of failing after the retry cap.
export const RATE_LIMIT_PATTERN =
  /you(?:'|')ve hit your (?:usage |session )?limit|out of extra usage|usage limit (?:reached|exceeded)|credit balance is too low|insufficient credits|out of credits|billing.{0,20}(?:hard limit|quota) reached/i;

// Match a wall-clock reset time embedded in a rate-limit message.
// Examples: "resets 1:50am", "resets 3pm", "resets 12:30 AM"
// The timezone indicator (UTC, PDT, etc.) is optional and intentionally ignored —
// Anthropic rate-limit messages report times in America/Los_Angeles (Pacific), and
// parseRateLimitResetTime converts using the real DST-aware Pacific offset.
export const RATE_LIMIT_RESET_PATTERN = /resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

// --- Rate limit state ---
let rateLimitResetAt: number = 0; // epoch ms; 0 = not rate-limited
let rateLimitNotified: boolean = false;
/** Set to true inside recordRateLimit(); cleared by clearRateLimitDetected().
 *  Lets callers know whether the most-recent run hit a rate-limit message. */
let rateLimitDetectedLastRun: boolean = false;

/**
 * Parse a wall-clock reset time out of a rate-limit message and return the
 * corresponding UTC epoch in ms, treating the time as America/Los_Angeles
 * (Pacific, DST-aware). Returns null when no time is found.
 *
 * DST correctness: uses Intl.DateTimeFormat to determine the real Pacific
 * UTC-offset for the current moment (PDT = UTC-7 in summer, PST = UTC-8 in
 * winter) rather than hardcoding either value.
 */
export function parseRateLimitResetTime(text: string): number | null {
  const match = text.match(RATE_LIMIT_RESET_PATTERN);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const ampm = match[3]?.toLowerCase();

  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;

  const now = new Date();

  // Get the current date/time as seen in America/Los_Angeles so we know:
  //   (a) which calendar day to use for the reset, and
  //   (b) the real DST-aware Pacific offset (PDT = UTC-7, PST = UTC-8).
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string): number =>
    Number(fmt.find((p) => p.type === type)?.value ?? "0");

  const pacYear = get("year");
  const pacMonth = get("month") - 1; // 0-based
  const pacDay = get("day");
  const pacHour = get("hour") % 24; // Intl can emit "24" for midnight
  const pacMin = get("minute");

  // Compute the Pacific UTC-offset in ms by comparing "fake UTC now" (treating
  // the Pacific wall-clock time as if it were UTC) against the real UTC epoch:
  //   PDT (UTC-7):  fakeUtcNow - realUtcNow = -7 * 3_600_000
  //   PST (UTC-8):  fakeUtcNow - realUtcNow = -8 * 3_600_000
  const fakeUtcNow = Date.UTC(pacYear, pacMonth, pacDay, pacHour, pacMin, 0, 0);
  const pacificOffsetMs = fakeUtcNow - now.getTime();

  // Build the reset instant: start from the same Pacific calendar day, apply
  // the parsed hour/minute, then subtract the offset to get real UTC.
  const fakeUtcReset = Date.UTC(pacYear, pacMonth, pacDay, hours, minutes, 0, 0);
  let resetMs = fakeUtcReset - pacificOffsetMs;

  // If that time has already passed today, advance to the same time tomorrow.
  if (resetMs <= now.getTime()) {
    resetMs += 24 * 60 * 60_000;
  }
  return resetMs;
}

export function isRateLimited(): boolean {
  if (rateLimitResetAt === 0) return false;
  if (Date.now() >= rateLimitResetAt) {
    rateLimitResetAt = 0;
    rateLimitNotified = false;
    return false;
  }
  return true;
}

export function getRateLimitResetAt(): number {
  return rateLimitResetAt;
}

export function wasRateLimitNotified(): boolean {
  return rateLimitNotified;
}

export function markRateLimitNotified(): void {
  rateLimitNotified = true;
}

/**
 * Record a freshly-detected rate limit: parse the reset time out of the
 * message and set rateLimitResetAt when the API gave an explicit time.
 * When no reset time is parseable, rateLimitResetAt is left at 0 (not
 * rate-limited at the module level) so the queue falls through to its own
 * short exponential backoff instead of blocking for an hour.
 *
 * Returns the parsed reset epoch ms, or null when no reset time was found.
 * Marks rateLimitDetectedLastRun so callers can distinguish "transient rate
 * limit, no explicit reset" from "ordinary failure".
 */
export function recordRateLimit(message: string): number | null {
  const resetTime = parseRateLimitResetTime(message);
  rateLimitResetAt = resetTime ?? 0;
  rateLimitDetectedLastRun = true;
  rateLimitNotified = false;
  return resetTime;
}

/**
 * Reset the per-run detection flag. Call this at the START of each queued-
 * batch run so wasRateLimitDetected() accurately reflects only the current run.
 */
export function clearRateLimitDetected(): void {
  rateLimitDetectedLastRun = false;
}

/**
 * True when recordRateLimit() was called since the last clearRateLimitDetected().
 * Combined with !isRateLimited(), this identifies a "transient rate limit":
 * a rate-limit message was emitted but the API gave no explicit reset time,
 * so the queue should use short exponential backoff (not a 1-hour defer).
 */
export function wasRateLimitDetected(): boolean {
  return rateLimitDetectedLastRun;
}

export function extractRateLimitMessage(stdout: string, stderr: string): string | null {
  const candidates = [stdout, stderr];
  for (const text of candidates) {
    const trimmed = text.trim();
    if (trimmed && RATE_LIMIT_PATTERN.test(trimmed)) return trimmed;
  }
  return null;
}
