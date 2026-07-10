# GitHub hooks: simple model, v3 editor, chat outcome UX

Build spec. Branch `github-hooks-excellent`. Date 2026-06-09.

Make GitHub hook config SUPER CLEAR: a 2×2 grouped-checkbox matrix in the v3
routine editor that round-trips losslessly through the `.md` frontmatter `on:`
block, plus a compact + token-efficient chat readout of WHAT came in and the
OUTCOME for every delivery.

This spec deliberately reuses the existing machinery end to end:

- Matcher + schema: `src/hooks/schema.ts` (`PrRule`/`CommentRule`/`HookConfig`,
  `parseTriggers`), `src/hooks/match.ts` (`evalPrRule`).
- Frontmatter round-trip: backend `src/jobs.ts` (`parseTriggers`), web mirror
  `web/ui/hookConfig.ts` (`parseTriggers`) + `web/ui/schedule.ts`
  (`readFrontmatter`/`writeFrontmatter` → `buildOnList`).
- Delivery outcomes: `shared/deliveryTypes.ts` (`DeliveryRoutine`
  `outcome`/`reason`/`prefilter`), produced in `src/hooks/receiver.ts`.
- Queue outcome: `src/hookQueue.ts` (`QueueOutcomeResult = "ok"|"pass"|"error"`).
- Chat parts: `shared/transcriptParts.ts` (`ChatPart` + `notInContext`), parsed
  in `src/ui/services/threadParts.ts`, rendered by `web/v3/components/parts/*`
  (`SystemPart` in-context, `InfoPart` FYI, both via `InfoCard`).

The product rule baked into everything below: **"created" and "updated" are the
same thing**. The simple UI never surfaces individual PR write-actions or
created-vs-edited comment splits. It exposes exactly two categories — **PR
updates** and **Comments** — crossed with two actor classes — **Humans** and
**Bots**.

---

## 1. THE SIMPLE MODEL

### 1.1 The typed matrix

New type, in BOTH the backend schema (`src/hooks/schema.ts`) and the web mirror
(`web/ui/hookConfig.ts`) so it bundles to the browser and loads in the daemon:

```ts
export interface GitHubTriggers {
  humans: { prUpdates: boolean; comments: boolean };
  bots:   { prUpdates: boolean; comments: boolean };
  /** Advanced (collapsed by default). Empty/unset = simple matrix only. */
  advanced: {
    /** Base-branch globs for PR updates (default ["!main"]). */
    base: string[];
    /** Required/excluded PR labels (default []). */
    labels: string[];
    /** Draft handling for PR updates: false=skip drafts, true=drafts only, "any". */
    draft: boolean | "any";
    /** Repo globs (default ["*/*"]). */
    repo: string[];
  };
  /** skip_self modifier (default true). */
  skipSelf: boolean;
}
```

The matrix is a *view* over `HookConfig`. `HookConfig` stays the on-disk / wire
source of truth. `GitHubTriggers` is derived on load and projected back on save.

### 1.2 The "PR updates" category = the full default write-action set

"PR updates" collapses created/opened ≈ updated/synchronize/edited/reopened/
ready_for_review into ONE toggle. The matcher already does this: a PR rule with
`action: ["opened","synchronize","reopened"]` (`DEFAULT_PR_ACTIONS` in
`schema.ts`) is what "PR updates ON" means. The simple UI never lets the human
pick individual actions — when "PR updates" is checked, the rule carries exactly
`DEFAULT_PR_ACTIONS`; the matcher's per-action set membership (`evalPrRule`) does
the rest. We do NOT expand to `ALL_PR_ACTIONS` (that list in `hookConfig.ts` is
advanced-raw only).

> Note: `DEFAULT_PR_ACTIONS` is the canonical "updates" set. Keep it the single
> constant; the matrix references it, never re-spells it.

### 1.3 The "Comments" category = review + review-comment + issue_comment

"Comments" collapses PR review comments + reviews + issue/PR comments +
created/edited into ONE toggle. The matcher already treats all three GitHub
comment events (`issue_comment`, `pull_request_review`,
`pull_request_review_comment` — `COMMENT_EVENTS` in `receiver.ts`) under the
single `HookConfig.comments` field. So "Comments ON" === `comments` set; the
actor class chooses the glob (below).

