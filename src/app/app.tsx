import { useState, useEffect } from "react";
import { parseInput } from "../utils/parser";
import { logWork, fetchWorklogs, Worklog, formatJiraStarted, formatDate, JiraUser, extractUsersFromWorklogs, extractDateFromISOString, getDayOfWeekFromISOString } from "../utils/jira";

type Tab = "log" | "range" | "week";
type Theme = "light" | "dark";

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekEndingSaturdayString(baseDate: Date = new Date()) {
  const target = new Date(baseDate);
  const day = target.getDay();
  const daysToSaturday = (6 - day + 7) % 7;
  target.setDate(target.getDate() + daysToSaturday);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(target.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("log");
  const [theme, setTheme] = useState<Theme>("light");
  const [jiraUrl, setJiraUrl] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [logDate, setLogDate] = useState("");
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [weekDate, setWeekDate] = useState(getWeekEndingSaturdayString());
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [rangeWorklogs, setRangeWorklogs] = useState<Worklog[]>([]);
  const [weekWorklogs, setWeekWorklogs] = useState<Worklog[]>([]);
  const [allUsers, setAllUsers] = useState<JiraUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Load saved credentials
  useEffect(() => {
    chrome.storage.local.get(["jiraUrl", "email", "token"], (data) => {
      if (data.jiraUrl) setJiraUrl(data.jiraUrl);
      if (data.email) setEmail(data.email);
      if (data.token) setToken(data.token);
    });
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  // Save credentials
  const saveCredentials = () => {
    chrome.storage.local.set({ jiraUrl, email, token });
    setResult("✅ Credentials saved");
  };

  async function handleLog() {
    try {
      setLoading(true);
      if (!logDate) {
        throw new Error("Please select a log date");
      }
      setResult("Logging time...");
      const entries = parseInput(input);
      for (const e of entries) {
        const started = formatJiraStarted(logDate);
        await logWork(
          jiraUrl,
          email,
          token,
          e.issueKey,
          e.timeSpent,
          e.comment,
          started
        );
      }
      setResult("✅ Time logged successfully");
      setInput("");
    } catch (err: any) {
      setResult(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadRangeWorklogs() {
    try {
      setLoading(true);
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T23:59:59`);
      if (end < start) {
        throw new Error("End date must be on or after start date");
      }

      const logs = await fetchWorklogs(jiraUrl, email, token, start, end);
      setRangeWorklogs(logs);
      
      // Extract unique users from the fetched worklogs
      const users = extractUsersFromWorklogs(logs);
      setAllUsers(users);
    } catch (err: any) {
      setResult(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadWeekWorklogs() {
    try {
      setLoading(true);
      const anchor = new Date(`${weekDate}T00:00:00`);
      const start = new Date(anchor);
      const day = start.getDay();
      const diffToMonday = (day + 6) % 7;
      start.setDate(start.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const logs = await fetchWorklogs(jiraUrl, email, token, start, end);
      setWeekWorklogs(logs);
      
      // Extract unique users from the fetched worklogs
      const users = extractUsersFromWorklogs(logs);
      setAllUsers(users);
    } catch (err: any) {
      setResult(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "range" && jiraUrl && email && token) {
      const timeoutId = window.setTimeout(() => {
        loadRangeWorklogs();
      }, 300);

      return () => window.clearTimeout(timeoutId);
    }
  }, [activeTab, startDate, endDate, jiraUrl, email, token]);

  useEffect(() => {
    if (activeTab === "week" && jiraUrl && email && token) {
      const timeoutId = window.setTimeout(() => {
        loadWeekWorklogs();
      }, 300);

      return () => window.clearTimeout(timeoutId);
    }
  }, [activeTab, weekDate, jiraUrl, email, token]);

  // Filter worklogs based on selected user
  const getFilteredRangeWorklogs = () => {
    if (selectedUser === "all") return rangeWorklogs;
    return rangeWorklogs.filter(wl => wl.authorEmail === selectedUser);
  };

  const getFilteredWeekWorklogs = () => {
    if (selectedUser === "all") return weekWorklogs;
    return weekWorklogs.filter(wl => wl.authorEmail === selectedUser);
  };

  const groupedByDate = () => {
    const grouped: { [key: string]: { worklogs: Worklog[]; total: number } } = {};
    const filteredLogs = getFilteredRangeWorklogs();

    filteredLogs.forEach((wl) => {
      const dateKey = extractDateFromISOString(wl.started);
      if (!grouped[dateKey]) {
        grouped[dateKey] = { worklogs: [], total: 0 };
      }
      grouped[dateKey].worklogs.push(wl);
      grouped[dateKey].total += wl.timeSpentSeconds;
    });

    return grouped;
  };

  const groupedByWeekday = () => {
    const days = [
      { key: "Mon", label: "Monday", working: true },
      { key: "Tue", label: "Tuesday", working: true },
      { key: "Wed", label: "Wednesday", working: true },
      { key: "Thu", label: "Thursday", working: true },
      { key: "Fri", label: "Friday", working: true }
    ];

    const grouped = days.map((d) => ({
      ...d,
      worklogs: [] as Worklog[],
      total: 0
    }));

    const filteredLogs = getFilteredWeekWorklogs();

    filteredLogs.forEach((wl) => {
      const dayOfWeek = getDayOfWeekFromISOString(wl.started);
      // Only process Monday (1) through Friday (5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const index = dayOfWeek - 1; // Monday = 0, Friday = 4
        grouped[index].worklogs.push(wl);
        grouped[index].total += wl.timeSpentSeconds;
      }
    });

    return grouped;
  };

  const formatSeconds = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1>⏱️ Jira Bulk Time Logger</h1>
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
              </svg>
            )}
          </button>
        </div>
        <div className="tabs">
          <button 
            className={`tab ${activeTab === "log" ? "active" : ""}`}
            onClick={() => setActiveTab("log")}
          >
            ⏱️ Log Time
          </button>
          <button 
            className={`tab ${activeTab === "range" ? "active" : ""}`}
            onClick={() => setActiveTab("range")}
          >
            📊 Date Range
          </button>
          <button 
            className={`tab ${activeTab === "week" ? "active" : ""}`}
            onClick={() => setActiveTab("week")}
          >
            📅 Weekly Logs
          </button>
        </div>
      </header>

      <main className="main">
        {activeTab === "log" ? (
          <div className="log-section">
            <div className="credentials-section">
              <h2>🔧 Configuration</h2>
              <div className="input-group">
                <label>🌐 Jira URL</label>
                <input
                  type="text"
                  placeholder="https://yourorg.atlassian.net"
                  value={jiraUrl}
                  onChange={e => setJiraUrl(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label>📧 Email</label>
                <input
                  type="email"
                  placeholder="your.email@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label>🔑 API Token</label>
                <input
                  type="password"
                  placeholder="Your Jira API token"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                />
              </div>

              <button className="btn-secondary" onClick={saveCredentials}>
                💾 Save Credentials
              </button>
            </div>

            <div className="log-time-section">
              <h2>⏱️ Log Time</h2>
              <div className={`input-group ${!logDate ? "is-invalid" : ""}`}>
                <label>📅 Log Date (required)</label>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>📝 Time Entries (one per line)</label>
                <textarea
                  rows={8}
                  placeholder="TASK-123: 2h: Implemented feature&#10;TASK-456: 1.5h: Bug fix&#10;TASK-789: 30m: Code review"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                />
              </div>

              <button 
                className="btn-primary" 
                onClick={handleLog}
                disabled={loading || !jiraUrl || !email || !token || !logDate}
              >
                {loading ? "⏳ Logging..." : "🚀 Log Time"}
              </button>
            </div>

            {result && <div className={`result ${result.startsWith("❌") ? "error" : "success"}`}>{result}</div>}
          </div>
        ) : activeTab === "range" ? (
          <div className="view-section">
            <div className="view-header">
              <h2>Time Logs by Date</h2>
              <button 
                className="btn-secondary" 
                onClick={loadRangeWorklogs}
                disabled={loading}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="range-controls">
              <div className="input-group">
                <label>👤 User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  disabled={loading || allUsers.length === 0}
                  style={{
                    width: "100%",
                    padding: "1rem 1.25rem",
                    border: "2px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "1rem",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontFamily: "inherit",
                    cursor: loading || allUsers.length === 0 ? "not-allowed" : "pointer",
                    opacity: loading || allUsers.length === 0 ? 0.6 : 1
                  }}
                >
                  <option value="all">{loading ? "Loading users..." : "Everyone"}</option>
                  {allUsers.map((user) => (
                    <option key={user.emailAddress} value={user.emailAddress}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <button 
                className="btn-primary range-button" 
                onClick={loadRangeWorklogs}
                disabled={loading || !jiraUrl || !email || !token}
              >
                {loading ? "Loading..." : "Get Logs"}
              </button>
            </div>

            <div className="range-grid">
              {Object.entries(groupedByDate())
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
                        data.worklogs.map((wl, idx) => (
                          <div key={idx} className="worklog-card">
                            <div className="worklog-issue">{wl.issueKey}</div>
                            <div className="worklog-time">{wl.timeSpent}</div>
                            {wl.comment && <div className="worklog-comment">{wl.comment}</div>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
            </div>

            <div className="range-summary">
              <strong>Total Range:</strong> {formatSeconds(getFilteredRangeWorklogs().reduce((sum, wl) => sum + wl.timeSpentSeconds, 0))}
            </div>
          </div>
        ) : (
          <div className="view-section">
            <div className="view-header">
              <h2>Time Logs by Week</h2>
              <button 
                className="btn-secondary" 
                onClick={loadWeekWorklogs}
                disabled={loading}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            <div className="week-controls">
              <div className="input-group">
                <label>👤 User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  disabled={loading || allUsers.length === 0}
                  style={{
                    width: "100%",
                    padding: "1rem 1.25rem",
                    border: "2px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "1rem",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontFamily: "inherit",
                    cursor: loading || allUsers.length === 0 ? "not-allowed" : "pointer",
                    opacity: loading || allUsers.length === 0 ? 0.6 : 1
                  }}
                >
                  <option value="all">{loading ? "Loading users..." : "Everyone"}</option>
                  {allUsers.map((user) => (
                    <option key={user.emailAddress} value={user.emailAddress}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Week Ending (Saturday)</label>
                <input
                  type="date"
                  value={weekDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) {
                      setWeekDate("");
                      return;
                    }
                    const selected = new Date(`${value}T00:00:00`);
                    if (Number.isNaN(selected.getTime())) {
                      setWeekDate("");
                      return;
                    }
                    setWeekDate(getWeekEndingSaturdayString(selected));
                  }}
                />
              </div>
              <button 
                className="btn-primary range-button" 
                onClick={loadWeekWorklogs}
                disabled={loading || !jiraUrl || !email || !token}
              >
                {loading ? "Loading..." : "Get Logs"}
              </button>
            </div>

            <div className="week-grid">
              {groupedByWeekday().map((day) => (
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
                        <div key={idx} className="worklog-card">
                          <div className="worklog-issue">{wl.issueKey}</div>
                          <div className="worklog-time">{wl.timeSpent}</div>
                          {wl.comment && <div className="worklog-comment">{wl.comment}</div>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="range-summary">
              <strong>Total Week (Mon-Fri):</strong> {formatSeconds(groupedByWeekday().filter(d => d.working).reduce((sum, d) => sum + d.total, 0))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
