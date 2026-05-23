import { Banner, BannerRow } from "../../components/Banner";

interface Props {
  goal?: string;
  model?: string;
  effort?: string;
  onClearGoal: () => void;
  onClearModel: () => void;
  onClearEffort: () => void;
}

/**
 * Session prefs banner — shows goal/model/effort rows above the chat input.
 * Ported from src/ui/page/script.ts `updatePrefsBanner`, `updateGoalBanner`, etc.
 */
export function PrefsBanner({
  goal,
  model,
  effort,
  onClearGoal,
  onClearModel,
  onClearEffort,
}: Props) {
  if (!goal && !model && !effort) return null;

  return (
    <Banner>
      {goal && (
        <BannerRow label="goal" onClose={onClearGoal}>
          {goal}
        </BannerRow>
      )}
      {model && (
        <BannerRow label="model" onClose={onClearModel}>
          {model}
        </BannerRow>
      )}
      {effort && (
        <BannerRow label="effort" onClose={onClearEffort}>
          {effort}
        </BannerRow>
      )}
    </Banner>
  );
}