### 1.4 EXACT bidirectional mapping: matrix ↔ HookConfig

**Actor-class → user glob (single source, mirror `authorsToGlob`/`globToAuthors`
from `HookConfigEditor.tsx`):**

| humans | bots | user glob          | meaning            |
|--------|------|--------------------|--------------------|
| ✓      | ✓    | `["*"]`            | anyone             |
| ✓      | ✗    | `["*", "!*[bot]"]` | humans only        |
| ✗      | ✓    | `["*[bot]"]`       | bots only          |
| ✗      | ✗    | (no rule)          | category off       |

**Matrix → HookConfig (`gitHubTriggersToHookConfig`):**

- **PR updates row.** Let `prHumans = humans.prUpdates`, `prBots = bots.prUpdates`.
  - If neither → `pr: []`.
  - Else → exactly ONE `PrRule`:
    ```
    { repo: advanced.repo (default ["*/*"]→"*/*" string form),
      user: classGlob(prHumans, prBots),
      action: [...DEFAULT_PR_ACTIONS],
      branch: advanced.base (default ["!main"]),
      labels: advanced.labels (default []),
      draft: advanced.draft (default false) }
    ```
    A single rule covers both checked classes because both → `["*"]`. (We never
    emit two PR rules from the simple matrix; two rules only appear in raw mode.)
- **Comments row.** Let `cHumans = humans.comments`, `cBots = bots.comments`.
  - Neither → `comments` unset.
  - Both → `comments: true` (the explicit "any commenter incl. bots" opt-in).
  - Humans only → `comments: { user: ["*", "!*[bot]"] }`.
  - Bots only → `comments: { user: ["*[bot]"] }`.
- `skipSelf` → `HookConfig.skipSelf` verbatim.
- Result is `null` when both rows are empty (no GitHub trigger at all), matching
  `TriggersEditor.mutateHookConfig`'s "drop the block when empty" contract. Any
  pre-existing `sentry`/`datadog` on the config are preserved by the caller (the
  matrix owns only `pr`/`comments`/`skipSelf`) — exactly as `TriggersEditor`
  already merges instead of replacing.

**HookConfig → matrix (`hookConfigToGitHubTriggers`) + representability check:**

Return `{ matrix: GitHubTriggers, representable: boolean }`.

The config is **representable as the simple matrix** iff ALL hold:
- `pr` is 0 or 1 rule. If 1 rule:
  - `action` equals `DEFAULT_PR_ACTIONS` (set-equal, order-insensitive),
  - `user` is one of the three recognized class globs (via `globToAuthors`),
  - `repo`, `branch`, `labels`, `draft` are read into `advanced` (any value is
    fine — advanced fields are part of the simple model, just collapsed).
- `comments` is `false`/unset, `true`, or `{ user }` where `user` is one of the
  three class globs.

When representable:
- `humans.prUpdates`/`bots.prUpdates` ← `globToAuthors(rule.user)` (each class
  present in the set → its box checked); `prUpdates` rows both false when no rule.
- `humans.comments`/`bots.comments` ← `activeCommentAuthors(comments)`
  (reuse the helper shape from `HookConfigEditor.tsx`).
- `advanced` ← from the PR rule (`base=rule.branch`, `labels`, `draft`,
  `repo`). When there's no PR rule, advanced defaults to
  `{ base:["!main"], labels:[], draft:false, repo:["*/*"] }`.
- `skipSelf` ← `config.skipSelf !== false`.

When NOT representable (multiple PR rules, a non-default `action` set such as a
hand-picked `["closed"]`, an arbitrary `user` glob like `["alice","!bob"]`, a
comment filter that isn't a class glob, or a `sentry`/`datadog` block present
alongside): **fall back to advanced/raw mode** (§2.4). The matrix is shown
read-only-disabled with a "this routine uses a custom config — edit raw" note,
so we never silently lose a power-user's hand-written rule by projecting it
through the lossy matrix.

### 1.5 Round-trip through the `.md` frontmatter `on:` block

