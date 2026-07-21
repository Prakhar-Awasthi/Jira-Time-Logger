import { useState, useEffect, useRef } from "react";
import { useJira } from "../context/JiraContext";

export interface JiraIssue {
  key: string;
  summary: string;
}

export function useIssueSearch(query: string) {
  const { jiraUrl, email, token, credentialsReady } = useJira();
  const [results, setResults] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query || query.length < 2 || !credentialsReady) {
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoading(true);
        const auth = btoa(`${email}:${token}`);
        const res = await fetch(
          `${jiraUrl}/rest/api/3/issue/picker?query=${encodeURIComponent(query)}&currentJQL=&showSubTasks=true`,
          {
            signal: controller.signal,
            headers: {
              "Authorization": `Basic ${auth}`,
              "Accept": "application/json",
            },
          }
        );
        if (!res.ok || controller.signal.aborted) return;
        const data = await res.json();
        const issues: JiraIssue[] = [];
        for (const section of data.sections || []) {
          for (const issue of section.issues || []) {
            issues.push({ key: issue.key, summary: issue.summaryText || issue.summary || "" });
          }
        }
        if (!controller.signal.aborted) {
          setResults(issues.slice(0, 8));
        }
      } catch (err: any) {
        if (err.name !== "AbortError") setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, jiraUrl, email, token, credentialsReady]);

  return { results, loading };
}
