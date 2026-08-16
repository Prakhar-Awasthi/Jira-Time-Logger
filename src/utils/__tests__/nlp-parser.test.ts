import { describe, it, expect } from "vitest";
import { parseNaturalLanguage } from "../nlp-parser";

// ---------------------------------------------------------------------------
// Happy-path: basic extraction
// ---------------------------------------------------------------------------

describe("parseNaturalLanguage — basic extraction", () => {
  it("parses issue key and whole hours", () => {
    const result = parseNaturalLanguage("PROJ-123 2h code review");
    expect(result.success).toBe(true);
    expect(result.entries[0].issueKey).toBe("PROJ-123");
    expect(result.entries[0].timeSpent).toBe("2h");
  });

  it("parses minutes", () => {
    const result = parseNaturalLanguage("PROJ-1 45m standup");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("45m");
  });

  it("parses explicit combined hours-and-minutes", () => {
    const result = parseNaturalLanguage("PROJ-1 1h 30m bug fix");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("1h 30m");
  });

  it("converts decimal hours to hours + minutes", () => {
    const result = parseNaturalLanguage("PROJ-1 1.5h refactoring");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("1h 30m");
  });

  it("converts sub-hour decimal to minutes", () => {
    const result = parseNaturalLanguage("PROJ-1 0.5h standup");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("30m");
  });

  it("accepts issue key with digits in the project part", () => {
    const result = parseNaturalLanguage("AB2-99 1h work");
    expect(result.success).toBe(true);
    expect(result.entries[0].issueKey).toBe("AB2-99");
  });
});

// ---------------------------------------------------------------------------
// Natural-language time words
// ---------------------------------------------------------------------------

describe("parseNaturalLanguage — time word aliases", () => {
  it('"half hour" → 30m', () => {
    const result = parseNaturalLanguage("half hour on PROJ-1");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("30m");
  });

  it('"half an hour" → 30m', () => {
    const result = parseNaturalLanguage("PROJ-1 half an hour review");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("30m");
  });

  it('"an hour" → 1h', () => {
    const result = parseNaturalLanguage("PROJ-1 an hour review");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("1h");
  });

  it('"one hour" → 1h', () => {
    const result = parseNaturalLanguage("one hour on PROJ-2 design");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("1h");
  });

  it('"couple hours" → 2h', () => {
    const result = parseNaturalLanguage("PROJ-2 couple hours debugging");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("2h");
  });

  it('"couple of hours" → 2h', () => {
    const result = parseNaturalLanguage("couple of hours PROJ-1 meetings");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("2h");
  });

  it('"few hours" → 3h', () => {
    const result = parseNaturalLanguage("PROJ-1 few hours planning");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("3h");
  });

  it('"quarter hour" → 15m', () => {
    const result = parseNaturalLanguage("PROJ-1 quarter hour check-in");
    expect(result.success).toBe(true);
    expect(result.entries[0].timeSpent).toBe("15m");
  });
});

// ---------------------------------------------------------------------------
// Multiple entries
// ---------------------------------------------------------------------------

describe("parseNaturalLanguage — multiple entries", () => {
  it("parses comma-separated entries", () => {
    const result = parseNaturalLanguage("PROJ-1 2h design, PROJ-2 1h review");
    expect(result.success).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].issueKey).toBe("PROJ-1");
    expect(result.entries[1].issueKey).toBe("PROJ-2");
  });

  it("parses newline-separated entries", () => {
    const result = parseNaturalLanguage("PROJ-1 2h design\nPROJ-2 1h review");
    expect(result.success).toBe(true);
    expect(result.entries).toHaveLength(2);
  });

  it("returns success:true with error message for partially parseable input", () => {
    const result = parseNaturalLanguage("PROJ-1 2h design, totally invalid garbage");
    expect(result.success).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.error).toBeTruthy(); // partial-parse warning
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("parseNaturalLanguage — error cases", () => {
  it("fails when there is no issue key", () => {
    const result = parseNaturalLanguage("2h working on stuff");
    expect(result.success).toBe(false);
    expect(result.entries).toHaveLength(0);
  });

  it("fails when there is no time duration", () => {
    const result = parseNaturalLanguage("PROJ-1 code review");
    expect(result.success).toBe(false);
  });

  it("fails for empty string", () => {
    const result = parseNaturalLanguage("");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("fails for whitespace-only input", () => {
    const result = parseNaturalLanguage("   ");
    expect(result.success).toBe(false);
  });

  it("fails for two unparseable entries", () => {
    const result = parseNaturalLanguage("just words here, more words there");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Comment extraction
// ---------------------------------------------------------------------------

describe("parseNaturalLanguage — comment extraction", () => {
  it("extracts comment text after removing issue key and time", () => {
    const result = parseNaturalLanguage("PROJ-1 2h bug fix in auth module");
    expect(result.entries[0].comment).toBe("bug fix in auth module");
  });

  it('strips "spent" and "on" filler words from comment', () => {
    const result = parseNaturalLanguage("spent 2h on PROJ-1 review");
    const comment = result.entries[0].comment;
    expect(comment).not.toMatch(/\bspent\b/i);
    expect(comment).not.toMatch(/\bon\b/i);
  });

  it('strips "working on" and "doing" filler words', () => {
    const result = parseNaturalLanguage("PROJ-2 1h doing code review");
    const comment = result.entries[0].comment;
    expect(comment).not.toMatch(/\bdoing\b/i);
  });

  it('falls back to "Work logged" when nothing remains', () => {
    const result = parseNaturalLanguage("PROJ-1 2h");
    expect(result.entries[0].comment).toBe("Work logged");
  });
});
