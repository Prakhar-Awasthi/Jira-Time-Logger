import { describe, it, expect } from "vitest";
import { parseInput } from "../parser";

describe("parseInput", () => {
  // ---------------------------------------------------------------------------
  // Happy paths
  // ---------------------------------------------------------------------------

  it("parses a single valid line", () => {
    const result = parseInput("PROJ-123:2h:Did some work");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ issueKey: "PROJ-123", timeSpent: "2h", comment: "Did some work" });
  });

  it("parses multiple lines", () => {
    const result = parseInput("PROJ-1:2h:Task A\nPROJ-2:1h:Task B");
    expect(result).toHaveLength(2);
    expect(result[0].issueKey).toBe("PROJ-1");
    expect(result[1].issueKey).toBe("PROJ-2");
  });

  it("skips blank lines", () => {
    const result = parseInput("PROJ-1:2h:Work\n\nPROJ-2:1h:More work\n");
    expect(result).toHaveLength(2);
  });

  it("preserves colons that appear inside the comment", () => {
    const result = parseInput("PROJ-1:2h:Fix: the crash on login");
    expect(result[0].comment).toBe("Fix: the crash on login");
  });

  it("preserves multiple colons inside the comment", () => {
    const result = parseInput("PROJ-1:1h:foo: bar: baz");
    expect(result[0].comment).toBe("foo: bar: baz");
  });

  it("trims surrounding whitespace from each field", () => {
    const result = parseInput("  PROJ-1 : 2h : Some work  ");
    expect(result[0].issueKey).toBe("PROJ-1");
    expect(result[0].timeSpent).toBe("2h");
    expect(result[0].comment).toBe("Some work");
  });

  // ---------------------------------------------------------------------------
  // Error cases — every failure path throws
  // ---------------------------------------------------------------------------

  it("throws when the issue key is missing (empty first segment)", () => {
    expect(() => parseInput(":2h:comment")).toThrow();
  });

  it("throws when the time is missing (empty second segment)", () => {
    expect(() => parseInput("PROJ-1::comment")).toThrow();
  });

  it("throws when the comment is missing (no third segment)", () => {
    expect(() => parseInput("PROJ-1:2h")).toThrow();
  });

  it("throws when the comment is empty after joining and trimming", () => {
    expect(() => parseInput("PROJ-1:2h:")).toThrow();
  });

  it("throws when the comment is all whitespace", () => {
    expect(() => parseInput("PROJ-1:2h:   ")).toThrow();
  });

  it("throws on completely empty input (after filtering blank lines)", () => {
    // All lines are blank, so map produces no results — but filter removes them
    // An all-blank string produces an empty array without throwing
    expect(parseInput("")).toHaveLength(0);
    expect(parseInput("\n\n")).toHaveLength(0);
  });

  it("first valid line succeeds but second invalid line throws", () => {
    expect(() => parseInput("PROJ-1:2h:Good\nBAD LINE")).toThrow();
  });
});
