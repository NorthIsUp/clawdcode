import { describe, expect, it } from "bun:test";
import { parseJobFrontmatter, summarizeFrontmatter } from "./jobFrontmatter";

describe("parseJobFrontmatter", () => {
  it("returns null when no frontmatter", () => {
    expect(parseJobFrontmatter("just plain text")).toBeNull();
  });

  it("returns null when frontmatter has no schedule:", () => {
    const content = "---\nmodel: sonnet\n---\n\nBody text";
    expect(parseJobFrontmatter(content)).toBeNull();
  });

  it("parses minimal frontmatter with only schedule:", () => {
    const content = "---\nschedule: 0 * * * *\n---\n\nBody text";
    const fm = parseJobFrontmatter(content);
    expect(fm).not.toBeNull();
    expect(fm?.schedule).toBe("0 * * * *");
  });

  it("parses all fields", () => {
    const content =
      "---\nschedule: every 1h\nrecurring: true\nnotify: error\nmodel: haiku\nreuse_session: yes\nretry: 3\nretry_delay: 5m\ntimeout: 30\n---\n\nBody";
    const fm = parseJobFrontmatter(content);
    expect(fm?.schedule).toBe("every 1h");
    expect(fm?.recurring).toBe("true");
    expect(fm?.notify).toBe("error");
    expect(fm?.model).toBe("haiku");
    expect(fm?.reuseSession).toBe("yes");
    expect(fm?.retry).toBe("3");
    expect(fm?.retryDelay).toBe("5m");
    expect(fm?.timeout).toBe("30");
  });

  it("strips surrounding quotes from values", () => {
    const content = '---\nschedule: "0 * * * *"\n---\n\nBody';
    const fm = parseJobFrontmatter(content);
    expect(fm?.schedule).toBe("0 * * * *");
  });
});

describe("summarizeFrontmatter", () => {
  it("shows schedule at minimum", () => {
    const result = summarizeFrontmatter({ schedule: "0 9 * * 1" });
    expect(result).toBe("schedule: 0 9 * * 1");
  });

  it("shows recurring on when true", () => {
    const result = summarizeFrontmatter({ schedule: "x", recurring: "true" });
    expect(result).toContain("recurring");
    expect(result).not.toContain("recurring: off");
  });

  it("shows recurring: off when false", () => {
    const result = summarizeFrontmatter({ schedule: "x", recurring: "false" });
    expect(result).toContain("recurring: off");
  });

  it("shows notify: off when false", () => {
    const result = summarizeFrontmatter({ schedule: "x", notify: "no" });
    expect(result).toContain("notify: off");
  });

  it("shows notify: error for error value", () => {
    const result = summarizeFrontmatter({ schedule: "x", notify: "error" });
    expect(result).toContain("notify: error");
  });

  it("shows model when set", () => {
    const result = summarizeFrontmatter({ schedule: "x", model: "haiku" });
    expect(result).toContain("model: haiku");
  });

  it("shows timeout with m suffix", () => {
    const result = summarizeFrontmatter({ schedule: "x", timeout: "30" });
    expect(result).toContain("timeout: 30m");
  });
});
