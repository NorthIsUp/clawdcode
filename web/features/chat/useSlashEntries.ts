/**
 * Fetches /api/slash and prepends CLIENT_SLASH_ENTRIES.
 * Ported from src/ui/page/script.ts `refreshSlashEntries` + CLIENT_SLASH_ENTRIES.
 */
import { useCallback, useEffect, useState } from "react";
import type { SlashEntry } from "../../api/slash";
import { listSlashEntries } from "../../api/slash";

export const CLIENT_SLASH_ENTRIES: SlashEntry[] = [
  {
    name: "goal",
    source: "client",
    kind: "command",
    description: "Set or show the session goal (prepended to every message)",
  },
  {
    name: "loop",
    source: "client",
    kind: "command",
    description: "Schedule a recurring job: /loop 5m <prompt>",
  },
  {
    name: "model",
    source: "client",
    kind: "command",
    description: "Set the model for this session (opus|sonnet|haiku|<id>)",
  },
  {
    name: "effort",
    source: "client",
    kind: "command",
    description: "Set thinking effort: low|medium|high|xhigh|max",
  },
];

/**
 * Returns the combined slash entries (client + server).
 * Fetches once on mount and on demand via `refresh()`.
 */
export function useSlashEntries(): {
  entries: SlashEntry[];
  refresh: () => void;
} {
  const [serverEntries, setServerEntries] = useState<SlashEntry[]>([]);
  const [tick, setTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the intentional refresh trigger
  useEffect(() => {
    let cancelled = false;
    listSlashEntries()
      .then((entries) => {
        if (!cancelled) setServerEntries(Array.isArray(entries) ? entries : []);
      })
      .catch(() => {
        // ignore fetch errors — client entries still work
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Stable reference — safe to include in useEffect dependency arrays.
  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return {
    entries: [...CLIENT_SLASH_ENTRIES, ...serverEntries],
    refresh,
  };
}
