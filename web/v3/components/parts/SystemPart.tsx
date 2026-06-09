import { Webhook } from "lucide-react";
import { InfoCard, SYSTEM_PALETTE } from "./InfoCard";

/**
 * A `system` part — a hook trigger or the agent's terminal status line
 * ("[skip]/[ok] …"). Renders through the shared {@link InfoCard} shell: a long
 * trigger collapses to a one-line summary so it never dominates the thread; a
 * short notice is a compact banner. Both show a timestamp.
 *
 * This is the *in-context* variant (base palette). Its FYI sibling — blocks that
 * were NOT sent to the agent — is `InfoPart` (blue palette), routed in
 * `PartList` on the `notInContext` flag.
 */
export function SystemPart({ text, at }: { text: string; at?: number }) {
  return (
    <InfoCard
      text={text}
      palette={SYSTEM_PALETTE}
      icon={<Webhook className="size-3.5" />}
      {...(at == null ? {} : { at })}
    />
  );
}
