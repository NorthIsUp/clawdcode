// Runnable check for the Pi stream parser. Not part of the `bun test` suite
// (that suite has git-mutating tests that corrupt sibling worktrees); run this
// one in isolation:
//
//   bun run src/runtime/pi/stream.check.ts
//
// It feeds a JSONL fixture (with the naming variants the parser tolerates)
// through parsePiRuntimeStream and asserts the normalized RuntimeStreamHandlers
// fire with the right payloads. Exits non-zero on the first failed assertion.

import assert from "node:assert/strict";
import { parsePiRuntimeStream } from "./stream";
import type { RuntimeBlock } from "../types";

/** Build a byte ReadableStream from a string (splits into two chunks mid-line
 *  to prove the line buffer stitches across reads). */
function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const mid = Math.floor(bytes.length / 2);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, mid));
      controller.enqueue(bytes.subarray(mid));
      controller.close();
    },
  });
}

const fixture = [
  // session id under the snake_case variant
  JSON.stringify({ type: "session", session_id: "sess-1" }),
  // assistant message: text + tool_use, camelCase-ish + `arguments` field
  JSON.stringify({
    type: "assistant",
    message: {
      id: "msg-1",
      content: [
        { type: "text", text: "hello" },
        { type: "tool_call", id: "tool-1", name: "Bash", arguments: { command: "ls" } },
      ],
    },
  }),
  // a bare tool event → hint only
  JSON.stringify({ type: "tool_use" }),
  // tool result under tool_call_id + isError camelCase, raw string content
  JSON.stringify({ type: "tool_result", tool_call_id: "tool-1", isError: false, content: "file.txt" }),
  // garbage line — must be skipped, not fatal
  "{ not json",
  "",
  // terminal event under the agent_end alias with usage tokens
  JSON.stringify({ type: "agent_end", text: "done", session_id: "sess-1", usage: { input_tokens: 5, cache_read_input_tokens: 2 } }),
].join("\n");

async function main(): Promise<void> {
  const sessions: string[] = [];
  const assistants: { blocks: RuntimeBlock[]; msgId: string }[] = [];
  const toolResults: { id: string; content: unknown; isError: boolean }[] = [];
  const results: { text: string; sessionId?: string; contextTokens: number }[] = [];
  let hints = 0;

  await parsePiRuntimeStream(streamOf(fixture), {
    onSession: (id) => { sessions.push(id); },
    onAssistant: (blocks, msgId) => { assistants.push({ blocks, msgId }); },
    onToolResult: (id, content, isError) => { toolResults.push({ id, content, isError }); },
    onToolUseHint: () => { hints += 1; },
    onResult: (ev) => { results.push(ev); },
  });

  assert.deepEqual(sessions, ["sess-1"], "onSession fires with the session id");

  assert.equal(assistants.length, 1, "one assistant message");
  assert.equal(assistants[0].msgId, "msg-1", "message id normalized");
  assert.deepEqual(
    assistants[0].blocks,
    [
      { type: "text", text: "hello" },
      { type: "tool_use", id: "tool-1", name: "Bash", input: { command: "ls" } },
    ],
    "text + tool_call(arguments) → normalized RuntimeBlocks (input from `arguments`)",
  );

  assert.equal(hints, 1, "bare tool event → one onToolUseHint");

  assert.equal(toolResults.length, 1, "one tool result");
  assert.deepEqual(
    toolResults[0],
    { id: "tool-1", content: "file.txt", isError: false },
    "tool_call_id + isError normalized; RAW string content passed through",
  );

  assert.equal(results.length, 1, "one terminal result");
  assert.equal(results[0].text, "done", "agent_end.text → result text");
  assert.equal(results[0].sessionId, "sess-1", "result session id");
  assert.equal(results[0].contextTokens, 7, "usage tokens summed (5 + 2)");

  console.log("pi stream parser check: ok");
}

await main();
