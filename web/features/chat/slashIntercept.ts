/**
 * Pure helpers for client-side slash command interception.
 * Ported from src/ui/page/script.ts: parseLoopArgs, prettyCron,
 * tryClientSlashCommand.
 */

// ---------------------------------------------------------------------------
// parseLoopArgs
// ---------------------------------------------------------------------------

export interface ParseLoopSuccess {
  ok: true;
  cron: string;
  prompt: string;
}
export interface ParseLoopFailure {
  ok: false;
  error: string;
}
export type ParseLoopResult = ParseLoopSuccess | ParseLoopFailure;

/**
 * Parse the argument string from "/loop <arg>".
 * Accepts:
 *   - Nm  → every N minutes (1–1440)
 *   - Nh  → every N hours (1–24)
 *   - Nd  → every N days (1–30)
 *   - "0 * * * *"  (quoted 5-field cron)
 */
export function parseLoopArgs(input: string): ParseLoopResult {
  const s = String(input ?? "").trim();
  if (!s) {
    return {
      ok: false,
      error: "Usage: /loop <interval> <prompt> — e.g. /loop 5m write a haiku",
    };
  }

  let cron: string;
  let prompt: string;

  // Quoted raw cron: starts with double-quote
  if (s.charAt(0) === '"') {
    const closeQ = s.indexOf('"', 1);
    if (closeQ === -1)
      return { ok: false, error: "Unclosed quote in cron expression" };
    cron = s.slice(1, closeQ).trim();
    prompt = s.slice(closeQ + 1).trim();
    const parts = cron.split(/\s+/);
    if (parts.length !== 5)
      return {
        ok: false,
        error: `Quoted cron must have 5 fields, got: "${cron}"`,
      };
  } else {
    // Interval token is the first whitespace-delimited word
    const spIdx = s.search(/\s/);
    let token: string;
    let rest: string;
    if (spIdx === -1) {
      token = s;
      rest = "";
    } else {
      token = s.slice(0, spIdx);
      rest = s.slice(spIdx + 1).trim();
    }
    prompt = rest;

    const mMatch = /^(\d+)m$/.exec(token);
    const hMatch = /^(\d+)h$/.exec(token);
    const dMatch = /^(\d+)d$/.exec(token);
    if (mMatch) {
      const nm = parseInt(mMatch[1] ?? "0", 10);
      if (nm < 1 || nm > 1440)
        return { ok: false, error: "Minutes interval must be 1–1440" };
      cron = `*/${nm} * * * *`;
    } else if (hMatch) {
      const nh = parseInt(hMatch[1] ?? "0", 10);
      if (nh < 1 || nh > 24)
        return { ok: false, error: "Hours interval must be 1–24" };
      cron = `0 */${nh} * * *`;
    } else if (dMatch) {
      const nd = parseInt(dMatch[1] ?? "0", 10);
      if (nd < 1 || nd > 30)
        return { ok: false, error: "Days interval must be 1–30" };
      cron = `0 0 */${nd} * *`;
    } else {
      return {
        ok: false,
        error: `Unrecognised interval "${token}". Use Nm, Nh, Nd or a quoted 5-field cron.`,
      };
    }
  }

  if (!prompt)
    return { ok: false, error: "No prompt provided after the interval" };
  return { ok: true, cron, prompt };
}

// ---------------------------------------------------------------------------
// prettyCron
// ---------------------------------------------------------------------------

/**
 * Pretty-print a cron string for display in system bubbles.
 * Ported from src/ui/page/script.ts `prettyCron`.
 */
export function prettyCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [p0, p1, p2] = parts;
  const mMatch = p0 != null ? /^\*\/(\d+)$/.exec(p0) : null;
  const hMatch = p1 != null ? /^\*\/(\d+)$/.exec(p1) : null;
  const dMatch = p2 != null ? /^\*\/(\d+)$/.exec(p2) : null;
  if (mMatch && p1 === "*" && p2 === "*") return `every ${mMatch[1]} min`;
  if (hMatch && p0 === "0" && p2 === "*") return `every ${hMatch[1]}h`;
  if (dMatch && p0 === "0" && p1 === "0") return `every ${dMatch[1]}d`;
  return `cron: ${cron}`;
}

// ---------------------------------------------------------------------------
// isClientSlashCommand / parseClientSlashCommand
// ---------------------------------------------------------------------------

export type ClientSlashCommandName = "goal" | "loop" | "model" | "effort";

export interface ParsedClientSlashCommand {
  name: ClientSlashCommandName;
  /** Everything after the command name, trimmed. */
  arg: string;
}

/**
 * Returns true if `text` is a client-intercepted slash command.
 * Matches: /goal, /goal <arg>, /loop ..., /model ..., /effort ...
 */
export function isClientSlashCommand(text: string): boolean {
  const t = text.trim();
  return (
    t === "/goal" ||
    t.startsWith("/goal ") ||
    t === "/loop" ||
    t.startsWith("/loop ") ||
    t === "/model" ||
    t.startsWith("/model ") ||
    t === "/effort" ||
    t.startsWith("/effort ")
  );
}

/**
 * Parse a client slash command from the input text.
 * Returns null if the text is not a recognised client command.
 */
export function parseClientSlashCommand(
  text: string,
): ParsedClientSlashCommand | null {
  const t = text.trim();
  if (t === "/goal" || t.startsWith("/goal ")) {
    return { name: "goal", arg: t.slice(5).trim() };
  }
  if (t === "/loop" || t.startsWith("/loop ")) {
    return { name: "loop", arg: t.slice(5).trim() };
  }
  if (t === "/model" || t.startsWith("/model ")) {
    return { name: "model", arg: t.slice(6).trim() };
  }
  if (t === "/effort" || t.startsWith("/effort ")) {
    return { name: "effort", arg: t.slice(7).trim() };
  }
  return null;
}
