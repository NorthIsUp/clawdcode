# errandd — Architecture Assessment

> Produced by a fable workflow: seven opus analysts scored one dimension each against the target
> criteria (runnable service · multi-harness backends · clear domains · extensibility · inbound hook
> plugin system · outbound notification plugin system · OTel/LLMObs), then a lead-architect synthesis.
> The build scope that follows from it was ratified by the MAGI deliberation (Melchior/Balthasar/Casper).

## 1. Executive summary

errandd is a genuinely production-shaped daemon, not a script wearing a cron hat. The core runtime — lifecycle management, readiness gating, crash-safe SQLite/JSON state, a real second agent backend (Pi) behind a documented `Runtime` interface — is staff-quality work that clearly grew out of hard-won operational experience. But the architecture is uneven: the *content* extension plane (drop a routine/skill/plugin into a jobs repo, zero core edits) is excellent, while every *integration* axis — inbound webhook providers, outbound chat surfaces, agent runtimes — is compile-time enumerated as hardcoded fan-out across 10-13 files, and there is zero telemetry beyond health probes and `console.*`. The single biggest strength is the runtime backend seam (`runtime/types.ts` + a working Pi implementation proves the abstraction is real, not aspirational). The single biggest risk is observability: no OpenTelemetry, no spans, no metrics, no trace propagation from webhook to agent run, and a cost model with a standing FIXME that prices every model as Sonnet — you are flying a multi-agent daemon on `console.log`.

## 2. Scorecard

| Dimension | Score /5 | Verdict |
|---|---|---|
| 1. Runnable service | 4 | Real daemon with lifecycle, probes, crash-safe state — undercut by probe-wiring mismatch and a shutdown that doesn't actually drain. |
| 2. Multiple AI harnesses | 4 | Genuine `Runtime` seam + a real second backend (Pi); two live spawn paths (compact, fork) still hardcode Claude argv. |
| 3. Clear domains | 3 | `hooks/`, `runtime/`, `ui/` are cleanly bounded; a flat ~45-file `app/` root and several god-files leave cohesion half-applied. |
| 4. Extensibility | 3 | Content plane is plug-and-play; every new integration axis forces coordinated edits across hardcoded unions and if-ladders. |
| 5. Inbound hook plugin system | 2 | No registry; one clean shared pipeline (`webhookEnvelope`) redeems a 10-13-file fan-out per source. |
| 6. Outbound notification plugin system | 2 | No notifier abstraction; Telegram/Discord/Slack are a closed trio wired bespoke in many places. |
| 7. OTel / LLM observability | 2 | No OTel, no spans, no metrics, no trace propagation — health probes, timestamped logs, one batch cost view. |
| **Overall average** | **2.86** | Strong core runtime; integration seams and observability are the drag. |

## 3. Per-dimension detail

### 1. Runnable service — 4/5

**Current state.** A long-lived Bun daemon with a thin CLI dispatcher (`app/index.ts`) and a full lifecycle owner in `commands/start.ts`: single-instance PID guard with stale-process detection, `--replace` (SIGTERM incumbent, 4s wait), boot-phase timing, 30s hot-reload of settings/jobs, and first-class liveness/readiness. `/healthz` always 200 and `/readyz` 503-until-ready are answered *before* Host/CSRF/auth (`app/health.ts`, `app/ui/server.ts:118-134`) so an orchestrator can poll unconditionally. State persists under one volume: SQLite (WAL + `busy_timeout`) for the hook queue/deliveries/interactive queue, JSON for settings/toggles, and a crash-safe `pending-resume.json` that atomically renames to `.consumed` before firing (`app/pending-resume.ts:1-40`). The Dockerfile ships non-root with both runtimes baked, a VOLUME, and transcript symlinks so `--resume` survives restarts; `charts/errandd` is a complete Helm chart.

**Gaps.** Helm probes hit `/ui/` instead of `/healthz`+`/readyz` (`values.yaml:88,95`) — the readiness gate the app goes to real trouble to build is bypassed by the shipped orchestration. `shutdown()` claims to "drain in-flight requests" but clears timers and calls `process.exit(0)` immediately with no await and no timeout — an active agent run is orphaned on SIGTERM. Single-replica + Recreate means every rollout has an unavoidable downtime window. The `maxRuntimeSeconds` watchdog is in-memory and resets on restart.

**Recommendations.** Repoint Helm probes to `/healthz` and `/readyz`. Make `shutdown()` honor its comment: track in-flight runs, await them behind a bounded (20-30s) drain deadline, then force-exit; set `terminationGracePeriodSeconds` to match. Persist watchdog start-times to SQLite.

### 2. Multiple AI harnesses — 4/5

