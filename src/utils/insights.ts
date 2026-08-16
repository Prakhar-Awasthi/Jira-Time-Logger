import { Worklog } from "./jira";
import { formatSeconds } from "./helpers";

export interface WeeklySummary {
  totalSeconds: number;
  targetSeconds: number;
  teamBreakdown: { team: string; seconds: number; percentage: number }[];
  busiestDay: { day: string; seconds: number };
  quietestDay: { day: string; seconds: number };
  avgPerDay: number;
  daysLogged: number;
}

export interface Anomaly {
  type: "duplicate" | "overlog" | "gap" | "excessive";
  message: string;
  severity: "warning" | "info";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TARGET_HOURS_PER_WEEK = 40;

export function generateWeeklySummary(worklogs: Worklog[]): WeeklySummary {
  const totalSeconds = worklogs.reduce((sum, wl) => sum + wl.timeSpentSeconds, 0);

  const teamMap = new Map<string, number>();
  worklogs.forEach(wl => {
    teamMap.set(wl.team, (teamMap.get(wl.team) || 0) + wl.timeSpentSeconds);
  });
  const teamBreakdown = Array.from(teamMap.entries())
    .map(([team, seconds]) => ({
      team,
      seconds,
      percentage: totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const dayMap = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayMap.set(date, (dayMap.get(date) || 0) + wl.timeSpentSeconds);
  });

  let busiestDay = { day: "N/A", seconds: 0 };
  let quietestDay = { day: "N/A", seconds: Infinity };
  dayMap.forEach((seconds, day) => {
    if (seconds > busiestDay.seconds) busiestDay = { day, seconds };
    if (seconds < quietestDay.seconds) quietestDay = { day, seconds };
  });
  if (quietestDay.seconds === Infinity) quietestDay = { day: "N/A", seconds: 0 };

  const daysLogged = dayMap.size;
  const avgPerDay = daysLogged > 0 ? Math.round(totalSeconds / daysLogged) : 0;

  return {
    totalSeconds,
    targetSeconds: TARGET_HOURS_PER_WEEK * 3600,
    teamBreakdown,
    busiestDay,
    quietestDay,
    avgPerDay,
    daysLogged,
  };
}

export function formatSummaryAsText(summary: WeeklySummary): string {
  const total = formatSeconds(summary.totalSeconds);
  const target = formatSeconds(summary.targetSeconds);
  const diff = summary.targetSeconds - summary.totalSeconds;
  const status = diff > 0 ? `${formatSeconds(diff)} under target` : diff < 0 ? `${formatSeconds(-diff)} over target` : "exactly on target";

  let text = `**Weekly Summary**\n\n`;
  text += `Total: **${total}** / ${target} (${status})\n`;
  text += `Days logged: ${summary.daysLogged} | Avg per day: ${formatSeconds(summary.avgPerDay)}\n\n`;

  if (summary.teamBreakdown.length > 0) {
    text += `**Time by team:**\n`;
    summary.teamBreakdown.forEach(t => {
      text += `• ${t.team}: ${formatSeconds(t.seconds)} (${t.percentage}%)\n`;
    });
    text += "\n";
  }

  if (summary.busiestDay.day !== "N/A") {
    text += `Busiest day: ${summary.busiestDay.day} (${formatSeconds(summary.busiestDay.seconds)})\n`;
  }
  if (summary.quietestDay.day !== "N/A") {
    text += `Quietest day: ${summary.quietestDay.day} (${formatSeconds(summary.quietestDay.seconds)})\n`;
  }

  return text;
}

export function detectAnomalies(worklogs: Worklog[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Duplicate detection: same issue + same day + same time
  const seen = new Map<string, number>();
  worklogs.forEach(wl => {
    const key = `${wl.issueKey}-${wl.started.split("T")[0]}-${wl.timeSpent}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  seen.forEach((count, key) => {
    if (count > 1) {
      const [issueKey, date] = key.split("-").slice(0, 2);
      anomalies.push({
        type: "duplicate",
        message: `Possible duplicate: ${key.split("-").slice(0, -1).join("-")} appears ${count} times on the same day`,
        severity: "warning",
      });
    }
  });

  // Excessive daily hours: >10h in a single day
  const dayTotals = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayTotals.set(date, (dayTotals.get(date) || 0) + wl.timeSpentSeconds);
  });
  dayTotals.forEach((seconds, date) => {
    if (seconds > 10 * 3600) {
      anomalies.push({
        type: "excessive",
        message: `${date}: ${formatSeconds(seconds)} logged (over 10 hours)`,
        severity: "warning",
      });
    }
  });

  return anomalies;
}

export function suggestMissingDays(worklogs: Worklog[], startDate: string, endDate: string): string[] {
  const loggedDays = new Set(worklogs.map(wl => wl.started.split("T")[0]));
  const missing: string[] = [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dateStr = current.toISOString().split("T")[0];
      if (!loggedDays.has(dateStr)) {
        missing.push(`${WEEKDAYS[dayOfWeek]} ${dateStr}`);
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return missing;
}

// --- Enhanced analytics utilities ---

export interface TopIssue {
  issueKey: string;
  hours: number;
  percentage: number;
  entries: number;
}

export function getTopIssues(worklogs: Worklog[], limit = 10): TopIssue[] {
  const issueMap = new Map<string, { seconds: number; count: number }>();
  worklogs.forEach(wl => {
    const existing = issueMap.get(wl.issueKey) || { seconds: 0, count: 0 };
    existing.seconds += wl.timeSpentSeconds;
    existing.count++;
    issueMap.set(wl.issueKey, existing);
  });

  const totalSeconds = worklogs.reduce((s, wl) => s + wl.timeSpentSeconds, 0) || 1;

  return Array.from(issueMap.entries())
    .map(([issueKey, data]) => ({
      issueKey,
      hours: data.seconds / 3600,
      percentage: Math.round((data.seconds / totalSeconds) * 100),
      entries: data.count,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, limit);
}

export function computeFocusScore(worklogs: Worklog[]): { score: number; avgIssuesPerDay: number; mostFocused: string } {
  const dayIssues = new Map<string, Set<string>>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    if (!dayIssues.has(date)) dayIssues.set(date, new Set());
    dayIssues.get(date)!.add(wl.issueKey);
  });

  if (dayIssues.size === 0) return { score: 0, avgIssuesPerDay: 0, mostFocused: "N/A" };

  const counts = Array.from(dayIssues.values()).map(s => s.size);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;

  // Score: 100 if avg 1 issue/day, decreases with more context switches
  // Formula: max(0, 100 - (avg - 1) * 15)
  const score = Math.max(0, Math.min(100, Math.round(100 - (avg - 1) * 15)));

  // Find the day with fewest issues (most focused)
  let mostFocused = "N/A";
  let minIssues = Infinity;
  dayIssues.forEach((issues, date) => {
    if (issues.size < minIssues) {
      minIssues = issues.size;
      mostFocused = date;
    }
  });

  return { score, avgIssuesPerDay: Math.round(avg * 10) / 10, mostFocused };
}

export function computeStreak(worklogs: Worklog[]): { current: number; longest: number } {
  const loggedDays = new Set(worklogs.map(wl => wl.started.split("T")[0]));
  if (loggedDays.size === 0) return { current: 0, longest: 0 };

  const sortedDays = Array.from(loggedDays).sort();
  const today = new Date().toISOString().split("T")[0];

  let longest = 1;
  let currentRun = 1;

  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(`${sortedDays[i - 1]}T00:00:00`);
    const curr = new Date(`${sortedDays[i]}T00:00:00`);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    // Allow weekends (skip Sat/Sun)
    const isConsecutiveWorkday = diffDays === 1 || (diffDays <= 3 && prev.getDay() === 5);

    if (isConsecutiveWorkday) {
      currentRun++;
      longest = Math.max(longest, currentRun);
    } else {
      currentRun = 1;
    }
  }
  longest = Math.max(longest, currentRun);

  // Check if streak includes today or yesterday (still active)
  const lastDay = sortedDays[sortedDays.length - 1];
  const lastDate = new Date(`${lastDay}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  const daysSinceLast = (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

  const isActive = daysSinceLast <= 1 || (daysSinceLast <= 3 && lastDate.getDay() === 5);
  const current = isActive ? currentRun : 0;

  return { current, longest };
}

export function computeConsistency(worklogs: Worklog[]): { score: number; stdDevHours: number } {
  const dayTotals = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayTotals.set(date, (dayTotals.get(date) || 0) + wl.timeSpentSeconds);
  });

  const values = Array.from(dayTotals.values()).map(s => s / 3600);
  if (values.length <= 1) return { score: 100, stdDevHours: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Score: 100 if stdDev=0, decreases. stdDev of 4h = ~0
  const score = Math.max(0, Math.min(100, Math.round(100 - stdDev * 25)));

  return { score, stdDevHours: Math.round(stdDev * 10) / 10 };
}

export function computeDayOfWeekPattern(worklogs: Worklog[]): { day: string; avgHours: number }[] {
  const dayTotals: number[][] = [[], [], [], [], [], [], []]; // Sun-Sat

  const dayDateMap = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    const d = new Date(`${date}T00:00:00`);
    const dow = d.getDay();
    const key = `${dow}-${date}`;
    dayDateMap.set(key, (dayDateMap.get(key) || 0) + wl.timeSpentSeconds);
  });

  dayDateMap.forEach((seconds, key) => {
    const dow = parseInt(key.split("-")[0]);
    dayTotals[dow].push(seconds / 3600);
  });

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return DAY_LABELS.map((day, i) => {
    const vals = dayTotals[i];
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { day, avgHours: Math.round(avg * 10) / 10 };
  });
}

export function computeForecast(worklogs: Worklog[], weeklyTargetHours: number): { projectedHours: number; onTrack: boolean; message: string } {
  const dayTotals = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayTotals.set(date, (dayTotals.get(date) || 0) + wl.timeSpentSeconds);
  });

  const totalHours = Array.from(dayTotals.values()).reduce((s, v) => s + v, 0) / 3600;
  const daysElapsed = dayTotals.size || 1;
  const pacePerDay = totalHours / daysElapsed;

  // Assume 5 working days in a week
  const projectedHours = Math.round(pacePerDay * 5 * 10) / 10;
  const onTrack = projectedHours >= weeklyTargetHours;

  let message: string;
  if (onTrack) {
    message = `On track. At ${pacePerDay.toFixed(1)}h/day, you'll hit ~${projectedHours}h this week (target: ${weeklyTargetHours}h).`;
  } else {
    const remaining = weeklyTargetHours - totalHours;
    const daysLeft = Math.max(1, 5 - daysElapsed);
    const needed = remaining / daysLeft;
    message = `Behind pace. Need ${needed.toFixed(1)}h/day for remaining ${daysLeft} day${daysLeft > 1 ? "s" : ""} to hit ${weeklyTargetHours}h target.`;
  }

  return { projectedHours, onTrack, message };
}

export function compareWeeks(currentWorklogs: Worklog[], previousWorklogs: Worklog[]): string {
  const currentHours = currentWorklogs.reduce((s, wl) => s + wl.timeSpentSeconds, 0) / 3600;
  const prevHours = previousWorklogs.reduce((s, wl) => s + wl.timeSpentSeconds, 0) / 3600;
  const diff = currentHours - prevHours;

  const currentIssues = new Set(currentWorklogs.map(wl => wl.issueKey)).size;
  const prevIssues = new Set(previousWorklogs.map(wl => wl.issueKey)).size;

  const currentFocus = computeFocusScore(currentWorklogs);
  const prevFocus = computeFocusScore(previousWorklogs);

  let text = `**This week vs last week:**\n\n`;
  text += `Hours: **${currentHours.toFixed(1)}h** vs ${prevHours.toFixed(1)}h (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}h)\n`;
  text += `Issues: **${currentIssues}** vs ${prevIssues} (${currentIssues - prevIssues >= 0 ? "+" : ""}${currentIssues - prevIssues})\n`;
  text += `Focus: **${currentFocus.score}/100** vs ${prevFocus.score}/100\n`;

  if (diff > 2) text += `\nYou're logging more this week — great momentum.`;
  else if (diff < -2) text += `\nSlower week so far — still time to catch up.`;
  else text += `\nSimilar pace to last week.`;

  return text;
}

// --- Phase 2 analytics utilities ---

export interface OvertimeDay {
  date: string;
  dayLabel: string;
  hours: number;
  delta: number;
  intensity: number;
}

export interface BurnoutSignal {
  active: boolean;
  consecutiveDays: number;
  overHoursTotal: number;
  message: string;
}

export function computeBurnoutSignal(heatmap: OvertimeDay[], dailyTargetHours: number): BurnoutSignal {
  if (heatmap.length === 0) return { active: false, consecutiveDays: 0, overHoursTotal: 0, message: "" };

  const workdays = [...heatmap]
    .filter(d => { const dow = new Date(`${d.date}T00:00:00`).getDay(); return dow >= 1 && dow <= 5; })
    .sort((a, b) => a.date.localeCompare(b.date));

  let maxStreak = 0;
  let maxStreakHours = 0;
  let cur = 0;
  let curHours = 0;

  for (const day of workdays) {
    if (day.hours > dailyTargetHours) {
      cur++;
      curHours += day.hours - dailyTargetHours;
      if (cur > maxStreak) { maxStreak = cur; maxStreakHours = curHours; }
    } else {
      cur = 0;
      curHours = 0;
    }
  }

  const active = maxStreak >= 3;
  return {
    active,
    consecutiveDays: maxStreak,
    overHoursTotal: Math.round(maxStreakHours * 10) / 10,
    message: active
      ? `${maxStreak} consecutive workdays over ${dailyTargetHours}h target (+${maxStreakHours.toFixed(1)}h). Consider a lighter day to recover.`
      : "",
  };
}

export function computeOvertimeHeatmap(worklogs: Worklog[], dailyTargetHours: number): OvertimeDay[] {
  const dayTotals = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayTotals.set(date, (dayTotals.get(date) || 0) + wl.timeSpentSeconds);
  });

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return Array.from(dayTotals.entries())
    .map(([date, seconds]) => {
      const hours = seconds / 3600;
      const delta = hours - dailyTargetHours;
      const intensity = Math.min(1, Math.max(-1, delta / (dailyTargetHours * 0.5)));
      const d = new Date(`${date}T00:00:00`);
      return { date, dayLabel: DAY_LABELS[d.getDay()], hours, delta, intensity };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface DistributionBucket {
  label: string;
  count: number;
  percentage: number;
}

export function computeTimeDistribution(worklogs: Worklog[]): DistributionBucket[] {
  const dayTotals = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayTotals.set(date, (dayTotals.get(date) || 0) + wl.timeSpentSeconds);
  });

  const buckets = [
    { label: "0-2h", min: 0, max: 2 },
    { label: "2-4h", min: 2, max: 4 },
    { label: "4-6h", min: 4, max: 6 },
    { label: "6-8h", min: 6, max: 8 },
    { label: "8h+", min: 8, max: Infinity },
  ];

  const counts = buckets.map(() => 0);
  const totalDays = dayTotals.size || 1;

  dayTotals.forEach(seconds => {
    const hours = seconds / 3600;
    for (let i = 0; i < buckets.length; i++) {
      if (hours >= buckets[i].min && hours < buckets[i].max) {
        counts[i]++;
        break;
      }
    }
  });

  return buckets.map((b, i) => ({
    label: b.label,
    count: counts[i],
    percentage: Math.round((counts[i] / totalDays) * 100),
  }));
}

