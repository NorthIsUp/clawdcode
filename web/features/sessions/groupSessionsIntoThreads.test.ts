import { describe, expect, it } from "bun:test";
import type { SessionInfo } from "../../api/sessions";
import {
  getThreadKeyForSession,
  groupSessionsIntoThreads,
} from "./groupSessionsIntoThreads";

function makeSession(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    id: "s1",
    agent: "global",
    channel: "web",
    lastUsedAt: "2026-05-22T12:00:00Z",
    createdAt: "2026-05-22T11:00:00Z",
    turnCount: 1,
    firstMessage: "hello",
    lastMessage: "world",
    closed: false,
    ...overrides,
  };
}

describe("groupSessionsIntoThreads", () => {
  it("returns empty array for empty input", () => {
    expect(groupSessionsIntoThreads([])).toHaveLength(0);
  });

  it("groups job sessions by jobName", () => {
    const sessions = [
      makeSession({ id: "s1", jobName: "daily.md", channel: "job" }),
      makeSession({ id: "s2", jobName: "daily.md", channel: "job" }),
    ];
    const threads = groupSessionsIntoThreads(sessions);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.kind).toBe("job");
    expect(threads[0]?.label).toBe("daily.md");
    expect(threads[0]?.sessions).toHaveLength(2);
  });

  it("groups discord sessions into a single discord thread", () => {
    const sessions = [
      makeSession({ id: "s1", channel: "discord" }),
      makeSession({ id: "s2", channel: "discord" }),
    ];
    const threads = groupSessionsIntoThreads(sessions);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.kind).toBe("discord");
    expect(threads[0]?.label).toBe("Discord");
  });

  it("groups web sessions into a single web thread", () => {
    const sessions = [
      makeSession({ id: "s1", channel: "web" }),
      makeSession({ id: "s2", channel: "web" }),
    ];
    const threads = groupSessionsIntoThreads(sessions);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.kind).toBe("web");
  });

  it("groups agent sessions by agent name", () => {
    const sessions = [
      makeSession({ id: "s1", channel: "agent", agent: "bot1" }),
      makeSession({ id: "s2", channel: "agent", agent: "bot2" }),
    ];
    const threads = groupSessionsIntoThreads(sessions);
    expect(threads).toHaveLength(2);
    expect(threads.every((t) => t.kind === "agent")).toBe(true);
  });

  it("sorts sessions within a thread newest-first", () => {
    const sessions = [
      makeSession({
        id: "s1",
        jobName: "job.md",
        channel: "job",
        lastUsedAt: "2026-05-22T10:00:00Z",
      }),
      makeSession({
        id: "s2",
        jobName: "job.md",
        channel: "job",
        lastUsedAt: "2026-05-22T12:00:00Z",
      }),
    ];
    const threads = groupSessionsIntoThreads(sessions);
    expect(threads[0]?.sessions[0]?.id).toBe("s2");
  });

  it("sorts threads by their newest session newest-first", () => {
    const sessions = [
      makeSession({
        id: "s1",
        channel: "web",
        lastUsedAt: "2026-05-22T08:00:00Z",
      }),
      makeSession({
        id: "s2",
        channel: "discord",
        lastUsedAt: "2026-05-22T12:00:00Z",
      }),
    ];
    const threads = groupSessionsIntoThreads(sessions);
    expect(threads[0]?.kind).toBe("discord");
    expect(threads[1]?.kind).toBe("web");
  });

  it("separates different job names into different threads", () => {
    const sessions = [
      makeSession({ id: "s1", jobName: "job-a.md", channel: "job" }),
      makeSession({ id: "s2", jobName: "job-b.md", channel: "job" }),
    ];
    const threads = groupSessionsIntoThreads(sessions);
    expect(threads).toHaveLength(2);
  });
});

describe("getThreadKeyForSession", () => {
  it("returns job key for job sessions", () => {
    const s = makeSession({ jobName: "daily.md", channel: "job" });
    expect(getThreadKeyForSession(s)).toBe("job:daily.md");
  });

  it("returns agent key for agent sessions", () => {
    const s = makeSession({ channel: "agent", agent: "mybot" });
    expect(getThreadKeyForSession(s)).toBe("agent:mybot");
  });

  it("returns discord for discord sessions", () => {
    const s = makeSession({ channel: "discord" });
    expect(getThreadKeyForSession(s)).toBe("discord");
  });

  it("returns web for web sessions", () => {
    const s = makeSession({ channel: "web" });
    expect(getThreadKeyForSession(s)).toBe("web");
  });
});