No new persistence path. The matrix never touches YAML directly — it only ever
produces/consumes a `HookConfig`, and the EXISTING frontmatter round-trip
(`web/ui/schedule.ts` `writeFrontmatter` → `buildOnList`, and `readFrontmatter` →
`parseTriggers`) does the YAML. That path already:

- preserves unrelated top-level keys (`model`, `effort`, `reuse_session`, …) and
  the markdown body via the `FRONTMATTER_RE` body capture + YAML round-trip,
- collapses a fully-open PR rule to `- prs: true`, `comments`/`sentry`/`datadog`
  to `true` when unfiltered, and omits default rule fields (`prRuleObject`),
- emits `skip_self: false` only when explicitly disabled.

So the save flow is: `matrix → gitHubTriggersToHookConfig → merge into draft
HookConfig (keep sentry/datadog) → onChange JobFrontmatter{hookConfig} →
writeFrontmatter`. The load flow is the inverse:
`readFrontmatter → hookConfig → hookConfigToGitHubTriggers`.

One subtlety to preserve: the simple matrix's "PR updates" rule uses
`branch: ["!main"]` by default, which `buildOnList.isFullyOpen` already treats as
the `- prs: true` shorthand **only when** `user === ["*"]` (both classes). With
humans-only (`["*","!*[bot]"]`) it serializes as a full `- pr: { user: [...] }`
mapping — correct and already handled. No change to `buildOnList` is required;
verify with a round-trip test for each of the 4 matrix combos.

### 1.6 EASY DEFAULTS

A NEW GitHub routine (operator clicks "add GitHub hook" with no existing config)
defaults to:

```
humans: { prUpdates: true,  comments: true  }   // respond to humans
bots:   { prUpdates: false, comments: false }   // ignore bot noise
advanced: { base:["!main"], labels:[], draft:false, repo:["*/*"] }
skipSelf: true
```

Which maps to this HookConfig and serializes to this `on:` block:

```yaml
on:
  - pr:
      repo: "*/*"
      user: ["*", "!*[bot]"]
      branch: ["!main"]
  - comments:
      user: ["*", "!*[bot]"]
# skip_self omitted (true is the default)
```

(`action`/`labels`/`draft` omitted because they equal defaults — handled by
`prRuleObject`.) This is "respond to humans, ignore bots, leave main-targeting
PRs alone, don't retrigger on my own activity."

---

## 2. THE v3 EDITOR

A new `GitHubTriggersPanel` inside `web/v3`, mounted in `RoutinesView`'s
`ConfigPane` (the Config tab body). It does NOT touch the existing
`TriggersEditor` (web/ui) used elsewhere; v3 gets its own clean GitHub panel.

### 2.1 Placement

`RoutinesView.tsx` `ConfigPane` currently renders `<TriggersEditor>`. For v3 we
introduce a v3-native triggers layout in that pane:

- `Schedule` subsection (can reuse existing schedule UI, out of scope here).
- **`GitHubTriggersPanel`** (this spec).
- Sentry / Datadog (unchanged; advanced).

The panel reads `value: JobFrontmatter` and emits via the same
`onChange(writeFrontmatter(draft, next))` already wired in `FileView`. It owns
only `hookConfig.pr / .comments / .skipSelf`; it merges into the existing
`hookConfig` so it never clobbers `sentry`/`datadog` (same merge discipline as
`TriggersEditor.mutateHookConfig`).

### 2.2 The 2×2 grid (the core UI)

```
GitHub triggers

              PR updates      Comments
   Humans       [✓]             [✓]
   Bots         [ ]             [ ]

   ▸ Advanced
   Fires on PR updates and comments from humans.
```

- 4 checkboxes (darwin-ui / daisyUI `checkbox`), laid out as a real grid with
  column headers "PR updates" / "Comments" and row headers "Humans" / "Bots".
- Each checkbox is a controlled boolean from the projected `GitHubTriggers`
  matrix. `onChange` flips the bit, re-runs `gitHubTriggersToHookConfig`, merges,
  and calls the parent `onChange`. No intermediate local YAML.