export interface ProjectMomentum {
  project: string;
  currentHours: number;
  previousHours: number;
  delta: number;
  direction: "up" | "down" | "stable";
}

export function computeProjectMomentum(currentWorklogs: Worklog[], previousWorklogs: Worklog[]): ProjectMomentum[] {
  const getProjectHours = (wls: Worklog[]) => {
    const map = new Map<string, number>();
    wls.forEach(wl => {
      map.set(wl.team, (map.get(wl.team) || 0) + wl.timeSpentSeconds);
    });
    return map;
  };

  const current = getProjectHours(currentWorklogs);
  const previous = getProjectHours(previousWorklogs);
  const allProjects = new Set([...current.keys(), ...previous.keys()]);

  return Array.from(allProjects)
    .map(project => {
      const currentHours = (current.get(project) || 0) / 3600;
      const previousHours = (previous.get(project) || 0) / 3600;
      const delta = currentHours - previousHours;
      const direction: "up" | "down" | "stable" = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "stable";
      return { project, currentHours, previousHours, delta, direction };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export interface FragmentationResult {
  score: number;
  avgEntriesPerDay: number;
  avgDurationMinutes: number;
  worstDay: string;
  bestDay: string;
}

export function computeFragmentationIndex(worklogs: Worklog[]): FragmentationResult {
  const dayEntries = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayEntries.set(date, (dayEntries.get(date) || 0) + 1);
  });

  if (dayEntries.size === 0) return { score: 100, avgEntriesPerDay: 0, avgDurationMinutes: 0, worstDay: "N/A", bestDay: "N/A" };

  const counts = Array.from(dayEntries.values());
  const avgEntries = counts.reduce((a, b) => a + b, 0) / counts.length;
  const score = Math.max(0, Math.min(100, Math.round(100 - (avgEntries - 2) * 20)));

  const totalSeconds = worklogs.reduce((s, wl) => s + wl.timeSpentSeconds, 0);
  const avgDurationMinutes = Math.round(totalSeconds / worklogs.length / 60);

  let worstDay = "N/A";
  let bestDay = "N/A";
  let maxEntries = 0;
  let minEntries = Infinity;
  dayEntries.forEach((count, date) => {
    if (count > maxEntries) { maxEntries = count; worstDay = date; }
    if (count < minEntries) { minEntries = count; bestDay = date; }
  });

  return { score, avgEntriesPerDay: Math.round(avgEntries * 10) / 10, avgDurationMinutes, worstDay, bestDay };
}

export interface DailyGap {
  date: string;
  dayLabel: string;
  actual: number;
  target: number;
  gap: number;
}

export function computeUnloggedGaps(worklogs: Worklog[], startDate: string, endDate: string, dailyTargetHours: number): DailyGap[] {
  const dayTotals = new Map<string, number>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    dayTotals.set(date, (dayTotals.get(date) || 0) + wl.timeSpentSeconds);
  });

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const gaps: DailyGap[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const current = new Date(start);

  while (current <= end) {
    const dow = current.getDay();
    if (dow >= 1 && dow <= 5) {
      const dateStr = current.toISOString().split("T")[0];
      const actual = (dayTotals.get(dateStr) || 0) / 3600;
      const gap = Math.max(0, dailyTargetHours - actual);
      gaps.push({ date: dateStr, dayLabel: DAY_LABELS[dow], actual, target: dailyTargetHours, gap });
    }
    current.setDate(current.getDate() + 1);
  }

  return gaps;
}

