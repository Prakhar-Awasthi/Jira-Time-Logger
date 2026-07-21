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