- Column tooltips encode the product copy:
  - **PR updates**: "Any pull-request update — opened, pushed, edited, reopened,
    marked ready. (Created and updated are treated the same.)"
  - **Comments**: "PR reviews, review comments, and issue/PR comments."
- Keep accessible: `<fieldset><legend>`, `aria-label` per checkbox like
  "Humans · PR updates".

### 2.3 Collapsible Advanced + plain-English summary

- **Advanced** (`<Collapsible>` from `web/v3/components/ui/collapsible`, collapsed
  by default) exposes the `advanced` fields + `skipSelf`:
  - Base branch globs (`PillList`-style; default `!main`).
  - Labels globs (default empty).
  - Draft handling segmented control (Skip drafts / Drafts only / Any).
  - Repo globs (default `*/*`).
  - `skip_self` checkbox: "Skip events from this errandd user (don't retrigger
    on my own PRs/comments)" — checked by default.
- **Summary line** (always visible, the plain-English readout). Compose from the
  matrix, e.g.:
  - both rows humans-only → "Fires on PR updates and comments from humans."
  - prUpdates humans+bots, comments off → "Fires on PR updates from anyone."
  - nothing → "No GitHub triggers."
  - advanced non-default appends "· targeting non-main branches", "· label
    ready-for-review", "· drafts only" as needed.
  This is the v3 analogue of `ScheduleReadout.describeHooks`, but matrix-shaped
  and friendlier. Single pure function `summarizeGitHubTriggers(matrix)`.

### 2.4 Raw / advanced fallback (non-representable configs)

When `hookConfigToGitHubTriggers().representable === false`:
- Render the 2×2 grid **disabled** with an amber note: "This routine uses a
  custom hook config the simple grid can't show. Edit the raw `on:` block."
- Provide a "Edit raw" affordance: reuse the existing source `Edit` tab
  (`RoutineEditor`) — the operator edits YAML directly; the panel re-projects on
  next load. (No new raw-YAML editor needed; the Config tab simply defers to the
  Edit tab for these.) Optionally show the current `on:` block read-only inside
  the panel for context.

### 2.5 Load / save via the jobs file API

No new API. Same as today's `FileView` (`web/v3/sections/RoutinesView.tsx`):
`getJobFile` → content → `readFrontmatter` → `hookConfig` →
`hookConfigToGitHubTriggers`. On any checkbox/advanced change:
`gitHubTriggersToHookConfig` → merged `hookConfig` → `writeFrontmatter(draft,
{hookConfig})` → `setDraft`; persisted by the existing `onSave`/`onPush`
(`writeJobFile` + `syncRepo`). The `ScheduleReadout` already shown above the
editor keeps working since it reads the same `hookConfig`.

---

## 3. THE CHAT OUTCOME UX

For every delivery, the thread must show, compactly and token-efficiently:
**(a) WHAT came in** (one line) and **(b) the OUTCOME** (one of four states).
All FYI/rule states are DISPLAY-ONLY and reuse the existing
`notInContext`/`InfoCard`/`InfoPart` machinery — they add ZERO tokens to the
model.

### 3.1 (a) WHAT came in — one line

Already exists. A fired delivery opens the thread with a user turn beginning
`Triggered by …` / `New event on …` (matched by `TRIGGER_RE` in
`threadParts.ts`), which the parser turns into a `kind:"system"` part rendered by
`SystemPart`/`InfoCard` — a long trigger collapses to its first line. The first
line already reads like `event · actor · #PR`. **No backend change**; if the
first line needs tightening, adjust the prompt header builder
(`renderHookSummaryMarkdown` / the "Triggered by …" lead in `src/commands/start.ts`)
to lead with `event · @actor · #PR` so the collapsed summary is the WHAT line.
Token-efficient: the verbose payload stays below the fold (already in-context but
collapsed), nothing new is sent.

### 3.2 (b) OUTCOME — four states, where each comes from

