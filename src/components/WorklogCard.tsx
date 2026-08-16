import { useState } from "react";
import { useJira } from "../context/JiraContext";
import { Worklog, updateWorklog, deleteWorklog } from "../utils/jira";

interface WorklogCardProps {
  worklog: Worklog;
  currentUserEmail?: string;
  onUpdated?: () => void;
}

export function WorklogCard({ worklog, currentUserEmail, onUpdated }: WorklogCardProps) {
  const { jiraUrl, email, token } = useJira();
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [editTime, setEditTime] = useState(worklog.timeSpent);
  const [editComment, setEditComment] = useState(worklog.comment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isOwn = !!currentUserEmail && worklog.authorEmail === currentUserEmail;

  async function handleSave() {
    if (!editTime.trim()) { setError("Time is required"); return; }
    setSaving(true);
    setError("");
    try {
      await updateWorklog(jiraUrl, email, token, worklog.issueKey, worklog.id, editTime.trim(), editComment.trim());
      setMode("view");
      onUpdated?.();
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  function handleEditCancel() {
    setEditTime(worklog.timeSpent);
    setEditComment(worklog.comment);
    setError("");
    setMode("view");
  }

  async function handleDelete() {
    setSaving(true);
    setError("");
    try {
      await deleteWorklog(jiraUrl, email, token, worklog.issueKey, worklog.id);
      onUpdated?.();
    } catch (err: any) {
      setError(err.message || "Delete failed");
      setSaving(false);
      setMode("view");
    }
  }

  if (mode === "edit") {
    return (
      <div className="worklog-card worklog-card--editing">
        <div className="worklog-edit-header">
          <span className="worklog-issue">{worklog.issueKey}</span>
        </div>
        <input
          className="worklog-edit-time"
          value={editTime}
          onChange={(e) => setEditTime(e.target.value)}
          placeholder="e.g. 2h, 1h 30m, 45m"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleEditCancel(); }}
        />
        <textarea
          className="worklog-edit-comment"
          value={editComment}
          onChange={(e) => setEditComment(e.target.value)}
          placeholder="Comment (optional)"
          rows={2}
        />
        {error && <div className="worklog-edit-error">{error}</div>}
        <div className="worklog-edit-actions">
          <button className="worklog-btn worklog-btn--save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="worklog-btn worklog-btn--cancel" onClick={handleEditCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "confirm-delete") {
    return (
      <div className="worklog-card worklog-card--deleting">
        <div className="worklog-delete-prompt">
          Delete <strong>{worklog.timeSpent}</strong> on {worklog.issueKey}?
        </div>
        {error && <div className="worklog-edit-error">{error}</div>}
        <div className="worklog-edit-actions">
          <button className="worklog-btn worklog-btn--delete-confirm" onClick={handleDelete} disabled={saving}>
            {saving ? "Deleting…" : "Delete"}
          </button>
          <button
            className="worklog-btn worklog-btn--cancel"
            onClick={() => { setError(""); setMode("view"); }}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="worklog-card">
      <div className="worklog-card-main">
        <div className="worklog-card-content">
          <div className="worklog-issue">{worklog.issueKey}</div>
          <div className="worklog-time">{worklog.timeSpent}</div>
          {worklog.comment && <div className="worklog-comment">{worklog.comment}</div>}
        </div>
        {isOwn && (
          <div className="worklog-actions">
            <button
              className="worklog-action-btn"
              onClick={() => setMode("edit")}
              title="Edit"
              aria-label="Edit worklog"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className="worklog-action-btn worklog-action-btn--danger"
              onClick={() => setMode("confirm-delete")}
              title="Delete"
              aria-label="Delete worklog"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
