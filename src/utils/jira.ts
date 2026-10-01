export interface Worklog {
  id: string;
  issueKey: string;
  team: string;
  timeSpent: string;
  timeSpentSeconds: number;
  comment: string;
  started: string;
  author: string;
  authorEmail: string;
}

export interface JiraUser {
  emailAddress: string;
  displayName: string;
}

export interface IssueEstimate {
  issueKey: string;
  originalEstimateSeconds: number | null;
  totalTimeSpentSeconds: number | null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

// --- In-memory worklog cache (5-min TTL) ---

interface CacheEntry {
  data: Worklog[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const PERSISTENT_CACHE_TTL_MS = 10 * 60_000;
const WORKLOG_CACHE_STORAGE_PREFIX = "wlCache_";
const worklogCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<Worklog[]>>();

function getCacheKey(startDate: Date, endDate: Date): string {
  return `${startDate.getTime()}-${endDate.getTime()}`;
}

function getCachedWorklogs(startDate: Date, endDate: Date): Worklog[] | null {
  const key = getCacheKey(startDate, endDate);
  const entry = worklogCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  worklogCache.delete(key);
  return null;
}

function setCachedWorklogs(startDate: Date, endDate: Date, data: Worklog[]): void {
  const key = getCacheKey(startDate, endDate);
  worklogCache.set(key, { data, timestamp: Date.now() });
}

// --- Persistent worklog cache (chrome.storage.local, 10-min TTL) ---

async function getPersistedWorklogs(cacheKey: string): Promise<{ data: Worklog[]; timestamp: number } | null> {
  return new Promise((resolve) => {
    const storageKey = WORKLOG_CACHE_STORAGE_PREFIX + cacheKey;
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([storageKey], (result) => {
        const entry = result[storageKey];
        if (entry && typeof entry.timestamp === "number" && Array.isArray(entry.data)) {
          resolve(entry);
        } else {
          resolve(null);
        }
      });
    } else {
      resolve(null);
    }
  });
}

function setPersistedWorklogs(cacheKey: string, data: Worklog[]): void {
  const storageKey = WORKLOG_CACHE_STORAGE_PREFIX + cacheKey;
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ [storageKey]: { data, timestamp: Date.now() } });
  }
}

// --- Cursor storage for incremental sync ---

const CURSOR_STORAGE_PREFIX = "wlCursor_";
const CURSOR_MAX_AGE_MS = 24 * 60 * 60_000;

async function getStoredCursor(cacheKey: string): Promise<number | null> {
  return new Promise((resolve) => {
    const storageKey = CURSOR_STORAGE_PREFIX + cacheKey;
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([storageKey], (result) => {
        const c = result[storageKey];
        if (c && typeof c.until === "number" && Date.now() - c.timestamp < CURSOR_MAX_AGE_MS) resolve(c.until);
        else resolve(null);
      });
    } else resolve(null);
  });
}

function setStoredCursor(cacheKey: string, until: number): void {
  const storageKey = CURSOR_STORAGE_PREFIX + cacheKey;
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ [storageKey]: { until, timestamp: Date.now() } });
  }
}

// --- Estimation accuracy: issue estimate cache ---

const estimateCache = new Map<string, { data: IssueEstimate[]; timestamp: number }>();
const ESTIMATE_CACHE_TTL_MS = 30 * 60_000;

export async function fetchIssueEstimates(
  baseUrl: string,
  email: string,
  token: string,
  issueKeys: string[],
  signal?: AbortSignal
): Promise<IssueEstimate[]> {
  if (issueKeys.length === 0) return [];
  const sortedKeys = [...issueKeys].sort();
  const cacheKey = sortedKeys.join(",");
  const cached = estimateCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ESTIMATE_CACHE_TTL_MS) return cached.data;
  const auth = btoa(`${email}:${token}`);
  const results: IssueEstimate[] = [];
  await Promise.all(
    chunkArray(sortedKeys, 50).map(async (chunk) => {
      const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
        signal,
        method: "POST",
        headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ jql: `key in (${chunk.map(k => `"${k}"`).join(",")})`, fields: ["timeoriginalestimate", "timespent"], maxResults: chunk.length }),
      });
      if (res.ok) {
        ((await res.json()).issues || []).forEach((issue: any) => {
          results.push({ issueKey: issue.key, originalEstimateSeconds: issue.fields?.timeoriginalestimate ?? null, totalTimeSpentSeconds: issue.fields?.timespent ?? null });
        });
      }
    })
  );
  estimateCache.set(cacheKey, { data: results, timestamp: Date.now() });
  return results;
}