| Outcome label | Source of truth | Render |
|---|---|---|
| **handled by the agent** | run produced a terminal `[ok]`/`[done]`/`[pass]`→ok line; `hookQueue` `outcome="ok"` | in-context `SystemPart` (base palette) — the agent's `[ok]` line is already parsed by `STATUS_LINE_RE` into a non-FYI system part |
| **skipped by the agent** + `[skip]` reason | the agent ran and emitted a plain `[skip] …` assistant line; `hookQueue` `outcome="pass"` | in-context `SystemPart`. Plain `[skip]` (no suffix) stays non-FYI per current `threadParts.ts` logic — it WAS model output, so it's legitimately in-context |
| **skipped by a rule** + which filter | `DeliveryRoutine{outcome:"skip", reason}` (config/self/ignore skip) → synthetic skip session via `writeStaticSkipSession`. `claw:ignore` already emits `[skip:ignore]` | **FYI** `InfoPart`. `[skip:ignore]` already flags `notInContext` (suffix in `FYI_STATUS_SUFFIXES`). For ordinary config/self skips, write the synthetic session line as `[skip:rule] <reason>` and add `"rule"` to `FYI_STATUS_SUFFIXES` so it routes to the blue FYI box |
| **filtered: bot noise** (pre-filter) | `DeliveryRoutine{outcome:"skip", reason, prefilter:true}` → `[skip:fyi]` synthetic session | **FYI** `InfoPart` — already wired (`fyi` suffix ∈ `FYI_STATUS_SUFFIXES` → `notInContext:true`) |

So three of four states already flow correctly through the existing parser; the
ONLY new piece is the config/self **rule-skip** label. Two options, pick the
smaller:

1. **Preferred (minimal):** when `writeStaticSkipSession` is called for a
   config/self skip (non-prefilter, non-ignore), prefix the assistant text with
   `[skip:rule] ` and add `"rule"` to `FYI_STATUS_SUFFIXES` in
   `threadParts.ts`. The reason string (already human: "author `x` excluded by
   the user filter", "base branch `main` excluded …", self-skip text from
   `receiver.ts`) renders in the FYI box. Token cost: zero (synthetic session,
   never sent to a model).

The four labels are presentation; map the marker → friendly label in the v3
parts layer (so the box header reads "Skipped by a rule" / "Filtered: bot noise"
/ "Skipped by the agent" / "Handled by the agent"). Add a tiny
`outcomeLabel(text)` helper in the v3 parts (or in `InfoPart`/`SystemPart`) that
derives the header from the `[skip:*]`/`[ok]` marker — purely visual.

### 3.3 in-context vs FYI (the token contract)

- **In-context** (base `SYSTEM_PALETTE`, `SystemPart`): the WHAT trigger card,
  the agent's `[ok]`/plain `[skip]` outcome. These WERE the model's
  input/output.
