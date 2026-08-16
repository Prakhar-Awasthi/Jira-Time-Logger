import { useState } from "react";
import { useAnalytics } from "../hooks/useAnalytics";
import { useSettings } from "../hooks/useSettings";
import { usePeerComparison } from "../hooks/usePeerComparison";
import { renderBarChart, renderDonutChart, renderTrendLine, renderHeatmapRow, renderHistogram, renderGapChart, renderMomentumBars, renderSparkline, renderPeerBarChart, getColor, BarData, PieSlice } from "../utils/charts";

function trendBadge(current: number, previous: number): { direction: "up" | "down"; text: string } | null {
  if (previous <= 0) return current > 0 ? { direction: "up", text: "New" } : null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.1) return null;
  return { direction: pct >= 0 ? "up" : "down", text: `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(1)}%` };
}

function rankSuffix(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function getAvatarColor(email: string): string {
  const colors = ["#14b8a6", "#7c6cf0", "#ec4899", "#f97316", "#0ea5e9", "#16a34a", "#d97706", "#6366f1"];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function AnalyticsTab() {
  const [timeRange, setTimeRange] = useState<"4w" | "3m" | "6m">("4w");
  const weeksBack = timeRange === "4w" ? 4 : timeRange === "3m" ? 13 : 26;
  const { weeks, teamBreakdown, loading, previousWeekWorklogs, topIssues, focusScore, streak, consistency, dayPattern, forecast, overtimeHeatmap, timeDistribution, projectMomentum, fragmentation, unloggedGaps, burnoutSignal, issueEstimates } = useAnalytics(weeksBack);
  const { settings } = useSettings();
  const [peerTeam, setPeerTeam] = useState("");
  const currentWeekForPeers = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const { peers, teamOptions, defaultTeam } = usePeerComparison(currentWeekForPeers, peerTeam);

  if (loading) {
    return <div className="analytics-loading">Loading analytics...</div>;
  }

  if (weeks.length === 0) {
    return <div className="analytics-empty">No data available. Ensure credentials are configured.</div>;
  }

  const currentWeek = weeks[weeks.length - 1];
  const previousWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const priorMonthWeek = weeks.length >= 5 ? weeks[weeks.length - 5] : null;
  const totalHours = currentWeek.totalHours;
  const workingDays = currentWeek.dailyTotals.filter(d => d.hours > 0).length || 1;
  const avgPerDay = totalHours / workingDays;
  const issueCount = topIssues.length;
  const prevIssueCount = new Set(previousWeekWorklogs.map(wl => wl.issueKey)).size;

  const weeklyAvgPerDay = weeks.map(w => w.totalHours / (w.dailyTotals.filter(d => d.hours > 0).length || 1));

  const kpiCards = [
    {
      heading: "This Week",
      value: `${totalHours.toFixed(1)}h`,
      sub: `${settings.weeklyTargetHours}h target`,
      badge: previousWeek ? trendBadge(totalHours, previousWeek.totalHours) : null,
      spark: renderSparkline(weeks.map(w => w.totalHours), { color: "var(--accent)" }),
    },
    {
      heading: "Avg / Day",
      value: `${avgPerDay.toFixed(1)}h`,
      sub: `${workingDays} days logged`,
      badge: previousWeek ? trendBadge(avgPerDay, weeklyAvgPerDay[weeklyAvgPerDay.length - 2] || 0) : null,
      spark: renderSparkline(weeklyAvgPerDay, { color: "var(--teal)" }),
    },
    {
      heading: "Issues",
      value: `${issueCount}`,
      sub: "worked on",
      badge: trendBadge(issueCount, prevIssueCount),
      spark: null,
    },
    {
      heading: "Streak",
      value: `${streak.current}d`,
      sub: `longest: ${streak.longest}d`,
      badge: null,
      spark: null,
    },
  ];

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
      {/* Time range picker */}
      <div className="timerange-picker">
        {(["4w", "3m", "6m"] as const).map(r => (
          <button key={r} className={`timerange-btn${timeRange === r ? " active" : ""}`} onClick={() => setTimeRange(r)}>
            {r === "4w" ? "4 Weeks" : r === "3m" ? "3 Months" : "6 Months"}
          </button>
        ))}
      </div>

      {/* Burnout signal */}
      {burnoutSignal.active && (
        <div className="burnout-callout">
          <span className="burnout-icon">⚠</span>
          <span>{burnoutSignal.message}</span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="kpi-row">
        {kpiCards.map((card) => (
          <div key={card.heading} className="kpi-card kpi-card--trend">
            <div className="kpi-card-top">
              <span className="kpi-card-heading">{card.heading}</span>
              {card.badge && (
                <span className={`kpi-card-badge ${card.badge.direction === "down" ? "down" : ""}`}>{card.badge.text}</span>
              )}
            </div>
            <div className="kpi-value">{card.value}</div>
            <div className="kpi-sub">{card.sub}</div>
            {card.spark && (
              <div className="kpi-card-spark" dangerouslySetInnerHTML={{ __html: card.spark }} />
            )}
          </div>
        ))}
        {priorMonthWeek && (
          <div className="kpi-card kpi-card--trend">
            <div className="kpi-card-top"><span className="kpi-card-heading">4 Weeks Ago</span></div>
            <div className="kpi-value">{priorMonthWeek.totalHours.toFixed(1)}h</div>
            <div className="kpi-sub">
              {(() => {
                const diff = totalHours - priorMonthWeek.totalHours;
                return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}h vs now`;
              })()}
            </div>
          </div>
        )}
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
          <ul className="leaderboard">
            {pieSlices.map((s, i) => {
              const pieTotal = pieSlices.reduce((sum, x) => sum + x.value, 0) || 1;
              const pct = (s.value / pieTotal) * 100;
              return (
                <li key={i} className="leaderboard-item">
                  <span className="leaderboard-dot" style={{ backgroundColor: s.color }} />
                  <span className="leaderboard-name">{s.label}</span>
                  <span className="leaderboard-track">
                    <span className="leaderboard-fill" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </span>
                  <span className="leaderboard-value">{s.value.toFixed(1)}h</span>
                </li>
              );
            })}
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
                <th>My Hours</th>
                <th>Estimate</th>
                <th>Share</th>
                <th>Entries</th>
              </tr>
            </thead>
            <tbody>
              {topIssues.map((issue) => {
                const est = issueEstimates.find(e => e.issueKey === issue.issueKey);
                const estHours = est?.originalEstimateSeconds != null ? est.originalEstimateSeconds / 3600 : null;
                const isOver = estHours != null && issue.hours > estHours;
                return (
                  <tr key={issue.issueKey}>
                    <td><span className="issue-tag">{issue.issueKey}</span></td>
                    <td className={isOver ? "over-estimate" : ""}>{issue.hours.toFixed(1)}h</td>
                    <td className="estimate-col">{estHours != null ? `${estHours.toFixed(1)}h` : "—"}</td>
                    <td>{issue.percentage}%</td>
                    <td>{issue.entries}</td>
                  </tr>
                );
              })}
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

      {/* Peer Comparison */}
      {peers.length > 0 && (() => {
        const activeTeam = peerTeam || defaultTeam;
        const currentUserPeer = peers.find(p => p.isCurrentUser);
        const peerBarItems = peers.map(p => ({ name: p.name, value: p.totalHours, isCurrentUser: p.isCurrentUser, rank: p.rank }));

        return (
          <section className="analytics-section">
            <div className="peer-section-header">
              <h3>Peer Comparison — This Week</h3>
              {teamOptions.length > 1 && (
                <div className="peer-team-pills">
                  {teamOptions.map(team => (
                    <button
                      key={team}
                      className={`peer-team-pill${(peerTeam || defaultTeam) === team ? " active" : ""}`}
                      onClick={() => setPeerTeam(team)}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {activeTeam && <div className="peer-team-label">Team: <strong>{activeTeam}</strong> · {peers.length} member{peers.length !== 1 ? "s" : ""}</div>}

            <div className="chart-container" dangerouslySetInnerHTML={{ __html: renderPeerBarChart(peerBarItems, { width: 480 }) }} />

            <table className="analytics-table peer-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Member</th>
                  <th>Hours</th>
                  <th>Avg / Day</th>
                  <th>Issues</th>
                  <th>Focus</th>
                  <th>Days Logged</th>
                </tr>
              </thead>
              <tbody>
                {peers.map(peer => (
                  <tr key={peer.email} className={peer.isCurrentUser ? "peer-row--you" : ""}>
                    <td>
                      <span className={`peer-rank-badge ${peer.rank <= 3 ? `peer-rank-badge--top${peer.rank}` : ""}`}>
                        {rankSuffix(peer.rank)}
                      </span>
                    </td>
                    <td>
                      <div className="peer-member-cell">
                        <span className="avatar" style={{ backgroundColor: getAvatarColor(peer.email), width: 26, height: 26, fontSize: 10 }}>
                          {peer.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        <span className="peer-member-name">{peer.name}</span>
                        {peer.isCurrentUser && <span className="peer-you-badge">You</span>}
                      </div>
                    </td>
                    <td>
                      <span className={peer.isCurrentUser ? "peer-value--accent" : ""}>{peer.totalHours.toFixed(1)}h</span>
                    </td>
                    <td>{peer.avgPerDay.toFixed(1)}h</td>
                    <td>{peer.issueCount}</td>
                    <td>
                      <span className={`score-badge ${peer.focusScore >= 70 ? "good" : peer.focusScore >= 40 ? "ok" : "low"}`}>
                        {peer.focusScore}/100
                      </span>
                    </td>
                    <td>{peer.daysLogged}d</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {currentUserPeer && (
              <div className="peer-summary">
                {currentUserPeer.rank === 1
                  ? `You're leading the team with ${currentUserPeer.totalHours.toFixed(1)}h this week.`
                  : (() => {
                      const ahead = peers[currentUserPeer.rank - 2];
                      const gap = ahead ? (ahead.totalHours - currentUserPeer.totalHours).toFixed(1) : "0";
                      return `You're ranked ${rankSuffix(currentUserPeer.rank)} out of ${peers.length}. ${gap}h behind ${ahead?.name.split(" ")[0] ?? "next"}.`;
                    })()
                }
              </div>
            )}
          </section>
        );
      })()}
    </div>
  );
}