// --- AI helper functions ---

export interface TrendingIssue {
  issueKey: string;
  currentHours: number;
  previousHours: number;
  growth: number;
}

export function suggestDayPlan(worklogs: Worklog[], dailyTargetHours: number): string {
  const issueHours = new Map<string, number>();
  worklogs.forEach(wl => {
    issueHours.set(wl.issueKey, (issueHours.get(wl.issueKey) || 0) + wl.timeSpentSeconds);
  });

  const sorted = Array.from(issueHours.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sorted.length === 0) {
    return "No recent work to base a plan on. Start logging and I'll learn your patterns.";
  }

  const totalWeight = sorted.reduce((s, [, sec]) => s + sec, 0);
  let text = `**Suggested plan for today (${dailyTargetHours}h target):**\n\n`;

  sorted.forEach(([key, seconds]) => {
    const proportion = seconds / totalWeight;
    const suggested = Math.round(proportion * dailyTargetHours * 10) / 10;
    text += `- **${key}** — ${suggested}h (based on ${(seconds / 3600).toFixed(1)}h this week)\n`;
  });

  const allocated = sorted.reduce((s, [, sec]) => s + (sec / totalWeight) * dailyTargetHours, 0);
  const remaining = dailyTargetHours - allocated;
  if (remaining > 0.5) {
    text += `\n${remaining.toFixed(1)}h unallocated — use for new tasks or meetings.`;
  }

  return text;
}

