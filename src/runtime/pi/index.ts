// PiRuntime — the alternate coding-agent runtime (ERRANDD_RUNTIME=pi).
//
// Pi's tool/stream conventions differ from Claude Code's, so this is NOT a thin
// re-export of the Claude primitives — it builds Pi's own argv, sanitizes its
// own env (no CLAUDECODE stripping, no GLM ANTHROPIC_BASE_URL rewrite), and
// parses Pi's own stream (src/runtime/pi/stream.ts).
//
// Where Pi lacks a capability Claude has, the runtime degrades gracefully and
// advertises it via `capabilities` rather than faking it — the runner already
// gates resume, plugins, MCP, and context-token compaction on those flags, so
// setting them false is all that's needed to keep the Claude-only recovery
// branches dormant. Each such gap carries a `ponytail:` comment below.

import type {
  McpManager,
  OneShotOptions,
  OneShotResult,
  RunSpec,
  Runtime,
  RuntimeCapabilities,
  RuntimeOutputMode,
  RuntimeStreamHandlers,
  RuntimeSubprocess,
} from "../types";
import { parsePiRuntimeStream } from "./stream";

/** Resolve the Pi executable. Bare `pi` on PATH by default; overridable via
 *  PI_EXECUTABLE for non-standard installs. No Windows .cmd dance (unlike
 *  Claude) — Pi ships a single binary. */
function resolvePiExecutable(): string {
  const override = process.env.PI_EXECUTABLE?.trim();
  return override || "pi";
}

/** Map a normalized output mode to Pi's `--format` value.
 *  ponytail: Pi's real format flag/values are assumed (jsonl for streaming,
 *  text/json for buffered) — modeled on its message model, adjust when the
 *  real CLI lands. */
function outputFormatFlag(mode: RuntimeOutputMode): string {
  return mode === "stream" ? "jsonl" : mode;
}

// ponytail: Pi has no `pi mcp …` registration CLI that we know of, so MCP
// management is a no-op manager and `supportsMcpCli` is false. The web MCP UI
// routes through rt.mcp; against Pi it lists nothing and add/remove are inert
// rather than shelling out to a command that doesn't exist.
const noopMcp: McpManager = {
  list: () => Promise.resolve([]),
  add: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

export class PiRuntime implements Runtime {
  readonly id = "pi" as const;
  readonly executablePath = resolvePiExecutable();
  readonly capabilities: RuntimeCapabilities = {
    // ponytail: Pi core has no `--resume <id>` session-restore we can rely on,
    // so resume is off. The runner passes resumeSessionId only when this is
    // true, degrading Pi to stateless turns automatically.
    supportsResume: false,
    // ponytail: Pi doesn't report per-turn usage tokens in a stable shape, so
    // size-based auto-compaction never fires (contextTokens stays 0).
    reportsContextTokens: false,
    // ponytail: jobsRepo plugin/skill flags are Claude `--plugin-dir`/`--add-dir`
    // shaped; Pi discovers skills its own way, so we don't forward them.
    supportsPlugins: false,
    // ponytail: no MCP-registration CLI (see noopMcp).
    supportsMcpCli: false,
  };
  readonly mcp = noopMcp;

  buildRunArgs(spec: RunSpec): string[] {
    // ponytail: Pi's flag surface is assumed (`-p <prompt>`, `--format`,
    // `--model`). jobsRepoArgs / appendSystemPrompt / effort are Claude-shaped
    // and unsupported here, so they're intentionally dropped (capabilities say
    // supportsPlugins:false; the runner still passes them opaquely).
    const args = [this.executablePath, "-p", spec.prompt, "--format", outputFormatFlag(spec.outputMode)];
    if (spec.model.trim()) args.push("--model", spec.model.trim());
    // Resume is intentionally NOT emitted: supportsResume is false, so the
    // runner never sets resumeSessionId — but guard anyway for safety.
    return args;
  }

  buildChildEnv(base: Record<string, string>, model: string, api: string): Record<string, string> {
    // ponytail: no GLM ANTHROPIC_BASE_URL rewrite (that's a Claude/Anthropic
    // concern). Pi reads its own provider config; we only forward an explicit
    // auth token when one is configured.
    const childEnv: Record<string, string> = { ...base };
    if (api.trim()) childEnv.PI_API_KEY = api.trim();
    // `model` is applied via --model in buildRunArgs, not env.
    void model;
    return childEnv;
  }

  cleanSpawnEnv(): Record<string, string> {
    // ponytail: Pi doesn't inherit the CLAUDECODE / CLAUDE_CODE_OAUTH_TOKEN
    // reentry vars the Claude CLI trips on, so there's nothing Claude-specific
    // to strip — just copy the string-valued env for a detached child.
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }

  spawn(args: string[], env: Record<string, string>, cwd?: string): RuntimeSubprocess {
    return Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      env,
      ...(cwd ? { cwd } : {}),
    });
  }

  parseStream(stdout: ReadableStream<Uint8Array>, handlers: RuntimeStreamHandlers): Promise<void> {
    return parsePiRuntimeStream(stdout, handlers);
  }

  resumeArgs(_sessionId: string): string[] {
    // ponytail: no resume support (supportsResume:false). Interface-only method;
    // no consumer calls it for Pi. Return empty rather than fabricate a flag.
    return [];
  }

  stripResume(args: string[]): string[] {
    // Pi never emits a resume flag, so there's nothing to strip.
    return args;
  }

  withOutputMode(args: string[], mode: RuntimeOutputMode): string[] {
    const out = [...args];
    const idx = out.indexOf("--format");
    if (idx >= 0 && idx + 1 < out.length) out[idx + 1] = outputFormatFlag(mode);
    return out;
  }

  isCorruptedSession(_stdout: string, _stderr: string): boolean {
    // ponytail: Pi has no thinking-block-signature corruption failure mode.
    // Returning false keeps the runner's Claude-only corrupted-session reset
    // branch dormant without gating it.
    return false;
  }

  isStaleSession(_stdout: string, _stderr: string): boolean {
    // ponytail: no --resume ⇒ no "session not found" recovery path. False keeps
    // the runner's stale-session branch dormant.
    return false;
  }

  async runOneShot(opts: OneShotOptions): Promise<OneShotResult> {
    const mode = opts.outputMode ?? "text";
    const args = [this.executablePath, "-p", opts.prompt, "--format", mode];
    if (opts.model?.trim()) args.push("--model", opts.model.trim());
    // resumeSessionId ignored: Pi has no resume (supportsResume:false).

    const proc = this.spawn(args, this.cleanSpawnEnv());
    const timeoutMs = opts.timeoutMs ?? 30_000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill(); } catch {}
    }, timeoutMs);

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    clearTimeout(timer);

    return { stdout, stderr, exitCode: proc.exitCode ?? 1, timedOut };
  }
}
