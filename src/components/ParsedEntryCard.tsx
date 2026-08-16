import { NlpEntry } from "../utils/nlp-parser";

interface ParsedEntryCardProps {
  entries: NlpEntry[];
  onLogEntry: (entry: NlpEntry) => void;
  onLogAll: () => void;
  logging: boolean;
}

function colorIndexFor(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return (hash % 5) + 1;
}

export function ParsedEntryCard({ entries, onLogEntry, onLogAll, logging }: ParsedEntryCardProps) {
  return (
    <div className="parsed-entries-card">
      {entries.map((entry, idx) => (
        <div key={idx} className="parsed-entry">
          <div className="parsed-entry-info">
            <span className={`issue-pill pill-color-${colorIndexFor(entry.issueKey)}`}>{entry.issueKey}</span>
            <span className="parsed-entry-time">{entry.timeSpent}</span>
            <span className="parsed-entry-comment">{entry.comment}</span>
          </div>
          <button
            className="parsed-entry-log-btn"
            onClick={() => onLogEntry(entry)}
            disabled={logging}
          >
            Log
          </button>
        </div>
      ))}
      {entries.length > 1 && (
        <button className="btn-primary parsed-log-all" onClick={onLogAll} disabled={logging}>
          {logging ? "Logging..." : `Log all ${entries.length} entries`}
        </button>
      )}
    </div>
  );
}