export function computeTrendingIssues(currentWorklogs: Worklog[], previousWorklogs: Worklog[]): TrendingIssue[] {
  const getIssueHours = (wls: Worklog[]) => {
    const map = new Map<string, number>();
    wls.forEach(wl => {
      map.set(wl.issueKey, (map.get(wl.issueKey) || 0) + wl.timeSpentSeconds);
    });
    return map;
  };

  const current = getIssueHours(currentWorklogs);
  const previous = getIssueHours(previousWorklogs);

  return Array.from(current.entries())
    .map(([issueKey, seconds]) => {
      const currentHours = seconds / 3600;
      const previousHours = (previous.get(issueKey) || 0) / 3600;
      const growth = currentHours - previousHours;
      return { issueKey, currentHours, previousHours, growth };
    })
    .filter(t => t.growth > 0)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 5);
}

export function getWorklogsForDay(worklogs: Worklog[], targetDate: string): Worklog[] {
  return worklogs.filter(wl => wl.started.split("T")[0] === targetDate);
}

export function formatStandup(worklogs: Worklog[], startDate: string, endDate: string): string {
  const dayMap = new Map<string, Worklog[]>();
  worklogs.forEach(wl => {
    const date = wl.started.split("T")[0];
    if (date >= startDate && date <= endDate) {
      if (!dayMap.has(date)) dayMap.set(date, []);
      dayMap.get(date)!.push(wl);
    }
  });

  if (dayMap.size === 0) return "No worklogs in this period to export.";

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let text = "**Status Update**\n\n";

  const sortedDays = Array.from(dayMap.keys()).sort();
  sortedDays.forEach(date => {
    const d = new Date(`${date}T00:00:00`);
    const dayName = DAY_NAMES[d.getDay()];
    const logs = dayMap.get(date)!;
    const totalH = logs.reduce((s, wl) => s + wl.timeSpentSeconds, 0) / 3600;
    text += `**${dayName} (${date})** — ${totalH.toFixed(1)}h\n`;
    const issueMap = new Map<string, { hours: number; comment: string }>();
    logs.forEach(wl => {
      const existing = issueMap.get(wl.issueKey);
      if (existing) {
        existing.hours += wl.timeSpentSeconds / 3600;
      } else {
        issueMap.set(wl.issueKey, { hours: wl.timeSpentSeconds / 3600, comment: wl.comment });
      }
    });
    issueMap.forEach(({ hours, comment }, key) => {
      text += `- ${key}: ${hours.toFixed(1)}h${comment ? ` — ${comment}` : ""}\n`;
    });
    text += "\n";
  });

  return text.trim();
}

