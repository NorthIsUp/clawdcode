import { describe, expect, it } from "bun:test";
import { isPluginAutoUpdateDue, type PluginAutoUpdateConfig } from "../config";

const HOUR = 60 * 60 * 1000;
const on = (intervalHours = 3): PluginAutoUpdateConfig => ({ enabled: true, intervalHours });

describe("isPluginAutoUpdateDue", () => {
  it("is never due when disabled, even if the interval elapsed", () => {
    expect(isPluginAutoUpdateDue({ enabled: false, intervalHours: 3 }, 0, 100 * HOUR)).toBe(false);
  });

  it("is due once the interval has elapsed since the last run", () => {
    const now = 1_000 * HOUR;
    expect(isPluginAutoUpdateDue(on(3), now - 3 * HOUR, now)).toBe(true);
    expect(isPluginAutoUpdateDue(on(3), now - 4 * HOUR, now)).toBe(true);
  });

  it("is NOT due before the interval elapses", () => {
    const now = 1_000 * HOUR;
    expect(isPluginAutoUpdateDue(on(3), now - 2 * HOUR, now)).toBe(false);
    expect(isPluginAutoUpdateDue(on(3), now, now)).toBe(false);
  });

  it("respects a custom interval", () => {
    const now = 1_000 * HOUR;
    expect(isPluginAutoUpdateDue(on(1), now - 90 * 60 * 1000, now)).toBe(true);
    expect(isPluginAutoUpdateDue(on(6), now - 3 * HOUR, now)).toBe(false);
  });

  it("treats lastRunAt=0 (never run) as due when enabled", () => {
    expect(isPluginAutoUpdateDue(on(3), 0, 100 * HOUR)).toBe(true);
  });
});