export function invalidateWorklogCache(): Promise<void> {
  worklogCache.clear();
  inflightRequests.clear();
  estimateCache.clear();
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(k =>
          k.startsWith(WORKLOG_CACHE_STORAGE_PREFIX) || k.startsWith(CURSOR_STORAGE_PREFIX)
        );
        if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove, () => resolve());
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

// --- Persistent issue key cache (chrome.storage.local) ---

const ISSUE_KEY_STORAGE_KEY = "issueKeyCache";

async function getPersistedIssueKeys(): Promise<{ [id: string]: string }> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([ISSUE_KEY_STORAGE_KEY], (data) => {
        resolve(data[ISSUE_KEY_STORAGE_KEY] || {});
      });
    } else {
      resolve({});
    }
  });
}

async function persistIssueKeys(map: { [id: string]: string }): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const existing = await getPersistedIssueKeys();
    chrome.storage.local.set({ [ISSUE_KEY_STORAGE_KEY]: { ...existing, ...map } });
  }
}

export async function logWork(
  baseUrl: string,
  email: string,
  token: string,
  issueKey: string,
  timeSpent: string,
  comment: string,
  started?: string
) {
  const auth = btoa(`${email}:${token}`);

  const body: any = {
    timeSpent,
    comment: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: comment
            }
          ]
        }
      ]
    }
  };
  if (started) {
    body.started = started;
  }

  const res = await fetch(
    `${baseUrl}/rest/api/3/issue/${issueKey}/worklog`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`${issueKey} failed: ${errorText}`);
  }

  await invalidateWorklogCache();
}

export async function updateWorklog(
  baseUrl: string,
  email: string,
  token: string,
  issueKey: string,
  worklogId: string,
  timeSpent: string,
  comment: string
): Promise<void> {
  const auth = btoa(`${email}:${token}`);
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog/${worklogId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      timeSpent,
      comment: {
        type: "doc", version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }]
      }
    })
  });
  if (!res.ok) throw new Error(await res.text());
  await invalidateWorklogCache();
}

export async function deleteWorklog(
  baseUrl: string,
  email: string,
  token: string,
  issueKey: string,
  worklogId: string
): Promise<void> {
  const auth = btoa(`${email}:${token}`);
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog/${worklogId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json"
    }
  });
  if (!res.ok) throw new Error(await res.text());
  await invalidateWorklogCache();
}

export function formatJiraStarted(dateString: string): string {
  // Parse the date string as YYYY-MM-DD and create at noon local time
  // to avoid timezone issues that might shift to previous/next day
  const [year, month, day] = dateString.split('-').map(Number);
  const baseDate = new Date(year, month - 1, day, 12, 0, 0, 0);
  return formatJiraDate(baseDate);
}

