import { Info } from "lucide-react";
import { InfoCard, INFO_PALETTE } from "./InfoCard";

/**
 * An FYI block that was NOT part of the model's context — a pre-filtered
 * (dropped) hook, a suppressed bot body, the full untruncated payload, or a
 * `[skip:fyi]` / `[skip:ignore]` reason. Rendered in a distinct blue `info`
 * palette via the shared {@link InfoCard} shell so it reads as clearly outside
 * the conversation, with the header "Not sent to the agent (FYI)".
 *
 * Routed in `PartList` whenever a part carries `notInContext: true` (set by the
 * parser from the backend's recorded skip/prefilter decision). The frontend
 * holds no business logic here — it trusts the parser's marking.
 */
export function InfoPart({ text, at }: { text: string; at?: number }) {
  return (
    <InfoCard
      text={text}
      palette={INFO_PALETTE}
      header="Not sent to the agent (FYI)"
      icon={<Info className="size-3.5" />}
      {...(at == null ? {} : { at })}
    />
  );
}