**Current state.** A first-class `Runtime` interface (`app/runtime/types.ts:114-148`) covers the full lifecycle — argv, env sanitizing, spawn, a normalized `RuntimeBlock` stream model, resume/arg-surgery, error classification, one-shot, MCP. Two *real* implementations exist: `ClaudeRuntime` and `PiRuntime`, a genuinely different backend with its own argv shape, its own NDJSON schema (`pi/stream.ts`), and honest `RuntimeCapabilities`. Core paths go through `getRuntime()`, and a three-file test suite drives both runtimes through one contract.

**Gaps.** Two live spawn paths leak Claude argv: `runCompact` (`runner.ts:382-387`) hardcodes `/compact --output-format text --resume` and `runFork` (`runner.ts:1241-1247`) hand-builds `--output-format json --append-system-prompt`. Auto-compaction (`runner.ts:917`) gates on `contextTokens` but not on any capability, so it trips under Pi and calls the Claude-only `/compact` — a reachable, broken path. `PiRuntime.buildRunArgs` drops `spec.security` entirely. `RuntimeId` is a closed union with a `select.ts` if-branch.

**Recommendations.** Route `runCompact`/`runFork` through `rt.buildRunArgs`/`resumeArgs`; add a `supportsCompaction` capability and gate line 917 on it; give the interface a `buildSecurityArgs(security)`; replace the closed union with a registry `Map<string, () => Runtime>`.

### 3. Clear domains with clear purposes — 3/5

**Current state.** Two domains are exemplary: `hooks/` is strikingly self-contained (across 12 files, exactly *one* import escapes the domain — `../jobs`), and `runtime/` is the best-designed seam in the repo. `ui/` cleanly separates 13 route files from 9 service files.

**Gaps.** The flat `app/` root holds ~45 ungrouped modules. `commands/start.ts` is a god-orchestrator (2097 lines, a single 1551-line `start()` importing ~34 modules). The "runtime-neutral" `runner.ts` still imports shared spawn utils from the claude-named `claude-spawn.ts`. `hooks/schema.ts` (936) and `hooks/match.ts` (832) are god-files even inside a clean domain.

**Recommendations.** Break up `start.ts` into a `daemon/` orchestrator + hook-coalescing + heartbeat modules. Introduce a `session/` domain. Group the flat root into `jobs/`, `exec/`, `config/`. Move shared spawn utils into a runtime-neutral module. Treat `hooks/` and `runtime/` as the reference pattern.

### 4. Extensibility — 3/5

**Current state.** Two-tier. The *content plane* is genuinely plug-and-play: dropping a routine markdown file or a `.claude-plugin/plugin.json` directory is auto-discovered (`jobsRepoPlugins.ts`, `slashRegistry.ts`) with zero daemon edits, and a real daemon plugin API exists (`plugins.ts`/`PluginManager`). The *integration plane* is the weak half — every new provider/runtime/platform is compile-time enumerated.

**Recommendations.** Covered under dimensions 5 and 6, which are the concrete instances. Net: promote `PluginManager`'s event model toward being the *one* sanctioned integration path rather than several hardcoded axes.

### 5. Plugin system for inbound hook types — 2/5

**Current state.** Four sources (GitHub, Sentry, Datadog, Linear) with exactly one genuine abstraction: `hooks/webhookEnvelope.ts` defines a `WebhookSpec` and `handleSignedWebhook()` owns the invariant skeleton. But there is no registry, no source table, no `registerSource()`. Every other layer hardcodes each source by name, and **GitHub is the outlier** — it bypasses the envelope entirely via its own `handleWebhook`.

**Evidence.** `ui/server.ts:332-397` (four literal per-path if-blocks); `hooks/schema.ts:203-209,321-353,849-851` (per-source field + parse case + default + guard line); `hooks/match.ts:233-380` (`readX`/`evalX`/`matchX`/`xRuleSkipReason` per source); `hooks/evaluate.ts:72-290` (three functions branch on event prefix); `shared/deliveryTypes.ts:11` (`DeliverySource` closed union). Adding PagerDuty/GitLab touches ~10-13 files.

**Recommendations.** Define a `SourcePlugin` interface composing the parts each source already has (`id`, `routePath`, `buildSpec`, `configKey`, `parseRule`, `matchRule`/`skipReason`, `extract`, `providerStatus`) and a central `sources.ts` registry. `server.ts`/`schema.ts`/`evaluate.ts` iterate it. Fold GitHub in via a spec. Derive `DeliverySource` from the registry so a missing branch is a compile error. Adding PagerDuty becomes one file + one line.

### 6. Plugin system for outbound notifications — 2/5

**Current state.** No notifier/surface plugin system. Each channel is a large bespoke module (`telegram.ts` ~1753, `discord.ts` ~1832, `slack.ts` ~1781) with a *divergent* `sendMessage` signature. The daemon integrates them by hand: three near-identical init closures, separate mutable send-fn bindings, and a hardcoded `switch (m.platform)`. The channel set is a closed union `InteractivePlatform = "telegram"|"discord"|"slack"` mirrored across `start.ts`, `config.ts`, and `plugins.ts`. `commands/send.ts` is a *second, inconsistent* outbound path (inlined `fetch()`, no Slack).

