import { Worklog } from "../utils/jira";
import { NlpEntry, NlpResult, parseNaturalLanguage } from "../utils/nlp-parser";
import { generateWeeklySummary, formatSummaryAsText, detectAnomalies, suggestMissingDays } from "../utils/insights";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  entries?: NlpEntry[];
  type?: "text" | "entries" | "summary" | "anomalies";
}

export interface AiServiceContext {
  recentIssues: string[];
  worklogs: Worklog[];
  startDate: string;
  endDate: string;
}

function detectIntent(input: string): "log" | "summary" | "anomaly" | "missing" | "help" {
  const lower = input.toLowerCase();
  if (lower.includes("summar") || lower.includes("breakdown") || lower.includes("how much") || lower.includes("total")) {
    return "summary";
  }
  if (lower.includes("anomal") || lower.includes("duplicate") || lower.includes("check") || lower.includes("wrong") || lower.includes("issue")) {
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
        `**Get insights** — Try:\n• "Summarize this week"\n• "Check for anomalies"\n• "What am I missing?"\n\n` +
        `Or use the quick actions below!`;
      return { id, role: "assistant", content: text, type: "text" };
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
