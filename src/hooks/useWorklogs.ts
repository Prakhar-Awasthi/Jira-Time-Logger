import { useState, useEffect, useRef } from "react";
import { fetchWorklogs, Worklog, extractUsersFromWorklogs, extractTeamsFromWorklogs } from "../utils/jira";
import { useJira } from "../context/JiraContext";

interface UseWorklogsOptions {
  startDate: string;
  endDate: string;
  active: boolean;
}

interface UseWorklogsResult {
  worklogs: Worklog[];
  loading: boolean;
  refresh: () => void;
}

export function useWorklogs({ startDate, endDate, active }: UseWorklogsOptions): UseWorklogsResult {
  const { jiraUrl, email, token, credentialsReady, setAllUsers, setAllTeams } = useJira();
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = async (signal?: AbortSignal) => {
    if (!credentialsReady || !startDate || !endDate) return;
    try {
      setLoading(true);
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T23:59:59`);
      if (end < start) return;

      const logs = await fetchWorklogs(jiraUrl, email, token, start, end, undefined, signal);
      if (signal?.aborted) return;
      setWorklogs(logs);
      setAllUsers(extractUsersFromWorklogs(logs));
      setAllTeams(extractTeamsFromWorklogs(logs));
    } catch (err: any) {
      if (err.name === "AbortError") return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!active || !credentialsReady) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = window.setTimeout(() => {
      load(controller.signal);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [active, startDate, endDate, jiraUrl, email, token]);

  const refresh = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    load(controller.signal);
  };

  return { worklogs, loading, refresh };
}