- **FYI / `notInContext`** (`INFO_PALETTE`, `InfoPart`, header "Not sent to the
  agent (FYI)"): rule-skip (`[skip:rule]`), `claw:ignore` (`[skip:ignore]`),
  bot-noise prefilter (`[skip:fyi]`), and the suppressed bot body / full payload.
  These never reached the model — exactly the existing diet machinery. No new
  tokens enter context anywhere in this design.

### 3.4 Deliveries-table parity (no change, just confirm)

The Deliveries tab already renders `DeliveryRoutine.outcome/reason/prefilter`
(durable via `deliveries.ts`); the queue row already shows action+details +
`outcome` (`ok`/`pass`) per the latest commit. The chat UX above is the
thread-side mirror of that same data — keep the labels consistent
("handled"/"skipped by agent"/"skipped by rule"/"filtered: bot noise") across
both surfaces. Reuse `QueueOutcomeResult` semantics: `ok → handled`,
`pass → skipped by the agent`, `error → errored`.

---

## IMPLEMENTATION SLICES (strict file-ownership, parallel-safe)

Three slices, no shared files → build in parallel without collisions. Shared
type additions are front-loaded into Slice A's files which B/C only *read*.

### Slice A — backend / model (owns `src/**` + `shared/**` + `web/ui/hookConfig.ts`)

- `src/hooks/schema.ts`: add `GitHubTriggers` interface +
  `gitHubTriggersToHookConfig(m): HookConfig | null` +
  `hookConfigToGitHubTriggers(c): { matrix, representable }`. Keep
  `DEFAULT_PR_ACTIONS` the single source for "PR updates".
- `web/ui/hookConfig.ts`: mirror the same `GitHubTriggers` type + the two pure
  mapping fns + `summarizeGitHubTriggers` (no React; pure, browser-safe). This is
  the file the v3 editor imports (the daemon `schema.ts` can't be imported by
  web). Add `classGlob`/`authorsFromGlob` helpers here (lifted from the logic in
  `HookConfigEditor.tsx`) as the shared mapping primitives.
- `src/hooks/skip.ts` + `src/ui/services/threadParts.ts`: the rule-skip FYI label
  — emit `[skip:rule] <reason>` for config/self skips and add `"rule"` to
  `FYI_STATUS_SUFFIXES`. (Trace the `writeStaticSkipSession` caller in the hook
  fire/skip path — `onHookSkip` wiring — to set the prefix only for the
  non-prefilter/non-ignore case.)
- Optional WHAT-line tightening in the prompt header (`renderHookSummaryMarkdown`
  / `src/commands/start.ts`) to lead with `event · @actor · #PR`.
- Tests: round-trip each of the 4 matrix combos + non-representable fallback
  (`schema.ts`/`hookConfig.ts`); parser test that `[skip:rule]` ⇒
  `notInContext` (extend `threadParts-parser.test.ts`).
- **Owns no `web/v3/**` files.**

### Slice B — v3 editor (owns `web/v3/sections/RoutinesView.tsx` + new `web/v3/components/GitHubTriggersPanel.tsx`)

- New `GitHubTriggersPanel.tsx`: the 2×2 grid + collapsible Advanced + summary
  line + raw/disabled fallback. Imports the pure mapping fns +
  `summarizeGitHubTriggers` from `web/ui/hookConfig.ts` (Slice A) and reads/writes
  `JobFrontmatter.hookConfig` via the existing `readFrontmatter`/`writeFrontmatter`.
- `RoutinesView.tsx` `ConfigPane`: mount `GitHubTriggersPanel` in place of the
  GitHub portion (keep schedule + Sentry/Datadog as-is). Merge discipline: panel
  owns only `pr/comments/skipSelf`, preserves `sentry/datadog`.
- darwin-ui / daisyUI components only (checkbox, collapsible, segmented control).
- **Reads Slice A's pure fns; touches no `src/**`, no `web/v3/components/parts/**`.**

### Slice C — chat outcome rendering (owns `web/v3/components/parts/**`)

- `web/v3/components/parts/InfoPart.tsx` + `SystemPart.tsx` (+ a small
  `outcomeLabel.ts`): derive the friendly header ("Handled by the agent" /
  "Skipped by the agent" / "Skipped by a rule" / "Filtered: bot noise") from the
  `[ok]`/`[skip]`/`[skip:rule]`/`[skip:fyi]`/`[skip:ignore]` marker. Purely
  presentational over the `ChatPart.text` + `notInContext` flag that Slice A's
  parser already sets.
- Keep the WHAT trigger card collapsed-by-default (already `InfoCard`); ensure the
  first line is the one-line WHAT.
- **Consumes the `ChatPart`/`notInContext` contract from `shared/transcriptParts.ts`
  (read-only) and the markers Slice A emits. Touches no `src/**`, no editor files.**

### Interface contracts between slices (so they don't block each other)

- A → B: `GitHubTriggers`, `gitHubTriggersToHookConfig`,
  `hookConfigToGitHubTriggers`, `summarizeGitHubTriggers`, `classGlob`/
  `authorsFromGlob` exported from `web/ui/hookConfig.ts`. B can stub these
  against the types and integrate when A lands.
- A → C: the marker grammar `[ok] | [skip] | [skip:rule] | [skip:fyi] |
  [skip:ignore]` and the `notInContext` flag on the corresponding parts. C reads
  markers off `ChatPart.text`; no runtime dependency on A beyond the string
  convention.
- B and C never share a file.

Run `typecheck` + the touched test files per slice
(`bun test src/__tests__/threadParts-parser.test.ts` and the hookConfig
round-trip tests for A). Per CLAUDE.md, before opening the PR run
`bun run bump:plugin-version` + `bun run bump:marketplace-version`.
