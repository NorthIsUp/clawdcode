import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { type JobFrontmatter, PRESETS, presetIndexForCron } from "../schedule";
import { FrequencySlider } from "./FrequencySlider";

/**
 * Edit just the schedule (cron) fields on a job's frontmatter. Pure
 * controlled component — the parent owns the JobFrontmatter draft and
 * the save action.
 *
 * Renders:
 *   - Frequency slider (preset cron stops)
 *   - Advanced cron input (collapsible)
 *   - Recurring toggle
 *
 * Enabled, notify, and hook config live in TriggersEditor — this is
 * intentionally narrow so it can be composed as one trigger subsection
 * inside the unified Triggers UI.
 */
export function ScheduleEditor({
  value,
  onChange,
}: {
  value: JobFrontmatter;
  onChange: (next: JobFrontmatter) => void;
}) {
  const [advanced, setAdvanced] = useState(presetIndexForCron(value.schedule) < 0);

  const presetIndex = presetIndexForCron(value.schedule);
  const safeIndex = presetIndex < 0 ? 0 : presetIndex;

  function selectPreset(i: number) {
    const preset = PRESETS[i];
    if (!preset) {
      return;
    }
    onChange({ ...value, schedule: preset.cron });
  }

  return (
    <div className="space-y-3">
      {presetIndex < 0 ? (
        <p className="text-xs text-base-content/60 italic">
          This schedule doesn’t match a preset. Use Advanced cron below to edit.
        </p>
      ) : (
        <FrequencySlider value={safeIndex} onChange={selectPreset} />
      )}

      <div>
        <button
          type="button"
          onClick={() => setAdvanced((a) => !a)}
          className="inline-flex items-center gap-1 text-sm font-medium text-base-content/80 hover:text-base-content"
          aria-expanded={advanced}
        >
          {advanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Advanced cron
        </button>
        {advanced && (
          <input
            type="text"
            spellCheck={false}
            className="input input-bordered input-sm font-mono w-full mt-2"
            value={value.schedule}
            onChange={(e) => onChange({ ...value, schedule: e.target.value })}
            placeholder="* * * * *"
            aria-label="Cron expression"
          />
        )}
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="toggle toggle-primary toggle-sm"
          checked={value.recurring ?? false}
          onChange={(e) => onChange({ ...value, recurring: e.target.checked })}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium">Recurring</div>
          <div className="text-xs text-base-content/60">
            Re-arm after each run instead of firing once.
          </div>
        </div>
      </label>
    </div>
  );
}
