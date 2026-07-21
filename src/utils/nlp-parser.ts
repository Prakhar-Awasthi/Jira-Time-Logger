export interface NlpEntry {
  issueKey: string;
  timeSpent: string;
  comment: string;
}

export interface NlpResult {
  success: boolean;
  entries: NlpEntry[];
  error?: string;
}

const TIME_WORD_MAP: { [key: string]: string } = {
  "half hour": "30m",
  "half an hour": "30m",
  "an hour": "1h",
  "one hour": "1h",
  "couple hours": "2h",
  "couple of hours": "2h",
  "few hours": "3h",
  "quarter hour": "15m",
  "quarter of an hour": "15m",
};

const ISSUE_KEY_PATTERN = /[A-Z][A-Z0-9]+-\d+/;
const TIME_PATTERN = /(\d+\.?\d*)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/i;
const TIME_COMBINED_PATTERN = /(\d+\.?\d*)\s*(h|hr|hrs|hour|hours)\s*(\d+\.?\d*)?\s*(m|min|mins|minute|minutes)?/i;

function normalizeTime(value: string, unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith("h")) {
    const num = parseFloat(value);
    if (num % 1 !== 0) {
      const hours = Math.floor(num);
      const mins = Math.round((num % 1) * 60);
      if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
      if (hours > 0) return `${hours}h`;
      return `${mins}m`;
    }
    return `${value}h`;
  }
  return `${value}m`;
}

function extractTime(text: string): { timeSpent: string; remaining: string } | null {
  for (const [phrase, time] of Object.entries(TIME_WORD_MAP)) {
    if (text.toLowerCase().includes(phrase)) {
      return { timeSpent: time, remaining: text.replace(new RegExp(phrase, "i"), "").trim() };
    }
  }

  const combinedMatch = text.match(TIME_COMBINED_PATTERN);
  if (combinedMatch) {
    const hours = combinedMatch[1];
    const mins = combinedMatch[3];
    let timeSpent = normalizeTime(hours, combinedMatch[2]);
    if (mins && combinedMatch[4]) {
      timeSpent = `${hours}h ${mins}m`;
    }
    return { timeSpent, remaining: text.replace(combinedMatch[0], "").trim() };
  }

  const simpleMatch = text.match(TIME_PATTERN);
  if (simpleMatch) {
    const timeSpent = normalizeTime(simpleMatch[1], simpleMatch[2]);
    return { timeSpent, remaining: text.replace(simpleMatch[0], "").trim() };
  }

  return null;
}

function extractIssueKey(text: string): { issueKey: string; remaining: string } | null {
  const match = text.match(ISSUE_KEY_PATTERN);
  if (match) {
    return { issueKey: match[0], remaining: text.replace(match[0], "").trim() };
  }
  return null;
}

function cleanComment(text: string): string {
  return text
    .replace(/^[\s:,\-–—]+/, "")
    .replace(/[\s:,\-–—]+$/, "")
    .replace(/\b(on|for|doing|working on|spent|worked|spent on)\b\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSingleEntry(text: string): NlpEntry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const issueResult = extractIssueKey(trimmed);
  const timeResult = extractTime(trimmed);

  if (!issueResult || !timeResult) return null;

  let comment = trimmed;
  comment = comment.replace(ISSUE_KEY_PATTERN, "");
  comment = comment.replace(TIME_COMBINED_PATTERN, "");
  if (comment === trimmed.replace(ISSUE_KEY_PATTERN, "")) {
    comment = comment.replace(TIME_PATTERN, "");
  }
  for (const phrase of Object.keys(TIME_WORD_MAP)) {
    comment = comment.replace(new RegExp(phrase, "i"), "");
  }
  comment = cleanComment(comment);

  if (!comment) {
    comment = "Work logged";
  }

  return {
    issueKey: issueResult.issueKey,
    timeSpent: timeResult.timeSpent,
    comment,
  };
}

export function parseNaturalLanguage(input: string): NlpResult {
  const text = input.trim();
  if (!text) {
    return { success: false, entries: [], error: "Please enter some text to parse." };
  }

  const segments = text
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean);

  if (segments.length === 1 && !ISSUE_KEY_PATTERN.test(text) && !TIME_PATTERN.test(text)) {
    return { success: false, entries: [], error: "I couldn't find an issue key or time duration. Try: '2h on PROJ-123 fixing the bug'" };
  }

  const entries: NlpEntry[] = [];
  const unparsed: string[] = [];

  for (const segment of segments) {
    const entry = parseSingleEntry(segment);
    if (entry) {
      entries.push(entry);
    } else {
      unparsed.push(segment);
    }
  }

  if (entries.length === 0) {
    return {
      success: false,
      entries: [],
      error: `Couldn't parse your input. Make sure each entry has an issue key (like PROJ-123) and a time (like 2h or 30m).\n\nExamples:\n• "2h on PROJ-123 fixing the login bug"\n• "PROJ-456 30m code review, PROJ-789 1h feature work"`,
    };
  }

  if (unparsed.length > 0) {
    return {
      success: true,
      entries,
      error: `Parsed ${entries.length} entries. Couldn't parse: "${unparsed.join('", "')}"`,
    };
  }

  return { success: true, entries };
}
