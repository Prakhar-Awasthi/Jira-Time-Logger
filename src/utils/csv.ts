import { Worklog } from "./jira";
import { formatSeconds } from "./helpers";

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportWorklogsToCSV(worklogs: Worklog[], filename: string = "worklogs.csv") {
  const headers = ["Date", "Issue Key", "Team", "Author", "Time Spent", "Comment"];
  const rows = worklogs.map(wl => [
    wl.started.split("T")[0],
    wl.issueKey,
    wl.team,
    wl.author,
    wl.timeSpent,
    wl.comment,
  ].map(escapeCSV).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  downloadCSV(csv, filename);
}

export function exportTeamReportToCSV(
  report: { user: { displayName: string; emailAddress: string }; total: number; worklogs: Worklog[] }[],
  filename: string = "team-report.csv"
) {
  const headers = ["Team Member", "Email", "Total Time", "Issues Worked On"];
  const rows = report.map(entry => [
    entry.user.displayName,
    entry.user.emailAddress,
    formatSeconds(entry.total),
    Array.from(new Set(entry.worklogs.map(wl => wl.issueKey))).sort().join("; "),
  ].map(escapeCSV).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  downloadCSV(csv, filename);
}