export async function fetchWorklogs(
  baseUrl: string,
  email: string,
  token: string,
  startDate: Date,
  endDate: Date,
  filterEmail?: string,
  signal?: AbortSignal,
  onStaleData?: (data: Worklog[]) => void
): Promise<Worklog[]> {
  // Layer 1: in-memory cache (sync, zero cost)
  const inMemory = getCachedWorklogs(startDate, endDate);
  if (inMemory) {
    return filterEmail ? inMemory.filter(wl => wl.authorEmail === filterEmail) : inMemory;
  }

  const cacheKey = getCacheKey(startDate, endDate);

  // Layer 2: persistent cache — survives page reloads
  const persisted = await getPersistedWorklogs(cacheKey);
  if (persisted) {
    if (Date.now() - persisted.timestamp < PERSISTENT_CACHE_TTL_MS) {
      setCachedWorklogs(startDate, endDate, persisted.data);
      return filterEmail ? persisted.data.filter(wl => wl.authorEmail === filterEmail) : persisted.data;
    }
    // Stale-while-revalidate: surface old data immediately, fetch fresh in background
    if (onStaleData) {
      onStaleData(filterEmail ? persisted.data.filter(wl => wl.authorEmail === filterEmail) : persisted.data);
    }
  }

  // Layer 2.5: incremental sync — if a cursor exists, fetch only the delta since last sync
  if (persisted) {
    const auth = btoa(`${email}:${token}`);
    const cursor = await getStoredCursor(cacheKey);
    if (cursor) {
      try {
        const deltaIds = new Set<string>();
        let deltaNextPage: string = `${baseUrl}/rest/api/3/worklog/updated?since=${cursor}`;
        let deltaUntil = 0;

        while (deltaNextPage) {
          const res = await fetch(deltaNextPage, { signal, headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" } });
          if (!res.ok) throw new Error("delta fetch failed");
          const data = await res.json();
          (data.values || []).forEach((v: any) => { if (v?.worklogId) deltaIds.add(String(v.worklogId)); });
          if (data.until) deltaUntil = data.until;
          deltaNextPage = data.lastPage ? "" : (data.nextPage || "");
        }

        if (deltaIds.size === 0) {
          setCachedWorklogs(startDate, endDate, persisted.data);
          setPersistedWorklogs(cacheKey, persisted.data);
          if (deltaUntil > 0) setStoredCursor(cacheKey, deltaUntil);
          return filterEmail ? persisted.data.filter(wl => wl.authorEmail === filterEmail) : persisted.data;
        }

        const rawDelta: any[] = [];
        for (const chunk of chunkArray(Array.from(deltaIds), 1000)) {
          const listRes = await fetch(`${baseUrl}/rest/api/3/worklog/list`, {
            signal, method: "POST",
            headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ ids: chunk }),
          });
          if (listRes.ok) rawDelta.push(...((await listRes.json()) || []));
        }

        const deltaIssueIds = [...new Set(rawDelta.map((wl: any) => wl.issueId).filter(Boolean))];
        const persistedKeys = await getPersistedIssueKeys();
        const deltaKeyMap: { [id: string]: string } = {};
        const unknownDeltaIds: string[] = [];
        for (const id of deltaIssueIds) {
          if (persistedKeys[id]) deltaKeyMap[id] = persistedKeys[id];
          else unknownDeltaIds.push(id);
        }
        if (unknownDeltaIds.length > 0) {
          const results = await Promise.all(chunkArray(unknownDeltaIds, 200).map(async (chunk) => {
            const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
              signal, method: "POST",
              headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({ jql: `id in (${chunk.join(",")})`, fields: ["key"], maxResults: chunk.length }),
            });
            return res.ok ? (await res.json()).issues || [] : [];
          }));
          const newMappings: { [id: string]: string } = {};
          results.flat().forEach((issue: any) => { deltaKeyMap[issue.id] = issue.key; newMappings[issue.id] = issue.key; });
          persistIssueKeys(newMappings);
        }

        const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const extractComment = (wl: any): string => {
          if (wl.comment && typeof wl.comment === "object") {
            const x = (node: any): string => node.type === "text" ? node.text || "" : (Array.isArray(node.content) ? node.content.map(x).join("") : "");
            return x(wl.comment);
          }
          return typeof wl.comment === "string" ? wl.comment : "";
        };

        const deltaWorklogs: Worklog[] = rawDelta
          .filter((wl: any) => {
            if (!wl.started || !wl.author || !wl.issueId) return false;
            const d = new Date(wl.started);
            const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            return dOnly >= startOnly && dOnly <= endOnly;
          })
          .map((wl: any) => {
            const issueKey = deltaKeyMap[wl.issueId] || `Issue-${wl.issueId}`;
            return { id: String(wl.id), issueKey, team: issueKey.split("-")[0] || "Unknown", timeSpent: wl.timeSpent, timeSpentSeconds: wl.timeSpentSeconds, comment: extractComment(wl), started: wl.started, author: wl.author.displayName, authorEmail: wl.author.emailAddress };
          });

        const merged = [...persisted.data];
        deltaWorklogs.forEach(dw => { const idx = merged.findIndex(w => w.id === dw.id); if (idx >= 0) merged[idx] = dw; else merged.push(dw); });
        setCachedWorklogs(startDate, endDate, merged);
        setPersistedWorklogs(cacheKey, merged);
        if (deltaUntil > 0) setStoredCursor(cacheKey, deltaUntil);
        return filterEmail ? merged.filter(wl => wl.authorEmail === filterEmail) : merged;
      } catch {
        // incremental sync failed — fall through to full fetch
      }
    }
  }

  // Layer 3: in-flight deduplication — concurrent hooks with the same range share one fetch
  if (inflightRequests.has(cacheKey)) {
    const result = await inflightRequests.get(cacheKey)!;
    return filterEmail ? result.filter(wl => wl.authorEmail === filterEmail) : result;
  }

  // Layer 4: network fetch
  const fetchPromise = (async (): Promise<Worklog[]> => {
  const auth = btoa(`${email}:${token}`);

  // Jira paginates /worklog/updated responses. Without paging, larger date ranges
  // can appear truncated to only the most recent subset of worklogs.
  const worklogIds = new Set<string>();
  let nextPageUrl = `${baseUrl}/rest/api/3/worklog/updated?since=${startDate.getTime()}`;
  let lastUntil = 0;

  while (nextPageUrl) {
    const worklogUpdateRes = await fetch(nextPageUrl, {
      signal,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json"
      }
    });

    if (!worklogUpdateRes.ok) {
      const errorText = await worklogUpdateRes.text();
      throw new Error(`Failed to fetch worklogs: ${errorText}`);
    }

    const updateData = await worklogUpdateRes.json();
    (updateData.values || []).forEach((value: any) => {
      if (value?.worklogId) {
        worklogIds.add(String(value.worklogId));
      }
    });
    if (updateData.until) lastUntil = updateData.until;

    nextPageUrl = updateData.lastPage ? "" : (updateData.nextPage || "");
  }
  
  if (worklogIds.size === 0) {
    return [];
  }

  const allWorklogs: any[] = [];
  for (const worklogIdChunk of chunkArray(Array.from(worklogIds), 1000)) {
    const worklogListRes = await fetch(
      `${baseUrl}/rest/api/3/worklog/list`,
      {
        signal,
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          ids: worklogIdChunk
        })
      }
    );

    if (!worklogListRes.ok) {
      const errorText = await worklogListRes.text();
      throw new Error(`Failed to fetch worklog details: ${errorText}`);
    }

    const worklogListData = await worklogListRes.json();
    allWorklogs.push(...(Array.isArray(worklogListData) ? worklogListData : []));
  }
  
  // Get unique issue IDs to fetch issue keys
  const issueIds = [...new Set(allWorklogs.map((wl: any) => wl.issueId).filter(Boolean))];

  // Use persistent cache to skip already-known IDs
  const persistedKeys = await getPersistedIssueKeys();
  const issueKeyMap: { [id: string]: string } = {};
  const unknownIds: string[] = [];

  for (const id of issueIds) {
    if (persistedKeys[id]) {
      issueKeyMap[id] = persistedKeys[id];
    } else {
      unknownIds.push(id);
    }
  }

  // Fetch unknown issue keys in batches (parallel).
  if (unknownIds.length > 0) {
    const issueChunkResults = await Promise.all(
      chunkArray(unknownIds, 200).map(async (issueIdChunk) => {
        const issueRes = await fetch(
          `${baseUrl}/rest/api/3/search/jql`,
          {
            signal,
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({
              jql: `id in (${issueIdChunk.join(",")})`,
              fields: ["key"],
              maxResults: issueIdChunk.length
            })
          }
        );
        if (issueRes.ok) {
          return (await issueRes.json()).issues || [];
        }
        return [];
      })
    );
    const newMappings: { [id: string]: string } = {};
    issueChunkResults.flat().forEach((issue: any) => {
      issueKeyMap[issue.id] = issue.key;
      newMappings[issue.id] = issue.key;
    });
    persistIssueKeys(newMappings);
  }
  
  // Filter for date range and optionally by user
  const allFilteredWorklogs = allWorklogs
    .filter((wl: any) => {
      if (!wl.started || !wl.author || !wl.issueId) return false;

      const wlDate = new Date(wl.started);
      const wlDateOnly = new Date(wlDate.getFullYear(), wlDate.getMonth(), wlDate.getDate());
      const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

      return wlDateOnly >= startOnly && wlDateOnly <= endOnly;
    })
    .map((wl: any) => {
      let commentText = "";
      if (wl.comment && typeof wl.comment === "object") {
        const extractText = (node: any): string => {
          if (node.type === "text") {
            return node.text || "";
          }
          if (node.content && Array.isArray(node.content)) {
            return node.content.map(extractText).join("");
          }
          return "";
        };
        commentText = extractText(wl.comment);
      } else if (typeof wl.comment === "string") {
        commentText = wl.comment;
      }

      const issueKey = issueKeyMap[wl.issueId] || `Issue-${wl.issueId}`;
      const team = issueKey.split('-')[0] || 'Unknown';

      return {
        id: String(wl.id),
        issueKey,
        team,
        timeSpent: wl.timeSpent,
        timeSpentSeconds: wl.timeSpentSeconds,
        comment: commentText,
        started: wl.started,
        author: wl.author.displayName,
        authorEmail: wl.author.emailAddress
      };
    });

    setCachedWorklogs(startDate, endDate, allFilteredWorklogs);
    setPersistedWorklogs(cacheKey, allFilteredWorklogs);
    if (lastUntil > 0) setStoredCursor(cacheKey, lastUntil);
    return allFilteredWorklogs;
  })();

  inflightRequests.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    inflightRequests.delete(cacheKey);
    return filterEmail ? result.filter(wl => wl.authorEmail === filterEmail) : result;
  } catch (err) {
    inflightRequests.delete(cacheKey);
    throw err;
  }
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Extract date from ISO string without timezone conversion
 * This ensures the date matches what was logged in Jira, regardless of viewer's timezone
 */
