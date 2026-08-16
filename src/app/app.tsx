import { useState } from "react";
import { JiraProvider, useJira } from "../context/JiraContext";
import { Sidebar } from "../components/Sidebar";
import { LogTimeTab } from "../components/LogTimeTab";
import { DateRangeTab } from "../components/DateRangeTab";
import { WeeklyTab } from "../components/WeeklyTab";
import { TeamReportTab } from "../components/TeamReportTab";
import { AiAssistantTab } from "../components/AiAssistantTab";
import { AnalyticsTab } from "../components/AnalyticsTab";
import { SettingsPanel } from "../components/SettingsPanel";
import { ErrorBoundary } from "../components/ErrorBoundary";

type Tab = "log" | "range" | "week" | "report" | "ai" | "analytics";

const PAGE_TITLES: Record<Tab, string> = {
  analytics: "Dashboard",
  log: "Log Time",
  range: "Date Range",
  week: "Weekly",
  report: "Team Report",
  ai: "AI Assistant",
};

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>("analytics");
  const [showSettings, setShowSettings] = useState(false);
  const { theme, setTheme } = useJira();

  return (
    <div className="shell">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onThemeToggle={() => setTheme(theme === "light" ? "dark" : "light")}
        onSettingsClick={() => setShowSettings(true)}
      />

      <div className="shell-main">
        <header className="topbar">
          <h1>{PAGE_TITLES[activeTab]}</h1>
        </header>

        <main className="main">
          {activeTab === "log" && <ErrorBoundary label="Log Time"><LogTimeTab /></ErrorBoundary>}
          {activeTab === "range" && <ErrorBoundary label="Date Range"><DateRangeTab /></ErrorBoundary>}
          {activeTab === "week" && <ErrorBoundary label="Weekly"><WeeklyTab /></ErrorBoundary>}
          {activeTab === "report" && <ErrorBoundary label="Team Report"><TeamReportTab /></ErrorBoundary>}
          {activeTab === "ai" && <ErrorBoundary label="AI Assistant"><AiAssistantTab /></ErrorBoundary>}
          {activeTab === "analytics" && <ErrorBoundary label="Dashboard"><AnalyticsTab /></ErrorBoundary>}
        </main>
      </div>

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
