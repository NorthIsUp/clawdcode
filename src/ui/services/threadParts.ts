/**
 * Transcript → structured chat parts for the v3 chat pane (spec §6/§7).
 *
 * Resolves a `threadId` to its Claude `sessionId` (via the session manager),
 * reads the session's jsonl transcript, and parses the raw content blocks into
 * the shared `ChatPart[]` union (`web/v3/lib/transcriptParts.ts`). Also exposes
 * a byte-offset `tail()` so the SSE stream can re-parse only the lines appended
 * since the last read.
 *
 * The `ChatPart` shapes are re-declared here (not imported) because `src/` must
 * not depend on `web/` build sources; the two definitions are kept in sync by
 * contract — `web/v3/lib/transcriptParts.ts` is the single source of truth for
 * the frontend and this file mirrors it byte-for-byte at the type level.
 */
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getThreadSession } from "../../sessionManager";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Shared part types (mirror web/v3/lib/transcriptParts.ts) --------------

export type SourceLink = {
  href: string;
  label: string;
  title?: string;
};

export type ToolPart = {
  type: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  toolCallId?: string;
  errorText?: string;
};

export type ChatPart =
  | { kind: "system"; id: string; text: string }
  | { kind: "text"; id: string; role: "user" | "assistant"; markdown: string }
  | { kind: "reasoning"; id: string; markdown: string }
  | { kind: "tool"; id: string; tool: ToolPart }
  | { kind: "sources"; id: string; sources: SourceLink[] };

export type ThreadMessagesResponse = {
  threadId: string;
  parts: ChatPart[];
  total?: number;
};

// ---- jsonl path (matches Claude Code's project-dir sanitizer) --------------

function getProjectDir(): string {
  const sanitized = process.cwd().replace(/[/\\.]/g, "-");
  return join(homedir(), ".claude", "projects", sanitized);
}

/** Resolve a v3 threadId → its jsonl transcript path, or null if unknown. */
export async function resolveThreadFile(
  threadId: string,
): Promise<{ sessionId: string; filePath: string } | null> {
  const session = await getThreadSession(threadId);
  if (!session || !UUID_RE.test(session.sessionId)) return null;
  const filePath = join(getProjectDir(), `${session.sessionId}.jsonl`);
  return { sessionId: session.sessionId, filePath };
}

// ---- raw jsonl line shapes (loose — transcripts evolve) --------------------

interface RawBlock {
  type?: string;
  text?: string;
  thinking?: string;
  // tool_use
  id?: string;
  name?: string;
  input?: unknown;
  // tool_result
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface RawEntry {
  type?: string;
  uuid?: string;
  message?: { role?: string; content?: unknown };
}

/** Pending tool_use awaiting its tool_result, keyed by tool_use id. */
type PendingTool = { partIndex: number; tool: ToolPart };

/**
 * Strip ClawdCode-injected prefix blocks from a user turn so the pane shows
 * the operator's actual text. Mirrors the cleanup in services/sessions.ts.
 */
function cleanUserText(raw: string): string {
  return raw
    .replace(/^\[[\d-]+ [\d:]+ UTC[^\]]*\]\n/m, "")
    .replace(/^\[(?:WhatsApp|Slack|Discord)[^\]]*\]\n/m, "")
    .replace(/^## Slack Directives[\s\S]*?(?=\n[A-Z\[]|\n$)/m, "")
    .trim();
}

/** Flatten a tool_result `content` (string | block[]) to plain text. */
function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "string" ? b : typeof b?.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/**
 * Incremental parser state. `parse()` feeds lines through this so the same
 * code serves both the full snapshot and the streaming tail (open tool_use
 * blocks from an earlier batch still pair with results in a later batch).
 */
export class TranscriptParser {
  readonly parts: ChatPart[] = [];
  private pendingTools = new Map<string, PendingTool>();
  private lineIndex = 0;

  /** Feed raw jsonl text; appends new parts to `this.parts`. Returns the
   *  parts produced/updated by this batch (snapshot uses `this.parts`). */
  feed(text: string): void {
    for (const line of text.split("\n")) {
      this.feedLine(line);
    }
  }

  private feedLine(line: string): void {
    const idx = this.lineIndex++;
    const trimmed = line.trim();
    if (!trimmed) return;
    let entry: RawEntry;
    try {
      entry = JSON.parse(trimmed) as RawEntry;
    } catch {
      return;
    }
    if (entry.type === "user") {
      this.handleUser(entry, idx);
    } else if (entry.type === "assistant") {
      this.handleAssistant(entry, idx);
    }
  }

  private handleUser(entry: RawEntry, idx: number): void {
    const content = entry.message?.content;
    if (typeof content === "string") {
      const text = cleanUserText(content);
      if (text) this.parts.push({ kind: "text", id: `${idx}:0`, role: "user", markdown: text });
      return;
    }
    if (!Array.isArray(content)) return;
    // First, resolve any tool_result blocks against open tool_use parts.
    for (const b of content as RawBlock[]) {
      if (b?.type === "tool_result" && typeof b.tool_use_id === "string") {
        this.resolveToolResult(b);
      }
    }
    // Then surface any user-authored text (skip turns that are only results).
    const text = cleanUserText(
      (content as RawBlock[])
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n"),
    );
    if (text) {
      this.parts.push({ kind: "text", id: `${idx}:t`, role: "user", markdown: text });
    }
  }