export function extractDateFromISOString(isoString: string): string {
  // Extract YYYY-MM-DD from ISO string like "2026-02-10T14:30:00.000+0000"
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : formatDate(new Date(isoString));
}

/**
 * Get day of week from ISO string without timezone conversion
 * Returns 0 (Sunday) through 6 (Saturday)
 */
export function getDayOfWeekFromISOString(isoString: string): number {
  const dateStr = extractDateFromISOString(isoString);
  // Parse as UTC to avoid timezone conversion
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.getUTCDay();
}

function formatJiraDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMins = String(absOffset % 60).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000${sign}${offsetHours}${offsetMins}`;
}

/**
 * Extract unique users from worklogs
 */
export function extractUsersFromWorklogs(worklogs: Worklog[]): JiraUser[] {
  const userMap = new Map<string, JiraUser>();
  
  worklogs.forEach((wl) => {
    if (wl.authorEmail && !userMap.has(wl.authorEmail)) {
      userMap.set(wl.authorEmail, {
        emailAddress: wl.authorEmail,
        displayName: wl.author
      });
    }
  });
  
  const users = Array.from(userMap.values());
  users.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  return users;
}

/**
 * Extract unique teams from worklogs based on issue key prefix
 */
export function extractTeamsFromWorklogs(worklogs: Worklog[]): string[] {
  const teamSet = new Set<string>();
  
  worklogs.forEach((wl) => {
    if (wl.team && wl.team !== 'Unknown') {
      teamSet.add(wl.team);
    }
  });
  
  const teams = Array.from(teamSet);
  teams.sort((a, b) => a.localeCompare(b));
  
  return teams;
}