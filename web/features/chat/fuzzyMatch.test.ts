import { describe, expect, it } from "bun:test";
import { fuzzyFilter, scoreFuzzy } from "./fuzzyMatch";

describe("scoreFuzzy", () => {
  it("returns 0 for empty query", () => {
    expect(scoreFuzzy("", "anything")).toBe(0);
  });

  it("returns high score for prefix match", () => {
    const score = scoreFuzzy("sys", "system-check");
    expect(score).toBeGreaterThan(900);
  });

  it("returns lower score for subsequence match", () => {
    // "sch" is a subsequence of "system-check" but not a prefix
    const score = scoreFuzzy("sch", "system-check");
    expect(score).not.toBeNull();
    if (score !== null) expect(score).toBeLessThan(500);
  });

  it("returns null when no subsequence match", () => {
    expect(scoreFuzzy("xyz", "abc")).toBeNull();
  });

  it("prefix match scores higher than subsequence match", () => {
    const prefix = scoreFuzzy("go", "goal");
    const subseq = scoreFuzzy("go", "mongo");
    expect(prefix).not.toBeNull();
    expect(subseq).not.toBeNull();
    if (prefix !== null && subseq !== null)
      expect(prefix).toBeGreaterThan(subseq);
  });

  it("is case-insensitive", () => {
    expect(scoreFuzzy("GOAL", "goal")).not.toBeNull();
    expect(scoreFuzzy("goal", "GOAL")).not.toBeNull();
  });
});

describe("fuzzyFilter", () => {
  const items = [
    { name: "goal" },
    { name: "loop" },
    { name: "model" },
    { name: "effort" },
    { name: "system-check" },
  ];

  it("returns all items for empty query (sorted by score=0)", () => {
    const result = fuzzyFilter(items, "", (i) => i.name);
    expect(result).toHaveLength(items.length);
  });

  it("filters to matching items", () => {
    const result = fuzzyFilter(items, "go", (i) => i.name);
    expect(result.map((r) => r.name)).toContain("goal");
    expect(result.map((r) => r.name)).not.toContain("loop");
  });

  it("puts prefix matches before subsequence matches", () => {
    // "sy" is prefix of "system-check"
    const result = fuzzyFilter(items, "sy", (i) => i.name);
    expect(result[0]?.name).toBe("system-check");
  });

  it("returns empty array when nothing matches", () => {
    const result = fuzzyFilter(items, "zzz", (i) => i.name);
    expect(result).toHaveLength(0);
  });
});
