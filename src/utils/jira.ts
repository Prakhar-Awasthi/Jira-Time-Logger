export interface Worklog {
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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

// --- In-memory worklog response cache (60s TTL) ---

interface CacheEntry {
  data: Worklog[];
  timestamp: number;
}

const CACHE_TTL_MS = 60_000;
const worklogCache = new Map<string, CacheEntry>();

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

export function invalidateWorklogCache(): void {
  worklogCache.clear();
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

  invalidateWorklogCache();
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
  signal?: AbortSignal
): Promise<Worklog[]> {
  const cached = getCachedWorklogs(startDate, endDate);
  if (cached) {
    if (filterEmail) {
      return cached.filter(wl => wl.authorEmail === filterEmail);
    }
    return cached;
  }

  const auth = btoa(`${email}:${token}`);

  // Jira paginates /worklog/updated responses. Without paging, larger date ranges
  // can appear truncated to only the most recent subset of worklogs.
  const worklogIds = new Set<string>();
  let nextPageUrl = `${baseUrl}/rest/api/3/worklog/updated?since=${startDate.getTime()}`;

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

  if (filterEmail) {
    return allFilteredWorklogs.filter(wl => wl.authorEmail === filterEmail);
  }
  return allFilteredWorklogs;
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