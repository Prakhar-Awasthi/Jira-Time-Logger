import { useState } from "react";
import { parseInput } from "../utils/parser";
import { logWork } from "../utils/jira";

export default function Popup() {
  const [jiraUrl, setJiraUrl] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");

  async function handleLog() {
    try {
      const entries = parseInput(input);
      for (const e of entries) {
        await logWork(
          jiraUrl,
          email,
          token,
          e.issueKey,
          e.timeSpent,
          e.comment
        );
      }
      setResult("✅ Time logged successfully");
    } catch (err: any) {
      setResult(`❌ ${err.message}`);
    }
  }

  return (
    <div className="container">
      <h3>Jira Bulk Logger</h3>

      <input
        placeholder="https://org.atlassian.net"
        onChange={e => setJiraUrl(e.target.value)}
      />

      <input
        placeholder="Email"
        onChange={e => setEmail(e.target.value)}
      />

      <input
        placeholder="API Token"
        type="password"
        onChange={e => setToken(e.target.value)}
      />

      <textarea
        rows={6}
        placeholder="TASK-123: 2h: Description&#10;TASK-456: 1h: Another task"
        onChange={e => setInput(e.target.value)}
      />

      <button onClick={handleLog}>Log Time</button>
      <p>{result}</p>
    </div>
  );
}
