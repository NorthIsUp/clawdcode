import { join } from "path";

const META_FILE = join(process.cwd(), ".claude", "clawdcode", "session-meta.json");

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
export interface SessionMetaEntry {
  title?: string;
  closed?: boolean;
  goal?: string;
  model?: string;
  effort?: EffortLevel;
}
export interface SessionMetaStore {
  sessions: Record<string, SessionMetaEntry>;
}

const VALID_EFFORT_LEVELS: ReadonlySet<string> = new Set(["low", "medium", "high", "xhigh", "max"]);

export function normalizeTitle(raw: string): string {
  return raw.trim().slice(0, 120);
}

export function isValidEffort(s: string): s is EffortLevel {
  return VALID_EFFORT_LEVELS.has(s);
}

export async function getSessionMeta(): Promise<SessionMetaStore> {
  try {
    const data = await Bun.file(META_FILE).json();
    return data && typeof data === "object" && data.sessions ? data : { sessions: {} };
  } catch {
    return { sessions: {} };
  }
}

async function save(store: SessionMetaStore): Promise<void> {
  await Bun.write(META_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

/**
 * Read-modify-write helper. Loads the meta store, hands the per-session
 * entry to `fn` (which mutates in place), and persists. Returns the entry
 * for chaining.
 */
async function mutateMeta(
  id: string,
  fn: (entry: SessionMetaEntry) => void,
): Promise<SessionMetaEntry> {
  const store = await getSessionMeta();
  const entry = store.sessions[id] ?? {};
  fn(entry);
  store.sessions[id] = entry;
  await save(store);
  return entry;
}

async function getField<K extends keyof SessionMetaEntry>(
  id: string,
  key: K,
): Promise<SessionMetaEntry[K] | undefined> {
  const store = await getSessionMeta();
  return store.sessions[id]?.[key];
}

export async function setSessionTitle(id: string, title: string): Promise<void> {
  await mutateMeta(id, (entry) => {
    const t = normalizeTitle(title);
    if (t) {
      entry.title = t;
    } else {
      delete entry.title;
    }
  });
}

export async function setSessionGoal(id: string, goal: string): Promise<void> {
  await mutateMeta(id, (entry) => {
    const g = goal.trim();
    if (g) {
      entry.goal = g;
    } else {
      delete entry.goal;
    }
  });
}

export async function getSessionGoal(id: string): Promise<string> {
  return (await getField(id, "goal")) ?? "";
}

export async function setSessionModel(id: string, model: string): Promise<void> {
  await mutateMeta(id, (entry) => {
    const m = model.trim();
    if (m) {
      entry.model = m;
    } else {
      delete entry.model;
    }
  });
}

export async function getSessionModel(id: string): Promise<string> {
  return (await getField(id, "model")) ?? "";
}

export async function setSessionEffort(id: string, effort: string): Promise<void> {
  const e = effort.trim();
  if (e && !isValidEffort(e)) {
    throw new Error(`Invalid effort level: "${e}". Use: low, medium, high, xhigh, max`);
  }
  await mutateMeta(id, (entry) => {
    if (e) {
      entry.effort = e as EffortLevel;
    } else {
      delete entry.effort;
    }
  });
}

export async function getSessionEffort(id: string): Promise<string> {
  return (await getField(id, "effort")) ?? "";
}

export async function setSessionClosed(id: string, closed: boolean): Promise<void> {
  await mutateMeta(id, (entry) => {
    entry.closed = closed;
  });
}

/** Merge a meta store entry onto a session-info-like object. */
export function mergeMeta<T extends { id: string }>(
  session: T,
  store: SessionMetaStore,
): T & { title?: string; closed: boolean } {
  const entry = store.sessions[session.id] ?? {};
  return { ...session, title: entry.title, closed: entry.closed === true };
}
