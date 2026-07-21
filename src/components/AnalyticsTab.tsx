import { useAnalytics } from "../hooks/useAnalytics";
import { useSettings } from "../hooks/useSettings";
import { renderBarChart, renderDonutChart, renderTrendLine, renderHeatmapRow, renderHistogram, renderGapChart, renderMomentumBars, getColor, BarData, PieSlice } from "../utils/charts";

export function AnalyticsTab() {
  const { weeks, teamBreakdown, loading, topIssues, focusScore, streak, consistency, dayPattern, forecast, overtimeHeatmap, timeDistribution, projectMomentum, fragmentation, unloggedGaps } = useAnalytics(4);
  const { settings } = useSettings();

  if (loading) {
    return <div className="analytics-loading">Loading analytics...</div>;
  }

  if (weeks.length === 0) {
    return <div className="analytics-empty">No data available. Ensure credentials are configured.</div>;
  }

  const currentWeek = weeks[weeks.length - 1];
  const totalHours = currentWeek.totalHours;
  const workingDays = currentWeek.dailyTotals.filter(d => d.hours > 0).length || 1;
  const avgPerDay = totalHours / workingDays;
  const issueCount = topIssues.length;

  const barData: BarData[] = currentWeek.dailyTotals.map((d, i) => ({
    label: d.label,
    value: d.hours,
    color: getColor(i),
  }));

  const pieSlices: PieSlice[] = teamBreakdown.slice(0, 8).map((t, i) => ({
    label: t.team,
    value: t.hours,
    color: getColor(i),
  }));

  const trendData = weeks.map((w) => ({
    label: w.weekLabel.split(" - ")[0],
    value: w.totalHours,
  }));

  const barSvg = renderBarChart(barData, { width: 480, height: 200, targetLine: settings.dailyTargetHours });
  const donutSvg = renderDonutChart(pieSlices, { size: 160 });
  const trendSvg = renderTrendLine(trendData, { width: 480, height: 180 });

  return (
    <div className="analytics-tab">
      {/* KPI Summary Cards */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-value">{totalHours.toFixed(1)}h</div>
          <div className="kpi-label">This Week</div>
          <div className="kpi-sub">{settings.weeklyTargetHours}h target</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{avgPerDay.toFixed(1)}h</div>
          <div className="kpi-label">Avg / Day</div>
          <div className="kpi-sub">{workingDays} days logged</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{issueCount}</div>
          <div className="kpi-label">Issues</div>
          <div className="kpi-sub">worked on</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{streak.current}d</div>
          <div className="kpi-label">Streak</div>
          <div className="kpi-sub">longest: {streak.longest}d</div>
        </div>
      </div>

      {/* Scores row */}
      <div className="scores-row scores-row--extended">
        <div className="score-card">
          <div className="score-header">
            <span className="score-title">Focus</span>
            <span className={`score-badge ${focusScore.score >= 70 ? "good" : focusScore.score >= 40 ? "ok" : "low"}`}>
              {focusScore.score}/100
            </span>
          </div>
          <div className="score-detail">{focusScore.avgIssuesPerDay} issues/day avg</div>
          <div className="score-bar">
            <div className="score-fill" style={{ width: `${focusScore.score}%` }} />
          </div>
        </div>
        <div className="score-card">
          <div className="score-header">
            <span className="score-title">Consistency</span>
            <span className={`score-badge ${consistency.score >= 70 ? "good" : consistency.score >= 40 ? "ok" : "low"}`}>
              {consistency.score}/100
            </span>
          </div>
          <div className="score-detail">{consistency.stdDevHours}h std deviation</div>
          <div className="score-bar">
            <div className="score-fill" style={{ width: `${consistency.score}%` }} />
          </div>
        </div>
        <div className="score-card">
          <div className="score-header">
            <span className="score-title">Fragmentation</span>
            <span className={`score-badge ${fragmentation.score >= 70 ? "good" : fragmentation.score >= 40 ? "ok" : "low"}`}>
              {fragmentation.score}/100
            </span>
          </div>
          <div className="score-detail">{fragmentation.avgEntriesPerDay} entries/day, ~{fragmentation.avgDurationMinutes}min avg</div>
          <div className="score-bar">
            <div className="score-fill" style={{ width: `${fragmentation.score}%` }} />
          </div>
        </div>
        <div className="score-card">
          <div className="score-header">
            <span className="score-title">Forecast</span>
            <span className={`score-badge ${forecast.onTrack ? "good" : "low"}`}>
              {forecast.onTrack ? "On track" : "Behind"}
            </span>
          </div>
          <div className="score-detail">{forecast.message}</div>
        </div>
      </div>

      {/* Charts */}
      <section className="analytics-section">
        <h3>Daily Hours</h3>
        <div className="chart-container" dangerouslySetInnerHTML={{ __html: barSvg }} />
      </section>

      <div className="analytics-row">
        <section className="analytics-section analytics-section--half">
          <h3>Time by Project</h3>
          <div className="chart-container chart-container--centered" dangerouslySetInnerHTML={{ __html: donutSvg }} />
          <ul className="legend">
            {pieSlices.map((s, i) => (
              <li key={i}>
                <span className="legend-dot" style={{ backgroundColor: s.color }} />
                {s.label}: {s.value.toFixed(1)}h
              </li>
            ))}
          </ul>
        </section>

        <section className="analytics-section analytics-section--half">
          <h3>Weekly Trend</h3>
          <div className="chart-container" dangerouslySetInnerHTML={{ __html: trendSvg }} />
        </section>
      </div>

      {/* Top Issues */}
      <section className="analytics-section">
        <h3>Top Issues This Week</h3>
        {topIssues.length === 0 ? (
          <div className="no-logs">No issues logged yet</div>
        ) : (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Hours</th>
                <th>Share</th>
                <th>Entries</th>
              </tr>
            </thead>
            <tbody>
              {topIssues.map((issue) => (
                <tr key={issue.issueKey}>
                  <td><span className="issue-tag">{issue.issueKey}</span></td>
                  <td>{issue.hours.toFixed(1)}h</td>
                  <td>{issue.percentage}%</td>
                  <td>{issue.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Day Pattern */}
      <section className="analytics-section">
        <h3>Day of Week Pattern</h3>
        <div className="day-pattern">
          {dayPattern.filter(d => d.day !== "Sun" && d.day !== "Sat").map((d) => {
            const maxHours = Math.max(...dayPattern.map(p => p.avgHours)) || 1;
            const pct = (d.avgHours / maxHours) * 100;
            return (
              <div key={d.day} className="day-pattern-item">
                <div className="day-pattern-bar-container">
                  <div className="day-pattern-bar" style={{ height: `${pct}%` }} />
                </div>
                <div className="day-pattern-label">{d.day}</div>
                <div className="day-pattern-value">{d.avgHours}h</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Week over Week */}
      <section className="analytics-section">
        <h3>Week-over-Week</h3>
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Hours</th>
              <th>vs Target</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => {
              const diff = w.totalHours - settings.weeklyTargetHours;
              return (
                <tr key={i}>
                  <td>{w.weekLabel}</td>
                  <td>{w.totalHours.toFixed(1)}h</td>
                  <td className={diff >= 0 ? "positive" : "negative"}>
                    {diff >= 0 ? "+" : ""}{diff.toFixed(1)}h
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Overtime Heatmap */}
      {overtimeHeatmap.length > 0 && (
        <section className="analytics-section">
          <h3>Overtime Heatmap</h3>
          <div className="chart-container chart-container--centered" dangerouslySetInnerHTML={{ __html: renderHeatmapRow(overtimeHeatmap, { width: 480 }) }} />
          <div className="heatmap-legend">
            <span>Under target</span>
            <div className="heatmap-legend-gradient" />
            <span>Over target</span>
          </div>
        </section>
      )}

      {/* Time Distribution */}
      {timeDistribution.some(b => b.count > 0) && (
        <section className="analytics-section">
          <h3>Time Distribution</h3>
          <div className="chart-container" dangerouslySetInnerHTML={{ __html: renderHistogram(timeDistribution, { width: 480, height: 180 }) }} />
        </section>
      )}

      {/* Unlogged Hours Gap */}
      {unloggedGaps.length > 0 && (
        <section className="analytics-section">
          <h3>Unlogged Hours</h3>
          <div className="chart-container" dangerouslySetInnerHTML={{ __html: renderGapChart(unloggedGaps, { width: 480, height: 200, targetLine: settings.dailyTargetHours }) }} />
        </section>
      )}

      {/* Project Momentum */}
      {projectMomentum.length > 0 && projectMomentum.some(p => p.direction !== "stable") && (
        <section className="analytics-section">
          <h3>Project Momentum</h3>
          <div className="chart-container chart-container--centered" dangerouslySetInnerHTML={{ __html: renderMomentumBars(projectMomentum, { width: 480, height: 200 }) }} />
        </section>
      )}
    </div>
  );
}
