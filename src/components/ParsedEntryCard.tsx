import { NlpEntry } from "../utils/nlp-parser";

interface ParsedEntryCardProps {
  entries: NlpEntry[];
  onLogEntry: (entry: NlpEntry) => void;
  onLogAll: () => void;
  logging: boolean;
}

export function ParsedEntryCard({ entries, onLogEntry, onLogAll, logging }: ParsedEntryCardProps) {
  return (
    <div className="parsed-entries-card">
      {entries.map((entry, idx) => (
        <div key={idx} className="parsed-entry">
          <div className="parsed-entry-info">
            <span className="parsed-entry-key">{entry.issueKey}</span>
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
