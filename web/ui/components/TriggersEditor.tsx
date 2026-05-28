import { CalendarClock, GitPullRequest, LineChart, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { defaultPrRule } from "../hookConfig";
import type { JobFrontmatter } from "../schedule";
import { Card } from "./Card";
import { HookConfigEditor } from "./HookConfigEditor";
import { ScheduleEditor } from "./ScheduleEditor";

/**
 * Unified editor for everything that can fire a routine: cron schedules
 * and event hooks (GitHub today, Datadog soon). Subsections stack
 * vertically inside one logical "Triggers" group, with explicit
 * `+ schedule / + gh hook / + dd hook` buttons up top.
 *
 * Frontmatter contract is unchanged — this is a presentational
 * regrouping over the existing ScheduleEditor / HookConfigEditor
 * components.
 *
 * Composes:
 *   - <ScheduleEditor>      for the cron / preset / recurring fields
 *   - <HookConfigEditor>    for the on.pr / on.comments block
 *   - inline placeholder    for Datadog hooks (no frontmatter wiring yet)
 *
 * Enabled and Notify live at the top/bottom — they're routine-wide
 * settings, not triggers.
 */
export function TriggersEditor({
  value,
  onChange,
}: {
  value: JobFrontmatter;
  onChange: (next: JobFrontmatter) => void;
}) {
  // Datadog hook has no backend wiring yet — track presence locally so
  // the placeholder subsection survives re-renders within this session
  // but doesn't leak into the saved frontmatter.
  const [datadogActive, setDatadogActive] = useState(false);

  const scheduleActive = value.schedule.trim() !== "";
  const ghHookActive =
    (value.hookConfig?.pr.length ?? 0) > 0 ||
    value.hookConfig?.comments === true ||
    (typeof value.hookConfig?.comments === "object" && value.hookConfig?.comments !== null);

  function addSchedule() {
    // Default to a sensible preset — every 5 minutes — so the editor
    // isn't empty. The user can immediately retune via the slider.
    onChange({ ...value, schedule: "*/5 * * * *" });
  }

  function removeSchedule() {
    onChange({ ...value, schedule: "", recurring: null });
  }

  function addGhHook() {
    // Seed a single empty PR rule so HookConfigEditor lights up with a
    // RuleCard the user can fill in.
    onChange({
      ...value,
      hookConfig: {
        skipSelf: true,
        pr: [defaultPrRule()],
      },
    });
  }

  function removeGhHook() {
    onChange({ ...value, hookConfig: null });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold mr-1">Triggers</h3>
        {!scheduleActive && (
          <button type="button" className="btn btn-xs btn-outline" onClick={addSchedule}>
            <Plus size={12} /> schedule
          </button>
        )}
        {!ghHookActive && (
          <button type="button" className="btn btn-xs btn-outline" onClick={addGhHook}>
            <Plus size={12} /> gh hook
          </button>
        )}
        {!datadogActive && (
          <button
            type="button"
            className="btn btn-xs btn-outline"
            onClick={() => setDatadogActive(true)}
          >
            <Plus size={12} /> dd hook
          </button>
        )}
      </div>

      {!scheduleActive && !ghHookActive && !datadogActive && (
        <p className="text-xs text-base-content/60 italic">
          No triggers yet. Add a schedule to run on a cron, or a hook to fire on events.
        </p>
      )}

      {scheduleActive && (
        <TriggerSubsection
          icon={<CalendarClock size={14} className="opacity-70" />}
          label="Schedule"
          onRemove={removeSchedule}
        >
          <ScheduleEditor value={value} onChange={onChange} />
        </TriggerSubsection>
      )}

      {ghHookActive && (
        <TriggerSubsection
          icon={<GitPullRequest size={14} className="opacity-70" />}
          label="GitHub hooks"
          onRemove={removeGhHook}
        >
          <HookConfigEditor
            value={value.hookConfig}
            onChange={(next) => onChange({ ...value, hookConfig: next })}
          />
        </TriggerSubsection>
      )}

      {datadogActive && (
        <TriggerSubsection
          icon={<LineChart size={14} className="opacity-70" />}
          label="Datadog hooks"
          onRemove={() => setDatadogActive(false)}
        >
          <div className="text-xs text-base-content/70 space-y-1">
            <div className="font-medium text-base-content/90">Coming soon</div>
            <div>Backend wiring lands next. Until then this trigger does nothing.</div>
          </div>
        </TriggerSubsection>
      )}
    </section>
  );
}

function TriggerSubsection({
  icon,
  label,
  onRemove,
  children,
}: {
  icon: ReactNode;
  label: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {label}
        </span>
      }
      actions={
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
        >
          <Trash2 size={14} />
        </button>
      }
    >
      {children}
    </Card>
  );
}
