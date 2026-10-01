import { useState, useEffect, useMemo } from "react";
import { useJira } from "../context/JiraContext";
import { fetchWorklogs, fetchIssueEstimates, invalidateWorklogCache, IssueEstimate, Worklog } from "../utils/jira";
import { getTopIssues, computeFocusScore, computeStreak, computeConsistency, computeDayOfWeekPattern, computeForecast, computeOvertimeHeatmap, computeTimeDistribution, computeProjectMomentum, computeFragmentationIndex, computeUnloggedGaps, computeBurnoutSignal, BurnoutSignal, TopIssue } from "../utils/insights";
import { useSettings } from "./useSettings";

export interface DailyTotal {
  date: string;
  label: string;
  hours: number;
}

export interface WeekSummary {
  weekLabel: string;
  startDate: Date;
  endDate: Date;
  totalHours: number;
  dailyTotals: DailyTotal[];
}

export interface TeamBreakdown {
  team: string;
  hours: number;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} - ${fmt(end)}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function computeWeekSummary(worklogs: Worklog[], weekStart: Date): WeekSummary {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, 0);
  }

  worklogs.forEach((wl) => {
    const dateKey = wl.started.split("T")[0];
    if (dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + wl.timeSpentSeconds);
    }
  });

  const dailyTotals: DailyTotal[] = [];
  let totalSeconds = 0;
  dailyMap.forEach((seconds, date) => {
    const d = new Date(date + "T00:00:00Z");
    dailyTotals.push({
      date,
      label: DAY_NAMES[d.getUTCDay()],
      hours: seconds / 3600,
    });
    totalSeconds += seconds;
  });

  return {
    weekLabel: formatWeekLabel(weekStart),
    startDate: weekStart,
    endDate: weekEnd,
    totalHours: totalSeconds / 3600,
    dailyTotals,
  };
}

function computeTeamBreakdown(worklogs: Worklog[]): TeamBreakdown[] {
  const teamMap = new Map<string, number>();
  worklogs.forEach((wl) => {
    const team = wl.team || "Unknown";
    teamMap.set(team, (teamMap.get(team) || 0) + wl.timeSpentSeconds);
  });

  return Array.from(teamMap.entries())
    .map(([team, seconds]) => ({ team, hours: seconds / 3600 }))
    .sort((a, b) => b.hours - a.hours);
}

