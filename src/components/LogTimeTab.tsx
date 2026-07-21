import { useState, useRef } from "react";
import { useJira } from "../context/JiraContext";
import { parseInput } from "../utils/parser";
import { logWork, formatJiraStarted } from "../utils/jira";
import { IssueAutocomplete } from "./IssueAutocomplete";
import { Templates } from "./Templates";

interface LogProgress {
  total: number;
  completed: number;
  failed: string[];
}

export function LogTimeTab() {
  const { jiraUrl, email, token, setJiraUrl, setEmail, setToken, loading, setLoading, result, setResult, saveCredentials, credentialsReady } = useJira();
  const [logDate, setLogDate] = useState("");
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState<LogProgress | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleLog() {
    try {
      setLoading(true);
      if (!logDate) {
        throw new Error("Please select a log date");
      }
      const entries = parseInput(input);
      const prog: LogProgress = { total: entries.length, completed: 0, failed: [] };
      setProgress(prog);
      setResult("");

      for (const e of entries) {
        try {
          const started = formatJiraStarted(logDate);
          await logWork(jiraUrl, email, token, e.issueKey, e.timeSpent, e.comment, started);
          prog.completed++;
        } catch (err: any) {
          prog.failed.push(`${e.issueKey}: ${err.message}`);
        }
        setProgress({ ...prog });
      }

      if (prog.failed.length === 0) {
        setResult(`All ${prog.total} entries logged successfully`);
        setInput("");
      } else {
        setResult(`${prog.completed}/${prog.total} logged. Failed: ${prog.failed.length}`);
      }
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(null), 3000);
    }
  }

  const handleAutocompleteSelect = (newText: string) => {
    setInput(newText);
  };

  return (
    <div className="log-section">
      <div className="credentials-section">
        <h2>Configuration</h2>
        <div className="input-group">
          <label>Jira URL</label>
          <input
            type="text"
            placeholder="https://yourorg.atlassian.net"
            value={jiraUrl}
            onChange={e => setJiraUrl(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="your.email@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label>API Token</label>
          <input
            type="password"
            placeholder="Your Jira API token"
            value={token}
            onChange={e => setToken(e.target.value)}
          />
        </div>
        <button className="btn-secondary" onClick={saveCredentials}>
          Save Credentials
        </button>
      </div>

      <div className="log-time-section">
        <h2>Log Time</h2>
        <div className={`input-group ${!logDate ? "is-invalid" : ""}`}>
          <label>Log Date (required)</label>
          <input
            type="date"
            value={logDate}
            onChange={e => setLogDate(e.target.value)}
          />
        </div>

        <Templates currentInput={input} onInsert={(text) => setInput(text)} />

        <div className="input-group textarea-with-autocomplete">
          <label>Time Entries (one per line)</label>
          <textarea
            ref={textareaRef}
            rows={8}
            placeholder={"TASK-123: 2h: Implemented feature\nTASK-456: 1.5h: Bug fix\nTASK-789: 30m: Code review"}
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <IssueAutocomplete
            input={input}
            textareaRef={textareaRef as React.RefObject<HTMLTextAreaElement>}
            onSelect={handleAutocompleteSelect}
          />
        </div>

        {progress && (
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${((progress.completed + progress.failed.length) / progress.total) * 100}%` }}
              />
            </div>
            <div className="progress-text">
              {progress.completed + progress.failed.length}/{progress.total} processed
              {progress.failed.length > 0 && <span className="progress-failures"> ({progress.failed.length} failed)</span>}
            </div>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleLog}
          disabled={loading || !credentialsReady || !logDate}
        >
          {loading ? `Logging${progress ? ` (${progress.completed + progress.failed.length}/${progress.total})` : "..."}` : "Log Time"}
        </button>
      </div>

      {result && (
        <div className={`result ${result.startsWith("Error") || result.includes("Failed") ? "error" : "success"}`}>
          {result}
          {progress && progress.failed.length > 0 && (
            <div className="failed-entries">
              {progress.failed.map((f, i) => <div key={i} className="failed-entry">{f}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
