import { describe, expect, it } from "bun:test";
import {
  isClientSlashCommand,
  parseClientSlashCommand,
  parseLoopArgs,
  prettyCron,
} from "./slashIntercept";

describe("parseLoopArgs", () => {
  it("parses Nm interval", () => {
    const r = parseLoopArgs("5m write a haiku");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cron).toBe("*/5 * * * *");
    expect(r.prompt).toBe("write a haiku");
  });

  it("parses Nh interval", () => {
    const r = parseLoopArgs("2h check uptime");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cron).toBe("0 */2 * * *");
    expect(r.prompt).toBe("check uptime");
  });

  it("parses Nd interval", () => {
    const r = parseLoopArgs("1d daily summary");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cron).toBe("0 0 */1 * *");
    expect(r.prompt).toBe("daily summary");
  });

  it("parses quoted cron expression", () => {
    const r = parseLoopArgs('"0 9 * * 1" weekly standup');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cron).toBe("0 9 * * 1");
    expect(r.prompt).toBe("weekly standup");
  });

  it("rejects empty input", () => {
    const r = parseLoopArgs("");
    expect(r.ok).toBe(false);
  });

  it("rejects interval without prompt", () => {
    const r = parseLoopArgs("5m");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("No prompt");
  });

  it("rejects out-of-range minutes", () => {
    const r = parseLoopArgs("9999m foo");
    expect(r.ok).toBe(false);
  });

  it("rejects unknown interval format", () => {
    const r = parseLoopArgs("5s foo");
    expect(r.ok).toBe(false);
  });

  it("rejects unclosed quoted cron", () => {
    const r = parseLoopArgs('"0 9 * * 1 foo');
    expect(r.ok).toBe(false);
  });
});

describe("prettyCron", () => {
  it("formats every-N-minutes cron", () => {
    expect(prettyCron("*/5 * * * *")).toBe("every 5 min");
  });

  it("formats every-N-hours cron", () => {
    expect(prettyCron("0 */2 * * *")).toBe("every 2h");
  });

  it("formats every-N-days cron", () => {
    expect(prettyCron("0 0 */3 * *")).toBe("every 3d");
  });

  it("falls back to raw cron for unrecognised patterns", () => {
    const raw = "0 9 * * 1";
    expect(prettyCron(raw)).toBe(`cron: ${raw}`);
  });

  it("returns input unchanged for non-5-field crons", () => {
    expect(prettyCron("0 9 1")).toBe("0 9 1");
  });
});

describe("isClientSlashCommand", () => {
  it("recognises /goal", () =>
    expect(isClientSlashCommand("/goal")).toBe(true));
  it("recognises /goal arg", () =>
    expect(isClientSlashCommand("/goal test")).toBe(true));
  it("recognises /loop", () =>
    expect(isClientSlashCommand("/loop 5m foo")).toBe(true));
  it("recognises /model", () =>
    expect(isClientSlashCommand("/model opus")).toBe(true));
  it("recognises /effort", () =>
    expect(isClientSlashCommand("/effort high")).toBe(true));
  it("does not match other commands", () =>
    expect(isClientSlashCommand("/system-check")).toBe(false));
  it("does not match plain text", () =>
    expect(isClientSlashCommand("hello")).toBe(false));
});

describe("parseClientSlashCommand", () => {
  it("parses /goal with arg", () => {
    const r = parseClientSlashCommand("/goal test goal");
    expect(r?.name).toBe("goal");
    expect(r?.arg).toBe("test goal");
  });

  it("parses /goal without arg", () => {
    const r = parseClientSlashCommand("/goal");
    expect(r?.name).toBe("goal");
    expect(r?.arg).toBe("");
  });

  it("parses /loop", () => {
    const r = parseClientSlashCommand("/loop 5m haiku");
    expect(r?.name).toBe("loop");
    expect(r?.arg).toBe("5m haiku");
  });

  it("parses /model", () => {
    const r = parseClientSlashCommand("/model claude-opus-4-5");
    expect(r?.name).toBe("model");
    expect(r?.arg).toBe("claude-opus-4-5");
  });

  it("parses /effort", () => {
    const r = parseClientSlashCommand("/effort high");
    expect(r?.name).toBe("effort");
    expect(r?.arg).toBe("high");
  });

  it("returns null for non-client commands", () => {
    expect(parseClientSlashCommand("/system-check")).toBeNull();
  });
});
