import { Worklog } from "../utils/jira";
import { NlpEntry, NlpResult, parseNaturalLanguage } from "../utils/nlp-parser";
import { generateWeeklySummary, formatSummaryAsText, detectAnomalies, suggestMissingDays, getTopIssues, computeFocusScore, computeStreak, computeForecast, compareWeeks, suggestDayPlan, computeTrendingIssues, getWorklogsForDay, formatStandup, formatTeamComparison, parseTimeFromInput, resolveDayReference } from "../utils/insights";
import { AlertRule } from "../utils/alert-rules";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  entries?: NlpEntry[];
  type?: "text" | "entries" | "summary" | "anomalies";
  action?: { type: "add_rule"; rule: Omit<AlertRule, "id"> };
}

export interface AiServiceContext {
  recentIssues: string[];
  worklogs: Worklog[];
  previousWeekWorklogs?: Worklog[];
  startDate: string;
  endDate: string;
  weeklyTargetHours?: number;
  dailyTargetHours?: number;
}

type Intent = "log" | "summary" | "anomaly" | "missing" | "help" | "compare" | "focus" | "forecast" | "top" | "streak" | "plan" | "trending" | "batch" | "reminder" | "export" | "teamcompare";

function detectIntent(input: string): Intent {
  const lower = input.toLowerCase();
  if (lower.includes("compare") || lower.includes("vs last") || lower.includes("versus") || lower.includes("last week")) {
    return "compare";
  }
  if (lower.includes("plan my day") || lower.includes("what should i") || lower.includes("allocate") || (lower.includes("plan") && lower.includes("today"))) {
    return "plan";
  }
  if (lower.includes("trending") || lower.includes("gaining") || lower.includes("growing")) {
    return "trending";
  }
  if (lower.includes("batch") || lower.includes("copy") || lower.includes("same as") || lower.includes("repeat") || lower.includes("log yesterday")) {
    return "batch";
  }
  if (lower.includes("remind") || lower.includes("nudge") || lower.includes("alert me") || lower.includes("notify me")) {
    return "reminder";
  }
  if (lower.includes("export") || lower.includes("standup") || lower.includes("status update") || lower.includes("daily report") || lower.includes("stand-up")) {
    return "export";
  }
  if (lower.includes("team comparison") || lower.includes("team split") || lower.includes("by team") || lower.includes("project split")) {
    return "teamcompare";
  }
  if (lower.includes("focus") || lower.includes("context switch") || lower.includes("distract")) {
    return "focus";
  }
  if (lower.includes("forecast") || lower.includes("pace") || lower.includes("on track") || lower.includes("will i hit") || lower.includes("projection")) {
    return "forecast";
  }
  if (lower.includes("top issue") || lower.includes("most time") || lower.includes("biggest") || lower.includes("top task") || lower.includes("spent most")) {
    return "top";
  }
  if (lower.includes("streak") || lower.includes("consecutive") || lower.includes("how many days")) {
    return "streak";
  }
  if (lower.includes("summar") || lower.includes("breakdown") || lower.includes("how much") || lower.includes("total")) {
    return "summary";
  }
  if (lower.includes("anomal") || lower.includes("duplicate") || lower.includes("wrong")) {
    return "anomaly";
  }
  if (lower.includes("missing") || lower.includes("forgot") || lower.includes("gap") || lower.includes("what am i")) {
    return "missing";
  }
  if (lower.includes("help") || lower.includes("what can")) {
    return "help";
  }
  return "log";
}

