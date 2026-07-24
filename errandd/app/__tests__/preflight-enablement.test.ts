import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyDefaultEnablement } from "../preflight";

// applyDefaultEnablement writes the boot default for a plugin key into
// <projectPath>/.claude/settings.json — but ONLY when the key is absent, so a
// user's dashboard toggle is never clobbered. These tests pin that contract:
// allowlist → true, others → false, existing keys untouched, idempotent.

describe("applyDefaultEnablement", () => {
  let dir: string;
  const settingsPath = () => join(dir, ".claude", "settings.json");
  const readEnabled = (): Record<string, boolean> => {
    const s = JSON.parse(readFileSync(settingsPath(), "utf-8")) as {
      enabledPlugins?: Record<string, boolean>;
    };
    return s.enabledPlugins ?? {};
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preflight-enable-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("absent + in allowlist → written true", () => {
    expect(applyDefaultEnablement("caveman@caveman", dir)).toBe(true);
    expect(readEnabled()["caveman@caveman"]).toBe(true);
  });

  test("absent + not in allowlist → written false (install disabled)", () => {
    expect(applyDefaultEnablement("frontend-design@claude-plugins-official", dir)).toBe(false);
    expect(readEnabled()["frontend-design@claude-plugins-official"]).toBe(false);
  });

  test("context7 uses the context7-marketplace suffix", () => {
    expect(applyDefaultEnablement("context7@context7-marketplace", dir)).toBe(true);
    expect(readEnabled()["context7@context7-marketplace"]).toBe(true);
  });

  test("existing user 'false' is respected even for an allowlist plugin", () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify({ enabledPlugins: { "caveman@caveman": false } }));
    expect(applyDefaultEnablement("caveman@caveman", dir)).toBe(false);
    expect(readEnabled()["caveman@caveman"]).toBe(false);
  });

  test("existing user 'true' is respected even for a non-allowlist plugin", () => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify({ enabledPlugins: { "foo@bar": true } }));
    expect(applyDefaultEnablement("foo@bar", dir)).toBe(true);
    expect(readEnabled()["foo@bar"]).toBe(true);
  });

  test("idempotent: a second call never changes the written default", () => {
    applyDefaultEnablement("skillz@northisup-skillz", dir);
    const first = readFileSync(settingsPath(), "utf-8");
    applyDefaultEnablement("skillz@northisup-skillz", dir);
    expect(readFileSync(settingsPath(), "utf-8")).toBe(first);
  });
});
