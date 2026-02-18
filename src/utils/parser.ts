export interface WorklogInput {
  issueKey: string;
  timeSpent: string;
  comment: string;
}

export function parseInput(text: string): WorklogInput[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [issue, time, ...desc] = line.split(":");
      if (!issue || !time || desc.length === 0) {
        throw new Error(`Invalid format: ${line}`);
      }
      const comment = desc.join(":").trim();
      if (!comment) {
        throw new Error(`Missing description: ${line}`);
      }
      return {
        issueKey: issue.trim(),
        timeSpent: time.trim(),
        comment
      };
    });
}