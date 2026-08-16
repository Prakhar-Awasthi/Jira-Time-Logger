import { describe, it, expect } from "vitest";
import {
  computeBurnoutSignal,
  computeOvertimeHeatmap,
  getTopIssues,
  computeFocusScore,
  computeStreak,
  computeConsistency,
  OvertimeDay,
} from "../insights";
import { Worklog } from "../jira";

let idSeq = 0;
function wl(
  issueKey: string,
  started: string,
  timeSpentSeconds: number,
  extra: Partial<Worklog> = {}
): Worklog {
  return {
    id: String(++idSeq),
    issueKey,
    team: issueKey.split("-")[0],
    timeSpent: `${timeSpentSeconds / 3600}h`,
    timeSpentSeconds,
    comment: "",
    started,
    author: "Test User",
    authorEmail: "test@example.com",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// computeBurnoutSignal
// ---------------------------------------------------------------------------

describe("computeBurnoutSignal", () => {
  const target = 8;

  it("returns inactive for empty heatmap", () => {
    expect(computeBurnoutSignal([], target)).toEqual({
      active: false,
      consecutiveDays: 0,
      overHoursTotal: 0,
      message: "",
    });
  });

  it("stays inactive for a streak of exactly 2", () => {
    const heatmap: OvertimeDay[] = [
      { date: "2026-08-10", dayLabel: "Mon", hours: 9, delta: 1, intensity: 0.1 },
      { date: "2026-08-11", dayLabel: "Tue", hours: 9, delta: 1, intensity: 0.1 },
    ];
    expect(computeBurnoutSignal(heatmap, target).active).toBe(false);
    expect(computeBurnoutSignal(heatmap, target).consecutiveDays).toBe(2);
  });

  it("activates for exactly 3 consecutive over-target workdays", () => {
    const heatmap: OvertimeDay[] = [
      { date: "2026-08-10", dayLabel: "Mon", hours: 10, delta: 2, intensity: 0.25 },
      { date: "2026-08-11", dayLabel: "Tue", hours: 9, delta: 1, intensity: 0.125 },
      { date: "2026-08-12", dayLabel: "Wed", hours: 9.5, delta: 1.5, intensity: 0.2 },
    ];
    const result = computeBurnoutSignal(heatmap, target);
    expect(result.active).toBe(true);
    expect(result.consecutiveDays).toBe(3);
    expect(result.overHoursTotal).toBeCloseTo(4.5, 1);
    expect(result.message).toMatch(/3 consecutive/);
  });

  it("ignores Saturday and Sunday entries", () => {
    // Sat + Sun + Mon = 3 entries, but only Mon is a workday → streak of 1, not 3
    const heatmap: OvertimeDay[] = [
      { date: "2026-08-15", dayLabel: "Sat", hours: 10, delta: 2, intensity: 0.25 },
      { date: "2026-08-16", dayLabel: "Sun", hours: 10, delta: 2, intensity: 0.25 },
      { date: "2026-08-17", dayLabel: "Mon", hours: 10, delta: 2, intensity: 0.25 },
    ];
    const result = computeBurnoutSignal(heatmap, target);
    expect(result.active).toBe(false);
    expect(result.consecutiveDays).toBe(1);
  });

  it("resets streak on a day at exactly the target", () => {
    const heatmap: OvertimeDay[] = [
      { date: "2026-08-10", dayLabel: "Mon", hours: 10, delta: 2, intensity: 0.25 },
      { date: "2026-08-11", dayLabel: "Tue", hours: 8, delta: 0, intensity: 0 }, // exactly on target
      { date: "2026-08-12", dayLabel: "Wed", hours: 10, delta: 2, intensity: 0.25 },
      { date: "2026-08-13", dayLabel: "Thu", hours: 10, delta: 2, intensity: 0.25 },
      { date: "2026-08-14", dayLabel: "Fri", hours: 10, delta: 2, intensity: 0.25 },
    ];
    const result = computeBurnoutSignal(heatmap, target);
    // Mon breaks on Tue; Wed–Fri = streak of 3
    expect(result.consecutiveDays).toBe(3);
    expect(result.active).toBe(true);
  });

  it("counts surplus hours correctly", () => {
    const heatmap: OvertimeDay[] = [
      { date: "2026-08-10", dayLabel: "Mon", hours: 10, delta: 2, intensity: 0.25 },
      { date: "2026-08-11", dayLabel: "Tue", hours: 9, delta: 1, intensity: 0.125 },
      { date: "2026-08-12", dayLabel: "Wed", hours: 11, delta: 3, intensity: 0.375 },
    ];
    const result = computeBurnoutSignal(heatmap, target);
    expect(result.overHoursTotal).toBeCloseTo(6, 1); // 2 + 1 + 3
  });
});

// ---------------------------------------------------------------------------
// computeOvertimeHeatmap (foundation for burnout)
// ---------------------------------------------------------------------------

describe("computeOvertimeHeatmap", () => {
  it("produces correct delta and intensity", () => {
    const worklogs = [wl("PROJ-1", "2026-08-10T09:00:00", 36000)]; // 10h
    const result = computeOvertimeHeatmap(worklogs, 8);
    expect(result).toHaveLength(1);
    expect(result[0].hours).toBe(10);
    expect(result[0].delta).toBe(2);
  });

  it("aggregates multiple entries on the same day", () => {
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 14400), // 4h
      wl("PROJ-2", "2026-08-10T14:00:00", 18000), // 5h
    ];
    const result = computeOvertimeHeatmap(worklogs, 8);
    expect(result).toHaveLength(1);
    expect(result[0].hours).toBe(9); // 4 + 5 = 9h
  });

  it("returns sorted entries by date", () => {
    const worklogs = [
      wl("PROJ-1", "2026-08-12T09:00:00", 28800),
      wl("PROJ-1", "2026-08-10T09:00:00", 28800),
    ];
    const result = computeOvertimeHeatmap(worklogs, 8);
    expect(result[0].date).toBe("2026-08-10");
    expect(result[1].date).toBe("2026-08-12");
  });
});