export function processMessage(input: string, context: AiServiceContext): ChatMessage {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const intent = detectIntent(input);

  switch (intent) {
    case "summary": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No worklogs loaded yet. Switch to a view tab first to load data for the current period, then come back and ask for a summary.", type: "text" };
      }
      const summary = generateWeeklySummary(context.worklogs);
      const text = formatSummaryAsText(summary);
      return { id, role: "assistant", content: text, type: "summary" };
    }

    case "anomaly": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No worklogs loaded yet. Load some data first and then I can check for anomalies.", type: "text" };
      }
      const anomalies = detectAnomalies(context.worklogs);
      if (anomalies.length === 0) {
        return { id, role: "assistant", content: "No anomalies detected! Your time logs look clean.", type: "text" };
      }
      let text = `**Found ${anomalies.length} potential issue${anomalies.length > 1 ? "s" : ""}:**\n\n`;
      anomalies.forEach(a => {
        const icon = a.severity === "warning" ? "[Warning]" : "[Info]";
        text += `${icon} ${a.message}\n`;
      });
      return { id, role: "assistant", content: text, type: "anomalies" };
    }

    case "missing": {
      if (!context.startDate || !context.endDate) {
        return { id, role: "assistant", content: "I need a date range to check for missing days. Load some data in the Date Range or Weekly view first.", type: "text" };
      }
      const missing = suggestMissingDays(context.worklogs, context.startDate, context.endDate);
      if (missing.length === 0) {
        return { id, role: "assistant", content: "All weekdays in the current range have time logged. You're all caught up!", type: "text" };
      }
      let text = `**Missing time logs for ${missing.length} day${missing.length > 1 ? "s" : ""}:**\n\n`;
      missing.forEach(d => { text += `• ${d}\n`; });
      text += "\nYou can log time for these days using the Log Time tab or type entries here.";
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "help": {
      const text = `**I can help you with:**\n\n` +
        `**Log time** — Type naturally:\n• "2h on PROJ-123 fixing the login bug"\n• "PROJ-456 30m code review, PROJ-789 1h feature work"\n\n` +
        `**Get insights** — Try:\n• "Summarize this week"\n• "Compare to last week"\n• "Top issues" / "What's trending?"\n• "Focus score"\n• "Am I on track?" / "Forecast"\n• "How's my streak?"\n• "Check for anomalies"\n• "What am I missing?"\n\n` +
        `**Actions** — Try:\n• "Plan my day"\n• "Export standup"\n• "Copy Monday" (batch log)\n• "Remind me at 5pm"\n• "Team comparison"`;
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "compare": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet. Load worklogs first.", type: "text" };
      }
      const prevWorklogs = context.previousWeekWorklogs || [];
      if (prevWorklogs.length === 0) {
        return { id, role: "assistant", content: "No previous week data available for comparison. Open the Analytics tab to load multi-week data.", type: "text" };
      }
      const text = compareWeeks(context.worklogs, prevWorklogs);
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "focus": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const focus = computeFocusScore(context.worklogs);
      let text = `**Focus Score: ${focus.score}/100**\n\n`;
      text += `You averaged **${focus.avgIssuesPerDay} issues per day** this week.\n\n`;
      if (focus.score >= 70) text += "Great focus — you're keeping context switches low.";
      else if (focus.score >= 40) text += "Moderate focus. Some days had many task switches.";
      else text += "High context switching detected. Consider batching similar work.";
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "forecast": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const fc = computeForecast(context.worklogs, context.weeklyTargetHours || 40);
      let text = `**Pace Check**\n\n`;
      text += fc.message;
      text += `\n\nProjected weekly total: **${fc.projectedHours}h**`;
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "top": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const issues = getTopIssues(context.worklogs, 5);
      if (issues.length === 0) {
        return { id, role: "assistant", content: "No issues found in current data.", type: "text" };
      }
      let text = `**Top ${issues.length} issues by time:**\n\n`;
      issues.forEach((issue, i) => {
        text += `${i + 1}. **${issue.issueKey}** — ${issue.hours.toFixed(1)}h (${issue.percentage}%)\n`;
      });
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "streak": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const s = computeStreak(context.worklogs);
      let text = `**Logging Streak**\n\n`;
      text += `Current: **${s.current} day${s.current !== 1 ? "s" : ""}**\n`;
      text += `Longest: **${s.longest} day${s.longest !== 1 ? "s" : ""}**\n\n`;
      if (s.current > 0) text += "Keep it going!";
      else text += "No active streak — log today to start one.";
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "plan": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet. Log some time first so I can learn your patterns.", type: "text" };
      }
      const planText = suggestDayPlan(context.worklogs, context.dailyTargetHours || 8);
      return { id, role: "assistant", content: planText, type: "text" };
    }

    case "trending": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const prevWorklogs = context.previousWeekWorklogs || [];
      if (prevWorklogs.length === 0) {
        return { id, role: "assistant", content: "No previous week data available. I need two weeks of data to detect trends.", type: "text" };
      }
      const trending = computeTrendingIssues(context.worklogs, prevWorklogs);
      if (trending.length === 0) {
        return { id, role: "assistant", content: "No trending issues detected — nothing is growing significantly week-over-week.", type: "text" };
      }
      let text = `**Trending Issues (gaining time):**\n\n`;
      trending.forEach((t, i) => {
        text += `${i + 1}. **${t.issueKey}** — ${t.currentHours.toFixed(1)}h this week (was ${t.previousHours.toFixed(1)}h, +${t.growth.toFixed(1)}h)\n`;
      });
      return { id, role: "assistant", content: text, type: "text" };
    }

    case "batch": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const targetDate = resolveDayReference(input, context.startDate, context.endDate);
      if (!targetDate) {
        return { id, role: "assistant", content: "I couldn't determine which day to copy. Try: \"copy Monday\", \"same as Tuesday\", or \"log yesterday\".", type: "text" };
      }
      const dayLogs = getWorklogsForDay(context.worklogs, targetDate);
      if (dayLogs.length === 0) {
        return { id, role: "assistant", content: `No worklogs found for ${targetDate}. That day appears to be empty.`, type: "text" };
      }
      const entries: NlpEntry[] = dayLogs.map(wl => ({
        issueKey: wl.issueKey,
        timeSpent: wl.timeSpent,
        comment: wl.comment || "Work logged",
      }));
      const content = `Found **${entries.length}** entr${entries.length > 1 ? "ies" : "y"} from ${targetDate}. Confirm to log them for today:`;
      return { id, role: "assistant", content, entries, type: "entries" };
    }

    case "reminder": {
      const time = parseTimeFromInput(input);
      if (!time) {
        return { id, role: "assistant", content: "I couldn't parse a time. Try: \"remind me at 5pm\" or \"remind me at 16:30\".", type: "text" };
      }
      const rule: Omit<AlertRule, "id"> = {
        name: `Reminder at ${time}`,
        type: "reminder",
        threshold: 0,
        time,
        enabled: true,
      };
      return {
        id,
        role: "assistant",
        content: `I'll set a reminder for **${time}** each weekday. This will send a notification if you haven't logged your hours by then.`,
        type: "text",
        action: { type: "add_rule", rule },
      };
    }

    case "export": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const standupText = formatStandup(context.worklogs, context.startDate, context.endDate);
      return { id, role: "assistant", content: standupText, type: "text" };
    }

    case "teamcompare": {
      if (context.worklogs.length === 0) {
        return { id, role: "assistant", content: "No data loaded yet.", type: "text" };
      }
      const prevWorklogs = context.previousWeekWorklogs || [];
      if (prevWorklogs.length === 0) {
        return { id, role: "assistant", content: "No previous week data available for team comparison.", type: "text" };
      }
      const teamText = formatTeamComparison(context.worklogs, prevWorklogs);
      return { id, role: "assistant", content: teamText, type: "text" };
    }

    case "log":
    default: {
      const result = parseNaturalLanguage(input);
      if (result.success && result.entries.length > 0) {
        let content = `I parsed **${result.entries.length}** time entr${result.entries.length > 1 ? "ies" : "y"}:`;
        if (result.error) {
          content += `\n\nNote: ${result.error}`;
        }
        return { id, role: "assistant", content, entries: result.entries, type: "entries" };
      }
      return { id, role: "assistant", content: result.error || "I couldn't understand that. Try typing something like '2h on PROJ-123 fixing a bug'.", type: "text" };
    }
  }
}
