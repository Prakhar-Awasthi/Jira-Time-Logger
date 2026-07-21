import { Worklog } from "../utils/jira";

export function WorklogCard({ worklog }: { worklog: Worklog }) {
  return (
    <div className="worklog-card">
      <div className="worklog-issue">{worklog.issueKey}</div>
      <div className="worklog-time">{worklog.timeSpent}</div>
      {worklog.comment && <div className="worklog-comment">{worklog.comment}</div>}
    </div>
  );
}
