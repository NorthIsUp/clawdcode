// Pi stream → normalized RuntimeStreamHandlers adapter.
//
// This is the ONE place Pi's stdout is translated into the runtime-neutral
// RuntimeBlock / RuntimeStreamHandlers union (the same union ClaudeRuntime
// produces). Pi is not wired through parseClaudeStream — that core is hard-coded
// to Claude's stream-json schema (`assistant`/`user`/`result` with a
// `message.content` envelope). Pi owns its own NDJSON reader here so the two
// schemas never bleed into each other.
//
// Wire format (pi --mode json, "Output all events as JSON lines"), per
// packages/coding-agent/docs/json.md:
//
//   {"type":"session","version":3,"id":"uuid","timestamp":"…","cwd":"/path"}
//   {"type":"agent_start"}
//   {"type":"message_start","message":{…}}
//   {"type":"message_update","message":{…},"assistantMessageEvent":{…}}   ← deltas
//   {"type":"message_end","message":{…}}                                  ← complete
//   {"type":"tool_execution_start","toolCallId":"…","toolName":"…","args":{…}}
//   {"type":"tool_execution_end","toolCallId":"…","result":…,"isError":false}
//   {"type":"agent_end","messages":[…]}
//
// Mapping decisions:
//  - Session id rides the `id` field of the `session` header, not `session_id`.
//  - Text is taken from `message_end` (a complete message), NOT `message_update`
//    (token deltas) — emitting both would double every assistant turn.
//  - Pi emits tool calls as their own lifecycle events rather than as blocks
//    inside the assistant message, so `tool_execution_start` is synthesized into
//    a one-block `tool_use` assistant message. That keeps the runner's existing
//    tool-call summary path working without special-casing Pi.
//  - `agent_end.messages` carries the transcript; the final assistant text is
//    the last assistant message's text.
//
// ponytail: no token usage in Pi's event schema (capabilities.reportsContextTokens
// is false), so contextTokens is always 0 and size-based auto-compaction never
// fires. Pi does emit compaction_* events of its own; it self-manages context.
// Unrecognized events are skipped, exactly like the Claude core.

import type { RuntimeBlock, RuntimeStreamHandlers } from "../types";

/** A loosely-typed Pi NDJSON event. Fields vary by `type`. */
type PiEvent = {
  type?: string;
  id?: unknown;
  message?: unknown;
  messages?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  args?: unknown;
  result?: unknown;
  isError?: unknown;
} & Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Map a Pi AgentMessage's `content` → normalized RuntimeBlocks.
 * Content is either a bare string or an array of parts (`{type:"text",text}`,
 * `{type:"toolCall"|"tool_use",…}`).
 */
function mapBlocks(content: unknown): RuntimeBlock[] {
  const mapped: RuntimeBlock[] = [];
  if (typeof content === "string") {
    if (content) mapped.push({ type: "text", text: content });
    return mapped;
  }
  if (!Array.isArray(content)) return mapped;
  for (const raw of content) {
    const b = rec(raw);
    const t = str(b.type);
    if (t === "text") {
      const text = str(b.text);
      if (text) mapped.push({ type: "text", text });
    } else if (t === "toolCall" || t === "tool_use" || t === "tool_call") {
      mapped.push({
        type: "tool_use",
        id: str(b.toolCallId) || str(b.id),
        name: str(b.toolName) || str(b.name),
        input: rec(b.args ?? b.input),
      });
    }
  }
  return mapped;
}

/** True when an AgentMessage is from the assistant. Pi tags role on the message. */
function isAssistant(msg: Record<string, unknown>): boolean {
  const role = str(msg.role);
  return role === "" || role === "assistant";
}

/** Concatenated text of an AgentMessage. */
function messageText(msg: Record<string, unknown>): string {
  return mapBlocks(msg.content)
    .filter((b): b is Extract<RuntimeBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Dispatch one already-parsed Pi event to the normalized handlers. Exported
 *  for the stream check (so it can be exercised without a real subprocess). */
export async function dispatchPiEvent(e: PiEvent, h: RuntimeStreamHandlers): Promise<void> {
  switch (str(e.type)) {
    case "session": {
      // {"type":"session","version":3,"id":"uuid",…} — id is the session id.
      const id = str(e.id);
      if (id) await h.onSession?.(id);
      return;
    }

    case "message_end": {
      // A complete assistant message. `message_update` carries token deltas for
      // the same message and is intentionally ignored to avoid double-emitting.
      if (!h.onAssistant) return;
      const msg = rec(e.message);
      if (!isAssistant(msg)) return;
      const blocks = mapBlocks(msg.content);
      if (blocks.length) await h.onAssistant(blocks, str(msg.id));
      return;
    }

    case "tool_execution_start": {
      // Pi emits tool calls as lifecycle events, not as blocks in the message.
      // Synthesize the equivalent assistant tool_use block so the runner's
      // tool-call summary path sees the same shape it gets from Claude.
      await h.onToolUseHint?.();
      if (!h.onAssistant) return;
      const id = str(e.toolCallId);
      const name = str(e.toolName);
      if (!id && !name) return;
      await h.onAssistant([{ type: "tool_use", id, name, input: rec(e.args) }], id);
      return;
    }

    case "tool_execution_end": {
      if (!h.onToolResult) return;
      // Pass the RAW result (string | array | object) — each consumer extracts
      // its own text, same contract as the Claude core.
      await h.onToolResult(str(e.toolCallId), e.result, e.isError === true);
      return;
    }

    case "agent_end": {
      if (!h.onResult) return;
      // Final text = last assistant message in the returned transcript.
      const msgs = Array.isArray(e.messages) ? e.messages : [];
      let text = "";
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = rec(msgs[i]);
        if (!isAssistant(msg)) continue;
        const t = messageText(msg);
        if (t) {
          text = t;
          break;
        }
      }
      // ponytail: no usage in Pi's schema ⇒ contextTokens 0 ⇒ size-based
      // auto-compaction never fires (Pi self-compacts; see compaction_* events).
      await h.onResult({ text, contextTokens: 0 });
      return;
    }

    default:
      // Unknown / uninteresting event (agent_start, turn_*, message_start,
      // message_update, queue_update, compaction_*, auto_retry_*) — ignore,
      // mirroring the Claude core's silent skip.
      return;
  }
}

/**
 * Read Pi's stdout as NDJSON, parse each line, and dispatch to the normalized
 * handlers. Owns the read loop / line buffering / JSON.parse; swallows per-line
 * parse errors and per-handler throws so one bad line never aborts the stream
 * (same contract as parseClaudeStream). Returns at stdout EOF.
 *
 * Pi's RPC framing is documented as strict LF-delimited JSONL ("Clients must
 * split records on \n only"), so we split on "\n" and never on "\r".
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
  // Flush a trailing line with no final newline — Pi's terminal event isn't
  // guaranteed to end with "\n", so don't drop it.
  await flush(buf);
}
