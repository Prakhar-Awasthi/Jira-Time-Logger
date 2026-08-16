import { useState, useMemo } from "react";
import { useJira } from "../context/JiraContext";
import { useWorklogs } from "../hooks/useWorklogs";
import { FilterControls } from "./FilterControls";
import { WorklogCard } from "./WorklogCard";
import { getWeekEndingSaturdayString, formatSeconds } from "../utils/helpers";
import { Worklog, getDayOfWeekFromISOString } from "../utils/jira";
import { exportWorklogsToCSV } from "../utils/csv";

export function WeeklyTab() {
  const { email, selectedUser, selectedTeam, credentialsReady } = useJira();
  const [weekDate, setWeekDate] = useState(getWeekEndingSaturdayString());

  const { startDate, endDate } = useMemo(() => {
    if (!weekDate) return { startDate: "", endDate: "" };
    const anchor = new Date(`${weekDate}T00:00:00`);
    const start = new Date(anchor);
    const day = start.getDay();
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { startDate: fmt(start), endDate: fmt(end) };
  }, [weekDate]);

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

  const groupedByWeekday = useMemo(() => {
    const days = [
      { key: "Mon", label: "Monday", working: true },
      { key: "Tue", label: "Tuesday", working: true },
      { key: "Wed", label: "Wednesday", working: true },
      { key: "Thu", label: "Thursday", working: true },
      { key: "Fri", label: "Friday", working: true },
    ];
    const grouped = days.map((d) => ({ ...d, worklogs: [] as Worklog[], total: 0 }));
    filteredWorklogs.forEach((wl) => {
      const dayOfWeek = getDayOfWeekFromISOString(wl.started);
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        grouped[dayOfWeek - 1].worklogs.push(wl);
        grouped[dayOfWeek - 1].total += wl.timeSpentSeconds;
      }
    });
    return grouped;
  }, [filteredWorklogs]);

  return (
    <div className="view-section">
      <div className="view-header">
        <h2>Time Logs by Week</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className="btn-secondary"
            onClick={() => exportWorklogsToCSV(filteredWorklogs, `weekly-logs-${weekDate || "export"}.csv`)}
            disabled={filteredWorklogs.length === 0}
          >
            Export CSV
          </button>
          <button className="btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="week-controls">
        <FilterControls worklogs={worklogs} loading={loading} />
        <div className="input-group">
          <label>Week Ending (Saturday)</label>
          <input
            type="date"
            value={weekDate}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) { setWeekDate(""); return; }
              const selected = new Date(`${value}T00:00:00`);
              if (Number.isNaN(selected.getTime())) { setWeekDate(""); return; }
              setWeekDate(getWeekEndingSaturdayString(selected));
            }}
          />
        </div>
        <button
          className="btn-primary range-button"
          onClick={refresh}
          disabled={loading || !credentialsReady}
        >
          {loading ? "Loading..." : "Get Logs"}
        </button>
      </div>

      <div className="week-grid">
        {groupedByWeekday.map((day) => (
          <div key={day.key} className={`day-column ${day.working ? "" : "day-off"}`}>
            <div className="day-header">
              <h3>{day.label}</h3>
              <span className="day-total">{formatSeconds(day.total)}</span>
            </div>
            <div className="day-worklogs">
              {!day.working ? (
                <div className="no-logs">Non-working day</div>
              ) : day.worklogs.length === 0 ? (
                <div className="no-logs">No time logged</div>
              ) : (
                day.worklogs.map((wl, idx) => (
                  <WorklogCard key={idx} worklog={wl} currentUserEmail={email} onUpdated={refresh} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="range-summary">
        <strong>Total Week (Mon-Fri):</strong> {formatSeconds(groupedByWeekday.filter(d => d.working).reduce((sum, d) => sum + d.total, 0))}
      </div>
    </div>
  );
}
