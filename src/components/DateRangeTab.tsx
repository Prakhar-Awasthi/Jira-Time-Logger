import { useState, useMemo } from "react";
import { useJira } from "../context/JiraContext";
import { useWorklogs } from "../hooks/useWorklogs";
import { FilterControls } from "./FilterControls";
import { WorklogCard } from "./WorklogCard";
import { getTodayString, formatSeconds } from "../utils/helpers";
import { extractDateFromISOString } from "../utils/jira";
import { exportWorklogsToCSV } from "../utils/csv";

export function DateRangeTab() {
  const { selectedUser, selectedTeam, credentialsReady } = useJira();
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState(getTodayString());

  const { worklogs, loading, refresh } = useWorklogs({ startDate, endDate, active: true });

  const filteredWorklogs = useMemo(() => {
    let filtered = worklogs;
    if (selectedUser !== "all") {
      filtered = filtered.filter(wl => wl.authorEmail === selectedUser);
    }
    if (selectedTeam !== "all") {
      filtered = filtered.filter(wl => wl.team === selectedTeam);
    }
    return filtered;
  }, [worklogs, selectedUser, selectedTeam]);

  const groupedByDate = useMemo(() => {
    const grouped: { [key: string]: { worklogs: typeof filteredWorklogs; total: number } } = {};
    filteredWorklogs.forEach((wl) => {
      const dateKey = extractDateFromISOString(wl.started);
      if (!grouped[dateKey]) {
        grouped[dateKey] = { worklogs: [], total: 0 };
      }
      grouped[dateKey].worklogs.push(wl);
      grouped[dateKey].total += wl.timeSpentSeconds;
    });
    return grouped;
  }, [filteredWorklogs]);

  return (
    <div className="view-section">
      <div className="view-header">
        <h2>Time Logs by Date</h2>
        <div className="view-header-actions">
          <button className="btn-secondary" onClick={() => exportWorklogsToCSV(filteredWorklogs, `worklogs-${startDate}-to-${endDate}.csv`)} disabled={filteredWorklogs.length === 0}>
            Export CSV
          </button>
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="range-controls">
        <FilterControls worklogs={worklogs} loading={loading} />
        <div className="input-group">
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="input-group">
          <label>End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button
          className="btn-primary range-button"
          onClick={refresh}
          disabled={loading || !credentialsReady}
        >
          {loading ? "Loading..." : "Get Logs"}
        </button>
      </div>

      <div className="range-grid">
        {Object.entries(groupedByDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dateKey, data]) => (
            <div key={dateKey} className="date-section">
              <div className="date-header">
                <h3>{dateKey}</h3>
                <span className="date-total">{formatSeconds(data.total)}</span>
              </div>
              <div className="worklog-list">
                {data.worklogs.length === 0 ? (
                  <div className="no-logs">No time logged</div>
                ) : (
                  data.worklogs.map((wl, idx) => <WorklogCard key={idx} worklog={wl} />)
                )}
              </div>
            </div>
          ))}
      </div>

      <div className="range-summary">
        <strong>Total Range:</strong> {formatSeconds(filteredWorklogs.reduce((sum, wl) => sum + wl.timeSpentSeconds, 0))}
      </div>
    </div>
  );
}