// ---------------------------------------------------------------------------
// getTopIssues
// ---------------------------------------------------------------------------

describe("getTopIssues", () => {
  it("returns issues sorted by hours descending", () => {
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 3600),  // 1h
      wl("PROJ-2", "2026-08-10T09:00:00", 7200),  // 2h
      wl("PROJ-1", "2026-08-11T09:00:00", 1800),  // 0.5h
    ];
    const result = getTopIssues(worklogs);
    expect(result[0].issueKey).toBe("PROJ-2"); // 2h
    expect(result[1].issueKey).toBe("PROJ-1"); // 1.5h
  });

  it("aggregates multiple entries for the same issue", () => {
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 3600),
      wl("PROJ-1", "2026-08-11T09:00:00", 3600),
    ];
    const result = getTopIssues(worklogs);
    expect(result[0].entries).toBe(2);
    expect(result[0].hours).toBe(2);
  });

  it("respects the limit parameter", () => {
    const worklogs = Array.from({ length: 12 }, (_, i) =>
      wl(`PROJ-${i}`, "2026-08-10T09:00:00", 3600)
    );
    expect(getTopIssues(worklogs, 5)).toHaveLength(5);
  });

  it("computes percentage correctly for equal splits", () => {
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 3600),
      wl("PROJ-2", "2026-08-10T09:00:00", 3600),
    ];
    const result = getTopIssues(worklogs);
    expect(result[0].percentage).toBe(50);
    expect(result[1].percentage).toBe(50);
  });

  it("returns empty array for no worklogs", () => {
    expect(getTopIssues([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeFocusScore
// ---------------------------------------------------------------------------

describe("computeFocusScore", () => {
  it("returns zero score and NaN-safe values for empty input", () => {
    const result = computeFocusScore([]);
    expect(result.score).toBe(0);
  });

  it("returns score 100 when a single issue worked per day", () => {
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 7200),
      wl("PROJ-1", "2026-08-11T09:00:00", 7200),
    ];
    expect(computeFocusScore(worklogs).score).toBe(100);
  });

  it("score decreases with more issues per day", () => {
    // 3 different issues on the same day → avg 3 issues/day → score = max(0, 100 - 2*15) = 70
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 3600),
      wl("PROJ-2", "2026-08-10T09:00:00", 3600),
      wl("PROJ-3", "2026-08-10T09:00:00", 3600),
    ];
    expect(computeFocusScore(worklogs).score).toBe(70);
    expect(computeFocusScore(worklogs).avgIssuesPerDay).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeStreak
// ---------------------------------------------------------------------------

describe("computeStreak", () => {
  it("returns 0,0 for empty worklogs", () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0 });
  });

  it("computes the longest streak for historical data", () => {
    const worklogs = [
      wl("PROJ-1", "2026-01-05T09:00:00", 3600), // Mon
      wl("PROJ-1", "2026-01-06T09:00:00", 3600), // Tue
      wl("PROJ-1", "2026-01-07T09:00:00", 3600), // Wed
    ];
    expect(computeStreak(worklogs).longest).toBe(3);
  });

  it("bridges Fri→Mon weekend gap", () => {
    const worklogs = [
      wl("PROJ-1", "2026-01-09T09:00:00", 3600), // Fri
      wl("PROJ-1", "2026-01-12T09:00:00", 3600), // Mon (3 calendar days later)
    ];
    expect(computeStreak(worklogs).longest).toBe(2);
  });

  it("breaks streak on mid-week gap > 1 day", () => {
    const worklogs = [
      wl("PROJ-1", "2026-01-05T09:00:00", 3600), // Mon
      wl("PROJ-1", "2026-01-07T09:00:00", 3600), // Wed (skipped Tue)
    ];
    expect(computeStreak(worklogs).longest).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeConsistency
// ---------------------------------------------------------------------------

describe("computeConsistency", () => {
  it("returns score 100 for a single day of logging", () => {
    const worklogs = [wl("PROJ-1", "2026-08-10T09:00:00", 28800)];
    expect(computeConsistency(worklogs).score).toBe(100);
  });

  it("returns lower score when days vary a lot", () => {
    // 1h one day, 9h the next — high variance
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 3600),   // 1h
      wl("PROJ-1", "2026-08-11T09:00:00", 32400),  // 9h
    ];
    const result = computeConsistency(worklogs);
    expect(result.score).toBeLessThan(100);
    expect(result.stdDevHours).toBeGreaterThan(3);
  });

  it("returns score 100 for perfectly consistent days", () => {
    const worklogs = [
      wl("PROJ-1", "2026-08-10T09:00:00", 28800), // 8h
      wl("PROJ-1", "2026-08-11T09:00:00", 28800), // 8h
      wl("PROJ-1", "2026-08-12T09:00:00", 28800), // 8h
    ];
    const result = computeConsistency(worklogs);
    expect(result.score).toBe(100);
    expect(result.stdDevHours).toBe(0);
  });
});
