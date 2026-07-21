import { useState, useRef, useEffect } from "react";
import { useJira } from "../context/JiraContext";
import { ChatMessage, processMessage, AiServiceContext } from "../services/ai-service";
import { ChatMessageBubble } from "./ChatMessage";
import { ParsedEntryCard } from "./ParsedEntryCard";
import { NlpEntry } from "../utils/nlp-parser";
import { logWork, formatJiraStarted, fetchWorklogs, Worklog } from "../utils/jira";
import { getTodayString, getWeekEndingSaturdayString } from "../utils/helpers";

export function AiAssistantTab() {
  const { jiraUrl, email, token, credentialsReady } = useJira();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "**Hi! I'm your time logging assistant.**\n\nYou can tell me what you worked on in natural language, and I'll help you log it. Try:\n\n- \"2h on PROJ-123 fixing the login bug\"\n- \"Summarize this week\"\n- \"Check for anomalies\"\n\nOr use the quick actions below.",
      type: "text",
    },
  ]);
  const [input, setInput] = useState("");
  const [logging, setLogging] = useState(false);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!credentialsReady) return;
    const loadContext = async () => {
      try {
        const today = getTodayString();
        const weekEnd = getWeekEndingSaturdayString();
        const anchor = new Date(`${weekEnd}T00:00:00`);
        const start = new Date(anchor);
        const day = start.getDay();
        start.setDate(start.getDate() - ((day + 6) % 7));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const logs = await fetchWorklogs(jiraUrl, email, token, start, end);
        setWorklogs(logs);
      } catch {}
    };
    loadContext();
  }, [credentialsReady, jiraUrl, email, token]);

  const getContext = (): AiServiceContext => {
    const issueKeys = [...new Set(worklogs.map(wl => wl.issueKey))];
    const weekEnd = getWeekEndingSaturdayString();
    const anchor = new Date(`${weekEnd}T00:00:00`);
    const start = new Date(anchor);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { recentIssues: issueKeys, worklogs, startDate: fmt(start), endDate: fmt(end) };
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = { id: Date.now().toString(36), role: "user", content: trimmed, type: "text" };
    const response = processMessage(trimmed, getContext());

    setMessages(prev => [...prev, userMsg, response]);
    setInput("");
  };

  const handleQuickAction = (action: string) => {
    const userMsg: ChatMessage = { id: Date.now().toString(36), role: "user", content: action, type: "text" };
    const response = processMessage(action, getContext());
    setMessages(prev => [...prev, userMsg, response]);
  };

  const handleLogEntry = async (entry: NlpEntry) => {
    if (!credentialsReady) return;
    setLogging(true);
    try {
      const started = formatJiraStarted(getTodayString());
      await logWork(jiraUrl, email, token, entry.issueKey, entry.timeSpent, entry.comment, started);
      const successMsg: ChatMessage = {
        id: Date.now().toString(36),
        role: "assistant",
        content: `Logged ${entry.timeSpent} on ${entry.issueKey}`,
        type: "text",
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: Date.now().toString(36),
        role: "assistant",
        content: `Failed to log ${entry.issueKey}: ${err.message}`,
        type: "text",
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLogging(false);
    }
  };

  const handleLogAll = async (entries: NlpEntry[]) => {
    if (!credentialsReady) return;
    setLogging(true);
    let succeeded = 0;
    const failures: string[] = [];
    for (const entry of entries) {
      try {
        const started = formatJiraStarted(getTodayString());
        await logWork(jiraUrl, email, token, entry.issueKey, entry.timeSpent, entry.comment, started);
        succeeded++;
      } catch (err: any) {
        failures.push(`${entry.issueKey}: ${err.message}`);
      }
    }
    const msg: ChatMessage = {
      id: Date.now().toString(36),
      role: "assistant",
      content: failures.length === 0
        ? `All ${succeeded} entries logged successfully.`
        : `${succeeded}/${entries.length} logged. Failures:\n${failures.map(f => `- ${f}`).join("\n")}`,
      type: "text",
    };
    setMessages(prev => [...prev, msg]);
    setLogging(false);
  };

  return (
    <div className="ai-assistant-section">
      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id}>
              <ChatMessageBubble message={msg} />
              {msg.entries && msg.entries.length > 0 && (
                <ParsedEntryCard
                  entries={msg.entries}
                  onLogEntry={handleLogEntry}
                  onLogAll={() => handleLogAll(msg.entries!)}
                  logging={logging}
                />
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-quick-actions">
          <button className="quick-action-btn" onClick={() => handleQuickAction("Summarize this week")}>
            Summarize week
          </button>
          <button className="quick-action-btn" onClick={() => handleQuickAction("Check for anomalies")}>
            Check anomalies
          </button>
          <button className="quick-action-btn" onClick={() => handleQuickAction("What am I missing?")}>
            Missing days
          </button>
          <button className="quick-action-btn" onClick={() => handleQuickAction("Help")}>
            Help
          </button>
        </div>

        <div className="chat-input-area">
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type naturally: '2h on PROJ-123 fixing login'..."
            disabled={!credentialsReady}
          />
          <button className="chat-send-btn" onClick={handleSend} disabled={!input.trim() || !credentialsReady}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
