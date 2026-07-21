import { useState } from "react";
import { JiraProvider, useJira } from "../context/JiraContext";
import { LogTimeTab } from "../components/LogTimeTab";
import { DateRangeTab } from "../components/DateRangeTab";
import { WeeklyTab } from "../components/WeeklyTab";
import { TeamReportTab } from "../components/TeamReportTab";
import { AiAssistantTab } from "../components/AiAssistantTab";
import { AnalyticsTab } from "../components/AnalyticsTab";
import { SettingsPanel } from "../components/SettingsPanel";

type Tab = "log" | "range" | "week" | "report" | "ai" | "analytics";

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>("log");
  const [showSettings, setShowSettings] = useState(false);
  const { theme, setTheme } = useJira();

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1>Jira Time Logger</h1>
          <div className="header-actions">
            <button
              className="theme-toggle"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Toggle theme"
            >
              {theme === "light" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
                </svg>
              )}
            </button>
            <button
              className="theme-toggle"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="tabs">
          <button className={`tab ${activeTab === "log" ? "active" : ""}`} onClick={() => setActiveTab("log")}>
            Log Time
          </button>
          <button className={`tab ${activeTab === "range" ? "active" : ""}`} onClick={() => setActiveTab("range")}>
            Date Range
          </button>
          <button className={`tab ${activeTab === "week" ? "active" : ""}`} onClick={() => setActiveTab("week")}>
            Weekly
          </button>
          <button className={`tab ${activeTab === "report" ? "active" : ""}`} onClick={() => setActiveTab("report")}>
            Team
          </button>
          <button className={`tab ${activeTab === "ai" ? "active" : ""}`} onClick={() => setActiveTab("ai")}>
            AI Assistant
          </button>
          <button className={`tab ${activeTab === "analytics" ? "active" : ""}`} onClick={() => setActiveTab("analytics")}>
            Analytics
          </button>
        </div>
      </header>

      <main className="main">
        {activeTab === "log" && <LogTimeTab />}
        {activeTab === "range" && <DateRangeTab />}
        {activeTab === "week" && <WeeklyTab />}
        {activeTab === "report" && <TeamReportTab />}
        {activeTab === "ai" && <AiAssistantTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
      </main>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <JiraProvider>
      <AppContent />
    </JiraProvider>
  );
}
