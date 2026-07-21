import { useAnalytics } from "../hooks/useAnalytics";
import { useSettings } from "../hooks/useSettings";
import { renderBarChart, renderDonutChart, renderTrendLine, getColor, BarData, PieSlice } from "../utils/charts";

export function AnalyticsTab() {
  const { weeks, teamBreakdown, loading } = useAnalytics(4);
  const { settings } = useSettings();

  if (loading) {
    return <div className="analytics-loading">Loading analytics...</div>;
  }

  if (weeks.length === 0) {
    return <div className="analytics-empty">No data available. Ensure credentials are configured.</div>;
  }

  const currentWeek = weeks[weeks.length - 1];
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

  const barSvg = renderBarChart(barData, { width: 500, height: 220, targetLine: settings.dailyTargetHours });
  const donutSvg = renderDonutChart(pieSlices, { size: 180 });
  const trendSvg = renderTrendLine(trendData, { width: 500, height: 200 });

  return (
    <div className="analytics-tab">
      <section className="analytics-section">
        <h3>This Week — Daily Hours</h3>
        <div className="chart-container" dangerouslySetInnerHTML={{ __html: barSvg }} />
        <div className="analytics-stat">
          Total: <strong>{currentWeek.totalHours.toFixed(1)}h</strong> / {settings.weeklyTargetHours}h target
        </div>
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
    </div>
  );
}