export function formatTeamComparison(currentWorklogs: Worklog[], previousWorklogs: Worklog[]): string {
  const getTeamHours = (wls: Worklog[]) => {
    const map = new Map<string, number>();
    wls.forEach(wl => {
      map.set(wl.team, (map.get(wl.team) || 0) + wl.timeSpentSeconds);
    });
    return map;
  };

  const current = getTeamHours(currentWorklogs);
  const previous = getTeamHours(previousWorklogs);
  const allTeams = new Set([...current.keys(), ...previous.keys()]);

  if (allTeams.size === 0) return "No team data available for comparison.";

  let text = "**Team/Project Hours Comparison**\n\n";
  text += "| Project | This Week | Last Week | Change |\n";
  text += "|---------|-----------|-----------|--------|\n";

  Array.from(allTeams)
    .map(team => ({
      team,
      cur: (current.get(team) || 0) / 3600,
      prev: (previous.get(team) || 0) / 3600,
    }))
    .sort((a, b) => b.cur - a.cur)
    .forEach(({ team, cur, prev }) => {
      const diff = cur - prev;
      const arrow = diff > 0.5 ? "+" : diff < -0.5 ? "" : "";
      text += `| ${team} | ${cur.toFixed(1)}h | ${prev.toFixed(1)}h | ${arrow}${diff.toFixed(1)}h |\n`;
    });

  return text;
}

export function parseTimeFromInput(input: string): string | null {
  const match24 = input.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    const h = parseInt(match24[1]);
    const m = parseInt(match24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  const match12 = input.match(/(\d{1,2})\s*(am|pm)/i);
  if (match12) {
    let h = parseInt(match12[1]);
    const isPm = match12[2].toLowerCase() === "pm";
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  return null;
}

export function resolveDayReference(input: string, startDate: string, endDate: string): string | null {
  const lower = input.toLowerCase();
  const dayNames: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };

  if (lower.includes("yesterday")) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  }

  for (const [name, dow] of Object.entries(dayNames)) {
    if (lower.includes(name)) {
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T00:00:00`);
      const current = new Date(start);
      while (current <= end) {
        if (current.getDay() === dow) {
          return current.toISOString().split("T")[0];
        }
        current.setDate(current.getDate() + 1);
      }
    }
  }

  return null;
}