**Recommendations.** Define one `Notifier` interface (`id`, `send(dest, msg)`, optional `start/stop`, `reactionSupport`, `configSchema`); make the three channels thin adapters; populate a `notifierRegistry` at boot; replace the init closures, `forwardToX` wrappers, and the `switch` with `registry.get(platform)?.send(...)`. Normalize a `ChannelDestination` (all-string ids). Replace the closed union with `string` validated against the registry. Extend `PluginManager` so plugins can *register* a Notifier. Route `send.ts` through the registry.

### 7. OpenTelemetry / LLM observability — 2/5

**Current state.** Zero OTel or LLM-observability instrumentation — no `otel`/`dd-trace`/`llmobs`/`prom-client` deps, no tracer/meter/span code. (Every "datadog" hit is the inbound *webhook receiver*, not an exporter.) Operational visibility is three thin layers: 328 `console.*` calls prefixed by `logTime.ts`'s locale-time `ts()`; a single `let ready` boolean; and one LLM-metric surface — `ui/services/usage.ts` re-reads Claude CLI `.jsonl` transcripts post-hoc, sums tokens, and estimates cost from a hardcoded `PRICING` table with a **standing FIXME that applies Sonnet rates to every session**.

**Evidence.** `runner.ts` `onResult` (~line 302) receives per-run `contextTokens` + `session_id` but records/emits nothing — exactly where a per-turn LLM span would close. `claude-spawn.ts` `parseStream()` is the single NDJSON dispatch point — the natural seam to open/close spans. `daemon/forward.ts` carries no `traceparent`/correlation id, so an inbound alert can't be joined to the agent run it spawns.

**Recommendations.** Add `@opentelemetry/sdk-node` + OTLP, initialized once in `start.ts`, config-driven and no-op when unset. Open a root span per agent run in `runner.ts`, and inside `parseStream()` a child span per assistant turn and per `tool_use`→`tool_result` pair. Populate `gen_ai.*` attributes from in-stream data — replacing the `.jsonl` re-parse and **fixing the Sonnet-only FIXME by keying price on the model id the result event carries**. Emit metrics from `onResult` (latency histogram, token/cost counters, hook-queue-depth gauge) behind `/metrics`. Mint a trace id when a webhook lands, stamp it on the queued job, pass it into the runtime. Swap `console.*` for a structured logger injecting `trace_id`/`session_id`.

## 4. Prioritized roadmap

The weak areas (5, 6, 7) share a root cause: subsystems that *should* be registries are hardcoded fan-out, and the same god-files (`start.ts`, `runner.ts`, `hooks/schema.ts`, the chat bridges) are where the tangles live. A clean abstraction in each case *also* de-tangles a god-file — the two problems have one fix.

### 🟢 Quick wins (days)

- **Repoint Helm probes** to `/healthz` + `/readyz`. *(Dim 1)*
- **Close the two runtime leaks:** route `runCompact`/`runFork` through `rt.buildRunArgs`/`resumeArgs`; gate auto-compaction on a new `supportsCompaction` capability. *(Dim 2)*
- **Fix the cost FIXME:** key `PRICING` on the model id in the `result` event. *(Dim 7)*
- **Wire minimal trace ids:** mint a correlation id at webhook intake and thread it through the queue + logs. *(Dim 7)*

### 🟡 Medium (weeks)

- **Inbound source registry** — highest leverage. Define `SourcePlugin`, collect into `sources.ts`, iterate it everywhere. Fold GitHub into the envelope. Dissolves the `hooks/schema.ts` god-switch and the four `server.ts` if-blocks. *(Dims 4, 5, 3)*
- **Outbound Notifier registry** — define `Notifier` + `ChannelDestination`, reduce the three ~1800-line bridges to thin adapters, replace the switch + init closures + `send.ts`. De-tangles ~5000 lines. *(Dims 4, 6, 3)*
- **Drain-correct shutdown.** *(Dim 1)*
- **First-class OTel spans** — root span per run, child spans in `parseStream()`, `gen_ai.*` attributes, `/metrics` backing `/api/usage` with real counters. *(Dim 7)*

### 🔴 Big bets (larger refactors)

- **Runtime + platform registries as the one integration path.** Replace the closed `RuntimeId` union and per-axis wiring with plugin-registered providers/runtimes/notifiers. *(Dims 2, 4)*
- **Break up `commands/start.ts`.** Extract a `daemon/` orchestrator — the prerequisite that makes the registries land cleanly. *(Dim 3)*
- **Introduce a `session/` domain** and group the flat `app/` root into named domains. *(Dim 3)*
- **End-to-end trace propagation + HA topology.** *(Dims 1, 7)*

The through-line: errandd already proved it can build a clean seam (`runtime/`, `hooks/webhookEnvelope`, the content plane). Applying that same discipline to the three hardcoded integration axes is most of the remaining distance — and it pays double, because each registry also empties out a god-file.
