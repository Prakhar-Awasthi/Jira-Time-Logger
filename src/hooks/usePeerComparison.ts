import { useState, useEffect, useMemo } from "react";
import { useJira } from "../context/JiraContext";
import { fetchWorklogs, Worklog } from "../utils/jira";
import { computeFocusScore } from "../utils/insights";
import { WeekSummary } from "./useAnalytics";

export interface PeerStat {
  email: string;
  name: string;
  totalHours: number;
  avgPerDay: number;
  issueCount: number;
  focusScore: number;
  daysLogged: number;
  isCurrentUser: boolean;
  rank: number;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function usePeerComparison(currentWeek: WeekSummary | null, selectedTeam: string, weeksBack = 4) {
  const { jiraUrl, email, token, credentialsReady } = useJira();
  const [allWorklogs, setAllWorklogs] = useState<Worklog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!credentialsReady) return;
    const controller = new AbortController();
    setLoading(true);

    // Use the same date range as useAnalytics — this hits its in-memory cache (no extra network call)
    const now = new Date();
    const currentMonday = getMonday(now);
    const rangeStart = new Date(currentMonday);
    rangeStart.setDate(rangeStart.getDate() - (weeksBack - 1) * 7);
    const rangeEnd = new Date(currentMonday);
    rangeEnd.setDate(rangeEnd.getDate() + 6);

    fetchWorklogs(jiraUrl, email, token, rangeStart, rangeEnd, undefined, controller.signal, (staleData) => {
      setAllWorklogs(staleData);
      setLoading(false);
    })
      .then(setAllWorklogs)
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [jiraUrl, email, token, credentialsReady, weeksBack]);

  const { peers, teamOptions, defaultTeam } = useMemo(() => {
    if (!currentWeek || allWorklogs.length === 0) {
      return { peers: [], teamOptions: [], defaultTeam: "" };
    }

    const startStr = currentWeek.startDate.toISOString().split("T")[0];
    const endStr = currentWeek.endDate.toISOString().split("T")[0];

    const weekWorklogs = allWorklogs.filter(wl => {
      const date = wl.started.split("T")[0];
      return date >= startStr && date <= endStr;
    });

    const teamSet = new Set(weekWorklogs.map(wl => wl.team));
    const teamOptions = Array.from(teamSet).sort();

    // Pick default team = current user's most-used team this week
    const myWeekWorklogs = weekWorklogs.filter(wl => wl.authorEmail === email);
    const teamSeconds = new Map<string, number>();
    myWeekWorklogs.forEach(wl => {
      teamSeconds.set(wl.team, (teamSeconds.get(wl.team) || 0) + wl.timeSpentSeconds);
    });
    const defaultTeam = Array.from(teamSeconds.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || teamOptions[0] || "";

    const activeTeam = selectedTeam || defaultTeam;
    const scopedWorklogs = activeTeam ? weekWorklogs.filter(wl => wl.team === activeTeam) : weekWorklogs;

    // Group by user
    const userMap = new Map<string, { name: string; worklogs: Worklog[] }>();
    scopedWorklogs.forEach(wl => {
      if (!userMap.has(wl.authorEmail)) {
        userMap.set(wl.authorEmail, { name: wl.author, worklogs: [] });
      }
      userMap.get(wl.authorEmail)!.worklogs.push(wl);
    });

    const sorted = Array.from(userMap.entries())
      .map(([userEmail, { name, worklogs }]) => {
        const totalSeconds = worklogs.reduce((s, wl) => s + wl.timeSpentSeconds, 0);
        const daySet = new Set(worklogs.map(wl => wl.started.split("T")[0]));
        const daysLogged = daySet.size || 1;
        return {
          email: userEmail,
          name,
          totalHours: totalSeconds / 3600,
          avgPerDay: totalSeconds / daysLogged / 3600,
          issueCount: new Set(worklogs.map(wl => wl.issueKey)).size,
          focusScore: computeFocusScore(worklogs).score,
          daysLogged,
          isCurrentUser: userEmail === email,
          rank: 0,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours)
      .map((p, i) => ({ ...p, rank: i + 1 }));

    return { peers: sorted, teamOptions, defaultTeam };
  }, [allWorklogs, currentWeek, email, selectedTeam]);

  return { peers, teamOptions, defaultTeam, loading };
}
