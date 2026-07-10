// Pi stream → normalized RuntimeStreamHandlers adapter.
//
// This is the ONE place Pi's stdout is translated into the runtime-neutral
// RuntimeBlock / RuntimeStreamHandlers union (the same union ClaudeRuntime
// produces). Unlike Claude, Pi is not wired through parseClaudeStream — that
// core is hard-coded to Claude's stream-json schema (`assistant`/`user`/
// `result` with a `message.content` envelope). Pi owns its own NDJSON reader
// here so the two schemas never bleed into each other.
//
// ponytail: Pi is not installed in this environment and ships no frozen
// `--format jsonl` schema doc, so the exact wire field names below are an
// ASSUMED contract, modeled on Pi's in-process message model (content is a
// string or an array of `{type,text}` / tool parts; lifecycle events include
// `agent_end`). The parser is deliberately tolerant of the common naming
// variants (session_id/sessionId, tool_use/tool_call, tool_use_id/
// tool_call_id/toolUseId, is_error/isError, input/arguments) so that when
// Pi's real stream lands the mapping needs at most a field tweak, not a
// rewrite. Anything unrecognized is skipped, exactly like the Claude core.

import type { RuntimeBlock, RuntimeStreamHandlers } from "../types";

/** A loosely-typed Pi NDJSON event. Fields vary by `type`. */
type PiEvent = {
  type?: string;
  session_id?: unknown;
  sessionId?: unknown;
  message?: { id?: unknown; content?: unknown } & Record<string, unknown>;
  content?: unknown;
  text?: unknown;
  result?: unknown;
  tool_use_id?: unknown;
  tool_call_id?: unknown;
  toolUseId?: unknown;
  is_error?: unknown;
  isError?: unknown;
  usage?: unknown;
} & Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const firstStr = (...vs: unknown[]): string => {
  for (const v of vs) if (typeof v === "string" && v) return v;
  return "";
};
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Session id can ride on top-level or nested variants. */
function readSessionId(e: PiEvent): string {
  return firstStr(e.session_id, e.sessionId, e.message?.session_id);
}

/** Peak live-context tokens from a `usage` object, if Pi reports one. Pi's
 *  capability flag is `reportsContextTokens: false`, so this is best-effort;
 *  absent usage ⇒ 0 ⇒ size-based auto-compaction never fires. */
function readContextTokens(e: PiEvent): number {
  const u = rec(e.usage);
  const num = (k: string) => (typeof u[k] === "number" ? u[k] : 0);
  return num("input_tokens") + num("cache_read_input_tokens") + num("cache_creation_input_tokens");
}

/** Map a Pi content-part array → normalized RuntimeBlocks. */
function mapBlocks(content: unknown): RuntimeBlock[] {
  const mapped: RuntimeBlock[] = [];
  if (typeof content === "string") {
    // Some Pi messages carry a bare string body rather than a parts array.
    if (content) mapped.push({ type: "text", text: content });
    return mapped;
  }
  if (!Array.isArray(content)) return mapped;
  for (const raw of content) {
    const b = rec(raw);
    const t = str(b.type);
    if (t === "text") {
      mapped.push({ type: "text", text: str(b.text) });
    } else if (t === "tool_use" || t === "tool_call") {
      mapped.push({
        type: "tool_use",
        id: firstStr(b.id, b.tool_use_id, b.tool_call_id),
        name: str(b.name),
        // Pi may name the args field `input` or `arguments`.
        input: rec(b.input ?? b.arguments),
      });
    }
  }
  return mapped;
}

/** Dispatch one already-parsed Pi event to the normalized handlers. Exported
 *  for the stream check (so it can be exercised without a real subprocess). */
export async function dispatchPiEvent(e: PiEvent, h: RuntimeStreamHandlers): Promise<void> {
  const type = str(e.type);
  switch (type) {
    case "session":
    case "session_start":
    case "init": {
      const id = readSessionId(e);
      if (id) await h.onSession?.(id);
      return;
    }
    case "assistant":
    case "message": {
      if (!h.onAssistant) return;
      const msg = rec(e.message);
      const content = "message" in e ? msg.content : (e.content ?? e.text);
      const msgId = firstStr(msg.id, e.id);
      await h.onAssistant(mapBlocks(content), msgId);
      return;
    }
    case "tool_result": {
      if (!h.onToolResult) return;
      const id = firstStr(e.tool_use_id, e.tool_call_id, e.toolUseId);
      const isError = e.is_error === true || e.isError === true;
      // Pass the RAW content (string | array) — each consumer extracts its own.
      await h.onToolResult(id, e.content ?? e.result, isError);
      return;
    }
    case "tool_use":
    case "tool_call": {
      // Bare top-level tool event: only a UI-unblock hint, no payload.
      await h.onToolUseHint?.();
      return;
    }
    case "result":
    case "agent_end": {
      if (!h.onResult) return;
      await h.onResult({
        text: firstStr(e.result, e.text),
        sessionId: readSessionId(e) || undefined,
        contextTokens: readContextTokens(e),
      });
      return;
    }
    default:
      // Unknown event type — ignore, mirroring the Claude core's silent skip.
      return;
  }
}

/**
 * Read Pi's stdout as NDJSON, parse each line, and dispatch to the normalized
 * handlers. Owns the read loop / line buffering / JSON.parse; swallows per-line
 * parse errors and per-handler throws so one bad line never aborts the stream
 * (same contract as parseClaudeStream). Returns at stdout EOF.
 */
export async function parsePiRuntimeStream(
  stdout: ReadableStream<Uint8Array>,
  h: RuntimeStreamHandlers,
): Promise<void> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const flush = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: PiEvent;
    try {
      event = JSON.parse(trimmed) as PiEvent;
    } catch {
      return;
    }
    try {
      await dispatchPiEvent(event, h);
    } catch {
      // A throwing handler for one line must not abort the whole stream.
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) await flush(line);
  }
  // Flush a trailing line with no final newline — unlike Claude's stream, Pi's
  // terminal event isn't guaranteed to end with "\n", so don't drop it.
  await flush(buf);
}
