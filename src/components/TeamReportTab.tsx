import { useState, useMemo } from "react";
import { useJira } from "../context/JiraContext";
import { useWorklogs } from "../hooks/useWorklogs";
import { FilterControls } from "./FilterControls";
import { getTodayString, formatSeconds } from "../utils/helpers";
import { JiraUser } from "../utils/jira";
import { exportTeamReportToCSV } from "../utils/csv";

export function TeamReportTab() {
  const { selectedTeam, credentialsReady } = useJira();
  const [reportStartDate, setReportStartDate] = useState(getTodayString());
  const [reportEndDate, setReportEndDate] = useState(getTodayString());

  const { worklogs, loading, refresh } = useWorklogs({ startDate: reportStartDate, endDate: reportEndDate, active: true });

  const teamReport = useMemo(() => {
    let filteredLogs = worklogs;
    if (selectedTeam !== "all") {
      filteredLogs = filteredLogs.filter(wl => wl.team === selectedTeam);
    }
    const userMap = new Map<string, { user: JiraUser; total: number; worklogs: typeof worklogs }>();
    filteredLogs.forEach(wl => {
      if (!userMap.has(wl.authorEmail)) {
        userMap.set(wl.authorEmail, {
          user: { emailAddress: wl.authorEmail, displayName: wl.author },
          total: 0,
          worklogs: [],
        });
      }
      const userData = userMap.get(wl.authorEmail)!;
      userData.total += wl.timeSpentSeconds;
      userData.worklogs.push(wl);
    });
    const report = Array.from(userMap.values());
    report.sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
    return report;
  }, [worklogs, selectedTeam]);

  return (
    <div className="view-section">
      <div className="view-header">
        <h2>Team Report</h2>
        <div className="view-header-actions">
          <button className="btn-secondary" onClick={() => exportTeamReportToCSV(teamReport, `team-report-${reportStartDate}-to-${reportEndDate}.csv`)} disabled={teamReport.length === 0}>
            Export CSV
          </button>
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="range-controls">
        <FilterControls worklogs={worklogs} loading={loading} showUser={false} />
        <div className="input-group">
          <label>Start Date</label>
          <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
        </div>
        <div className="input-group">
          <label>End Date</label>
          <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
        </div>
        <button
          className="btn-primary range-button"
          onClick={refresh}
          disabled={loading || !credentialsReady}
        >
          {loading ? "Loading..." : "Get Report"}
        </button>
      </div>

      <div className="report-table-container">
        <table className="report-table">
          <thead>
            <tr>
              <th>Team Member</th>
              <th>Total Time</th>
              <th>Issues Worked On</th>
            </tr>
          </thead>
          <tbody>
            {teamReport.length === 0 ? (
              <tr>
                <td colSpan={3} className="no-logs">
                  {loading ? "Loading..." : "No data available"}
                </td>
              </tr>
            ) : (
              teamReport.map((userData) => (
                <tr key={userData.user.emailAddress}>
                  <td>
                    <div className="user-name">{userData.user.displayName}</div>
                    <div className="user-email">{userData.user.emailAddress}</div>
                  </td>
                  <td className="time-value">
                    {formatSeconds(userData.total)}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                      {Array.from(new Set(userData.worklogs.map(wl => wl.issueKey)))
                        .sort()
                        .map(issueKey => (
                          <span key={issueKey} className="issue-tag">{issueKey}</span>
                        ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="range-summary">
        <strong>Total Team Time:</strong> {formatSeconds(teamReport.reduce((sum, u) => sum + u.total, 0))}
        {" | "}
        <strong>Team Members:</strong> {teamReport.length}
      </div>
    </div>
  );
}
