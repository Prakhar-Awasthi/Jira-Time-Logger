export interface Worklog {
  issueKey: string;
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
  filterEmail?: string
): Promise<Worklog[]> {
  const auth = btoa(`${email}:${token}`);
  
  // Get updated worklogs using the worklog/updated endpoint
  const since = startDate.getTime();
  
  const worklogUpdateRes = await fetch(
    `${baseUrl}/rest/api/3/worklog/updated?since=${since}`,
    {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json"
      }
    }
  );

  if (!worklogUpdateRes.ok) {
    const errorText = await worklogUpdateRes.text();
    throw new Error(`Failed to fetch worklogs: ${errorText}`);
  }

  const updateData = await worklogUpdateRes.json();
  const worklogIds = (updateData.values || []).map((v: any) => v.worklogId).filter(Boolean);
  
  if (worklogIds.length === 0) {
    return [];
  }

  // Fetch worklog details in one call
  const worklogListRes = await fetch(
    `${baseUrl}/rest/api/3/worklog/list`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        ids: worklogIds
      })
    }
  );

  if (!worklogListRes.ok) {
    const errorText = await worklogListRes.text();
    throw new Error(`Failed to fetch worklog details: ${errorText}`);
  }

  const worklogListData = await worklogListRes.json();
  const allWorklogs = worklogListData || [];
  
  // Get unique issue IDs to fetch issue keys
  const issueIds = [...new Set(allWorklogs.map((wl: any) => wl.issueId).filter(Boolean))];
  
  // Fetch issue keys for the issue IDs (one call for all)
  const issueKeyMap: { [id: string]: string } = {};
  if (issueIds.length > 0) {
    const issueRes = await fetch(
      `${baseUrl}/rest/api/3/search/jql`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          jql: `id in (${issueIds.join(",")})`,
          fields: ["key"],
          maxResults: issueIds.length
        })
      }
    );
    
    if (issueRes.ok) {
      const issueData = await issueRes.json();
      (issueData.issues || []).forEach((issue: any) => {
        issueKeyMap[issue.id] = issue.key;
      });
    }
  }
  
  // Filter for date range and optionally by user
  const filteredWorklogs = allWorklogs
    .filter((wl: any) => {
      if (!wl.started || !wl.author || !wl.issueId) return false;
      
      const wlDate = new Date(wl.started);
      const wlDateOnly = new Date(wlDate.getFullYear(), wlDate.getMonth(), wlDate.getDate());
      const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      
      const dateMatch = wlDateOnly >= startOnly && wlDateOnly <= endOnly;
      const userMatch = !filterEmail || wl.author.emailAddress === filterEmail;
      
      return dateMatch && userMatch;
    })
    .map((wl: any) => {
      let commentText = "";
      if (wl.comment && typeof wl.comment === "object") {
        // Extract text from ADF format
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
      
      return {
        issueKey: issueKeyMap[wl.issueId] || `Issue-${wl.issueId}`,
        timeSpent: wl.timeSpent,
        timeSpentSeconds: wl.timeSpentSeconds,
        comment: commentText,
        started: wl.started,
        author: wl.author.displayName,
        authorEmail: wl.author.emailAddress
      };
    });
  
  return filteredWorklogs;
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