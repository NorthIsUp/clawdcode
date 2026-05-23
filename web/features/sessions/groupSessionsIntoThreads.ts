/**
 * Pure function: groups a flat list of sessions into threads.
 * Ported from src/ui/page/script.ts `groupSessionsIntoThreads`.
 */
import type { SessionInfo } from "../../api/sessions";

export type ThreadKind = "job" | "agent" | "discord" | "web";

export interface SessionThread {
  key: string;
  label: string;
  kind: ThreadKind;
  sessions: SessionInfo[];
}

export function groupSessionsIntoThreads(
  sessions: SessionInfo[],
): SessionThread[] {
  const map = new Map<string, SessionThread>();
  const order: string[] = [];

  for (const s of sessions) {
    let key: string;
    let label: string;
    let kind: ThreadKind;

    if (s.jobName) {
      key = `job:${s.jobName}`;
      label = s.jobName;
      kind = "job";
    } else if (s.channel === "agent") {
      key = `agent:${s.agent || "agent"}`;
      label = s.agent || "agent";
      kind = "agent";
    } else if (s.channel === "discord") {
      key = "discord";
      label = "Discord";
      kind = "discord";
    } else {
      key = "web";
      label = "Web";
      kind = "web";
    }

    if (!map.has(key)) {
      map.set(key, { key, label, kind, sessions: [] });
      order.push(key);
    }
    map.get(key)?.sessions.push(s);
  }

  // Sort sessions within each thread newest-first
  const threads = order.flatMap((k) => {
    const t = map.get(k);
    if (!t) return [];
    t.sessions.sort((a, b) => {
      const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return tb - ta;
    });
    return t;
  });

  // Sort threads by their newest session newest-first
  threads.sort((a, b) => {
    const ta = a.sessions[0]?.lastUsedAt
      ? new Date(a.sessions[0].lastUsedAt).getTime()
      : 0;
    const tb = b.sessions[0]?.lastUsedAt
      ? new Date(b.sessions[0].lastUsedAt).getTime()
      : 0;
    return tb - ta;
  });

  return threads;
}

/**
 * Compute the thread key for a given session (used to auto-expand
 * the thread containing the active session).
 */
export function getThreadKeyForSession(s: SessionInfo): string {
  if (s.jobName) return `job:${s.jobName}`;
  if (s.channel === "agent") return `agent:${s.agent || "agent"}`;
  if (s.channel === "discord") return "discord";
  return "web";
}