export function useAnalytics(weeksBack = 4) {
  const { jiraUrl, email, token, credentialsReady } = useJira();
  const { settings } = useSettings();
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [teamBreakdown, setTeamBreakdown] = useState<TeamBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentWeekWorklogs, setCurrentWeekWorklogs] = useState<Worklog[]>([]);
  const [previousWeekWorklogs, setPreviousWeekWorklogs] = useState<Worklog[]>([]);
  const [allRangeWorklogs, setAllRangeWorklogs] = useState<Worklog[]>([]);
  const [issueEstimates, setIssueEstimates] = useState<IssueEstimate[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  // Re-fetch when the worklog cache is invalidated externally — either by the Log Time
  // tab (same page context) or by the Jira page FAB content script (different context,
  // which can only clear chrome.storage but not the in-memory Map).
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const cacheCleared = Object.keys(changes).some(
        (k) => k.startsWith("wlCache_") && changes[k].newValue === undefined
      );
      if (!cacheCleared || !credentialsReady) return;
      // Clear the in-memory Map too — the content script can only clear storage,
      // not the RAM cache inside the extension page's JS context.
      invalidateWorklogCache();
      setRefreshTick((t) => t + 1);
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [credentialsReady]);

  useEffect(() => {
    if (!credentialsReady) return;

    const controller = new AbortController();
    setLoading(true);

    const now = new Date();
    const currentMonday = getMonday(now);
    const rangeStart = new Date(currentMonday);
    rangeStart.setDate(rangeStart.getDate() - (weeksBack - 1) * 7);

    const rangeEnd = new Date(currentMonday);
    rangeEnd.setDate(rangeEnd.getDate() + 6);

    function apply(worklogs: Worklog[]) {
      setAllRangeWorklogs(worklogs);

      const weekSummaries: WeekSummary[] = [];
      for (let i = 0; i < weeksBack; i++) {
        const weekStart = new Date(rangeStart);
        weekStart.setDate(weekStart.getDate() + i * 7);
        weekSummaries.push(computeWeekSummary(worklogs, weekStart));
      }
      setWeeks(weekSummaries);

      const currentWorklogs = worklogs.filter((wl) => {
        const d = new Date(wl.started);
        return d >= currentMonday;
      });
      setCurrentWeekWorklogs(currentWorklogs);
      setTeamBreakdown(computeTeamBreakdown(currentWorklogs));

      const prevMonday = new Date(currentMonday);
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevSunday.getDate() + 6);
      setPreviousWeekWorklogs(worklogs.filter((wl) => {
        const d = new Date(wl.started);
        return d >= prevMonday && d <= prevSunday;
      }));
    }

    fetchWorklogs(jiraUrl, email, token, rangeStart, rangeEnd, email, controller.signal, (staleData) => {
      apply(staleData);
      setLoading(false);
    })
      .then(apply)
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [jiraUrl, email, token, credentialsReady, weeksBack, refreshTick]);

  const topIssues = useMemo(() => getTopIssues(currentWeekWorklogs, 8), [currentWeekWorklogs]);
  const focusScore = useMemo(() => computeFocusScore(currentWeekWorklogs), [currentWeekWorklogs]);

  const burnoutSignal = useMemo(() => {
    const fullHeatmap = computeOvertimeHeatmap(allRangeWorklogs, settings.dailyTargetHours);
    return computeBurnoutSignal(fullHeatmap, settings.dailyTargetHours);
  }, [allRangeWorklogs, settings.dailyTargetHours]);

  const topIssueKeys = topIssues.map(i => i.issueKey).join(",");
  useEffect(() => {
    if (!credentialsReady || topIssues.length === 0) return;
    const controller = new AbortController();
    fetchIssueEstimates(jiraUrl, email, token, topIssues.map(i => i.issueKey), controller.signal)
      .then(setIssueEstimates)
      .catch(() => {});
    return () => controller.abort();
  }, [jiraUrl, email, token, credentialsReady, topIssueKeys]);
  const streak = useMemo(() => computeStreak(currentWeekWorklogs), [currentWeekWorklogs]);
  const consistency = useMemo(() => computeConsistency(currentWeekWorklogs), [currentWeekWorklogs]);
  const dayPattern = useMemo(() => computeDayOfWeekPattern(currentWeekWorklogs), [currentWeekWorklogs]);
  const forecast = useMemo(() => computeForecast(currentWeekWorklogs, settings.weeklyTargetHours), [currentWeekWorklogs, settings.weeklyTargetHours]);
  const overtimeHeatmap = useMemo(() => computeOvertimeHeatmap(currentWeekWorklogs, settings.dailyTargetHours), [currentWeekWorklogs, settings.dailyTargetHours]);
  const timeDistribution = useMemo(() => computeTimeDistribution(currentWeekWorklogs), [currentWeekWorklogs]);
  const projectMomentum = useMemo(() => computeProjectMomentum(currentWeekWorklogs, previousWeekWorklogs), [currentWeekWorklogs, previousWeekWorklogs]);
  const fragmentation = useMemo(() => computeFragmentationIndex(currentWeekWorklogs), [currentWeekWorklogs]);
  const unloggedGaps = useMemo(() => {
    const currentWeek = weeks[weeks.length - 1];
    if (!currentWeek) return [];
    const startStr = currentWeek.startDate.toISOString().split("T")[0];
    const endStr = currentWeek.endDate.toISOString().split("T")[0];
    return computeUnloggedGaps(currentWeekWorklogs, startStr, endStr, settings.dailyTargetHours);
  }, [currentWeekWorklogs, weeks, settings.dailyTargetHours]);

  return {
    weeks,
    teamBreakdown,
    loading,
    currentWeekWorklogs,
    previousWeekWorklogs,
    topIssues,
    focusScore,
    streak,
    consistency,
    dayPattern,
    forecast,
    overtimeHeatmap,
    timeDistribution,
    projectMomentum,
    fragmentation,
    unloggedGaps,
    burnoutSignal,
    issueEstimates,
  };
}