  private resolveToolResult(b: RawBlock): void {
    const pending = this.pendingTools.get(b.tool_use_id as string);
    if (!pending) return;
    const out = toolResultText(b.content);
    pending.tool.output = out ? { text: out } : undefined;
    pending.tool.state = b.is_error ? "output-error" : "output-available";
    if (b.is_error && out) pending.tool.errorText = out;
    // Re-emit the updated part in place (it's the same object reference).
    const existing = this.parts[pending.partIndex];
    if (existing && existing.kind === "tool") existing.tool = pending.tool;
    this.pendingTools.delete(b.tool_use_id as string);
  }

  private handleAssistant(entry: RawEntry, idx: number): void {
    const content = entry.message?.content;
    if (!Array.isArray(content)) return;
    let block = 0;
    for (const b of content as RawBlock[]) {
      const id = `${idx}:${block++}`;
      if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
        this.parts.push({ kind: "text", id, role: "assistant", markdown: b.text });
      } else if (b?.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim()) {
        this.parts.push({ kind: "reasoning", id, markdown: b.thinking });
      } else if (b?.type === "tool_use" && typeof b.id === "string") {
        const tool: ToolPart = {
          type: typeof b.name === "string" ? b.name : "tool",
          state: "input-available",
          input: (b.input ?? {}) as Record<string, unknown>,
          toolCallId: b.id,
        };
        const part: ChatPart = { kind: "tool", id, tool };
        this.pendingTools.set(b.id, { partIndex: this.parts.length, tool });
        this.parts.push(part);
      }
    }
  }
}

/** Parse a full jsonl transcript into ChatPart[]. */
export function parseTranscript(text: string): ChatPart[] {
  const parser = new TranscriptParser();
  parser.feed(text);
  return parser.parts;
}

/**
 * Seed a fresh `TranscriptParser` from a thread's current transcript and
 * return it alongside the byte offset to continue tailing from. Used by the
 * SSE stream so the snapshot and the live tail share one parser (open
 * tool_use blocks pair correctly across the boundary).
 */
export async function seedParser(
  threadId: string,
): Promise<{ parser: TranscriptParser; byteOffset: number }> {
  const parser = new TranscriptParser();
  const resolved = await resolveThreadFile(threadId);
  if (!resolved || !existsSync(resolved.filePath)) {
    return { parser, byteOffset: 0 };
  }
  const content = await readFile(resolved.filePath, "utf-8");
  parser.feed(content);
  return { parser, byteOffset: Buffer.byteLength(content, "utf-8") };
}

/**
 * Read a thread's full transcript as ChatPart[], paginated. `offset === -1`
 * returns the last `limit` parts (tail). Returns `{ parts, total }` plus the
 * current byte size so a caller can start a tail from here.
 */
export async function getThreadParts(
  threadId: string,
  limit = 200,
  offset = 0,
): Promise<ThreadMessagesResponse & { byteOffset: number }> {
  const resolved = await resolveThreadFile(threadId);
  if (!resolved || !existsSync(resolved.filePath)) {
    return { threadId, parts: [], total: 0, byteOffset: 0 };
  }
  const content = await readFile(resolved.filePath, "utf-8");
  const byteOffset = Buffer.byteLength(content, "utf-8");
  const all = parseTranscript(content);
  const total = all.length;
  const parts =
    offset === -1 ? all.slice(Math.max(0, total - limit)) : all.slice(offset, offset + limit);
  return { threadId, parts, total, byteOffset };
}

/**
 * Tail helper for SSE (spec §7): re-read the transcript from `byteOffset` and
 * return the parts produced by the newly-appended lines. `parser` carries the
 * cross-batch state (open tool_use blocks) so a `tool_result` that lands in a
 * later batch still pairs with its earlier `tool_use`.
 *
 * NOTE: because new tool_results mutate already-emitted tool parts in place,
 * the caller should treat any returned `tool` part whose `toolCallId` it has
 * already seen as an `update`, and everything else as `append`.
 */
export async function tail(
  threadId: string,
  byteOffset: number,
  parser: TranscriptParser,
): Promise<{ parts: ChatPart[]; byteOffset: number }> {
  const resolved = await resolveThreadFile(threadId);
  if (!resolved || !existsSync(resolved.filePath)) {
    return { parts: [], byteOffset };
  }
  const st = await stat(resolved.filePath);
  if (st.size <= byteOffset) {
    return { parts: [], byteOffset };
  }
  // Read only the appended bytes.
  const fh = await readFile(resolved.filePath);
  const slice = fh.subarray(byteOffset).toString("utf-8");
  const before = parser.parts.length;
  parser.feed(slice);
  const newParts = parser.parts.slice(before);
  return { parts: newParts, byteOffset: st.size };
}
