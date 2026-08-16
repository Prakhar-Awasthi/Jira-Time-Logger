# Jira Bulk Time Logger

A Chrome Extension (Manifest V3) for logging time to Jira Cloud with analytics, peer comparison, AI-assisted entry, and team reporting — all from a full-page options UI.

---

## Features

### Dashboard (Analytics)
- **Time range picker** — switch between 4-week, 3-month, and 6-month views; all charts and tables update accordingly
- KPI cards: hours this week, avg/day, issues touched, streak — each with a sparkline trend vs the prior week
- **4 Weeks Ago comparison card** — appears when 3M or 6M view is selected, shows how the current week compares to the same week roughly one month prior
- Daily hours bar chart and weekly trend line
- Team breakdown donut chart
- Focus score, logging streak, consistency score, and day-of-week pattern histogram
- Weekly forecast vs your configured target
- Overtime heatmap (days over your daily target)
- **Burnout signal** — warns when 3 or more consecutive workdays exceed the daily target, computed over the full selected range
- Time distribution histogram
- Project momentum bars (week-over-week change per team)
- Fragmentation index (how spread-out your work is)
- Unlogged gap detection
- **Estimation accuracy** — Top Issues table shows the original estimate from Jira alongside your logged hours; over-estimate entries are highlighted in red
- **Peer Comparison** — ranked view of teammates on the same Jira project: bar chart, full metrics table (hours, avg/day, issues, focus score, days logged), and a contextual summary callout

### Log Time
- Single-entry form: issue key, time spent, optional comment, optional date
- Issue key autocomplete from recent worklogs

### Date Range
- Bulk-log time across a date range
- Paste multiple entries in `ISSUE_KEY:TIME:DESCRIPTION` format
- Export current results to CSV

### Weekly View
- Browse your worklogs week by week
- **Inline edit and delete** your own entries without leaving the page
- Export the current week's entries to CSV

### Team Report
- See all team members' time entries for a selected date range
- Filter by user or Jira project team
- Export to CSV

### AI Assistant
- Natural language time logging: `"2h on PROJ-123 fixing the login bug"`
- Time-word aliases: "half hour", "couple hours", "few hours", etc.
- Weekly summary, anomaly detection, gap analysis
- Template management for recurring entries

### Settings
- Jira URL, email, and API token (stored in `chrome.storage.local`)
- Daily and weekly hour targets
- Alert rules: minimum daily hours, weekly minimum, reminder notifications (powered by `chrome.alarms`)

### Content Script — Log Time From Jira
When you open any Jira issue page (`*.atlassian.net/browse/*`), a **Log Time** FAB button appears in the bottom-right corner. Clicking it opens a modal pre-filled with the issue key so you can log time without switching tabs. The modal handles Jira's SPA navigation between issues automatically.

### UX
- Dark / light theme toggle, persisted across sessions
- Error boundaries on every tab — if one tab crashes during render, only that tab shows a recovery UI; the rest of the extension stays functional
- Stale-while-revalidate data loading — cached data appears instantly on re-open and refreshes silently in the background

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Chrome Extension Manifest V3 |
| UI | React 18 + TypeScript |
| Build | Vite 4 |
| Tests | Vitest 1 |
| Styling | Vanilla CSS, CSS custom properties, no UI library |
| State | React Context (`JiraContext`) |
| Data | Jira Cloud REST API v3 (Basic Auth) |
| Storage | `chrome.storage.local` for credentials, cache, issue key map, sync cursor |
| Background | Service worker (`background.js`) for badge updates and alarm notifications |

---

## Installation

### From source

1. **Clone and install**

   ```bash
   git clone <repository-url>
   cd Jira-Time-Logger
   npm install
   ```

2. **Build**

   ```bash
   npm run build
   ```

   This produces a `dist/` folder containing the extension.

3. **Load in Chrome**

   - Open `chrome://extensions`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked** and select the `dist/` folder

4. **Open the extension**

   - Click the puzzle-piece icon in Chrome's toolbar
   - Click **Jira Bulk Time Logger** → it opens as a full tab

5. **Configure credentials**

   - Click the gear icon (Settings) in the sidebar
   - Enter your Jira Cloud URL (e.g. `https://yourorg.atlassian.net`)
   - Enter your Atlassian email address
   - Enter your [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## Development

```bash
npm run dev        # start Vite dev server (http://localhost:5173)
npm run build      # production build → dist/
npm run preview    # preview the production build locally
npm run test       # run tests in watch mode
npm run test:run   # run tests once (CI)
```

> **Note:** The Chrome Extension APIs (`chrome.storage`, `chrome.alarms`, etc.) are only available when the app is loaded as an extension. In `npm run dev` mode, the app still renders but storage calls fall back gracefully.

---

## Tests

74 unit tests across 4 files, run with Vitest.

| File | Coverage |
|---|---|
| `insights.test.ts` | Burnout streak logic, overtime heatmap, top issues ranking, focus score, logging streak (weekend bridging), consistency score |
| `nlp-parser.test.ts` | All 8 time-word aliases, decimal-to-h+m conversion, combined `1h 30m`, multi-entry (comma/newline), all error paths, filler-word stripping |
| `parser.test.ts` | Happy path, colon-in-comment preservation, whitespace trimming, all five throw conditions |
| `jira-cache.test.ts` | Raw response mapping, email filtering, Layer 1 cache hit, separate cache keys per date range, `invalidateWorklogCache` re-fetch, Layer 3 inflight dedup (single network round-trip for concurrent calls), `onStaleData` with stale/fresh persistent cache |

---

## Project Structure

```
src/
├── app/
│   ├── app.tsx            # Root component, tab router, error boundaries
│   └── app.css            # All styles and CSS custom property tokens
├── components/
│   ├── ErrorBoundary.tsx  # Class-component error boundary (wraps each tab)
│   ├── Sidebar.tsx        # Nav sidebar with tab icons and theme toggle
│   ├── LogTimeTab.tsx     # Single-entry time logging form
│   ├── DateRangeTab.tsx   # Bulk / date-range logging with CSV export
│   ├── WeeklyTab.tsx      # Week-by-week worklog browser with inline edit/delete and CSV export
│   ├── TeamReportTab.tsx  # Team member time report with CSV export
│   ├── AnalyticsTab.tsx   # Dashboard: KPIs, charts, peer comparison, burnout signal
│   ├── AiAssistantTab.tsx # NL time logging + AI chat interface
│   ├── SettingsPanel.tsx  # Credentials, targets, alert rules
│   ├── FilterControls.tsx # Shared date/user/team filters
│   ├── IssueAutocomplete.tsx
│   ├── WorklogCard.tsx    # Worklog entry card with hover edit/delete
│   ├── ParsedEntryCard.tsx
│   ├── ChatMessage.tsx
│   └── Templates.tsx
├── context/
│   └── JiraContext.tsx    # Global auth state, theme, users/teams lists
├── hooks/
│   ├── useWorklogs.ts        # Date-range worklog fetch with stale-while-revalidate
│   ├── useAnalytics.ts       # Multi-week analytics: burnout, estimates, comparisons
│   ├── usePeerComparison.ts  # Team peer ranking from shared worklog cache
│   ├── useSettings.ts        # chrome.storage-backed settings
│   ├── useIssueSearch.ts     # Issue key autocomplete
│   └── useTemplates.ts       # Saved entry templates
├── utils/
│   ├── jira.ts            # Jira REST API client, 4-layer cache, incremental sync
│   ├── charts.ts          # Hand-coded SVG chart renderers (no chart library)
│   ├── insights.ts        # Focus score, streak, burnout signal, consistency, forecast, gaps
│   ├── parser.ts          # ISSUE_KEY:TIME:DESC bulk input parser
│   ├── nlp-parser.ts      # Natural language time entry parser
│   ├── csv.ts             # CSV export utilities
│   ├── alert-rules.ts     # Alert rule types and evaluation
│   └── helpers.ts         # Date utilities
│   └── __tests__/         # Vitest unit tests
├── services/
│   └── ai-service.ts      # Rule-based AI assistant (keyword matching + insights)
├── popup/
│   └── popup.tsx          # Minimal popup that redirects to the options page
└── main.tsx               # Entry point

public/
├── manifest.json          # MV3 manifest — permissions, content script registration
├── content.js             # Content script: Log Time FAB on *.atlassian.net/browse/*
└── background.js          # Service worker: badge, alarms, notifications
```

---

## Data Fetching & Caching

The extension uses a 4-layer cache in `src/utils/jira.ts` to minimize latency:

| Layer | Scope | TTL | Behaviour |
|---|---|---|---|
| In-memory Map | Page session | 5 min | Synchronous, zero-cost |
| `chrome.storage.local` | Across reloads | 10 min | Returns immediately; warms in-memory cache |
| Stale-while-revalidate | Expired storage | — | Shows old data instantly; fetches fresh in background |
| In-flight dedup | Concurrent hooks | — | Two hooks with the same date range share one fetch |

### Incremental sync

After each full fetch the response's `until` cursor is stored in `chrome.storage.local` (`wlCursor_*` prefix). On the next background refresh, instead of re-fetching from `rangeStart`, the client calls `/worklog/updated?since=cursor` to get only worklog IDs created or modified since the last sync, fetches their details, and merges the delta into the cached data. This makes background refreshes significantly faster for large teams. Cursors older than 24 hours are discarded and a full fetch runs instead.

On first open with a cold cache the Jira API typically takes 3–6 seconds. After that:
- **Re-open within 10 min:** instant (in-memory or persistent cache)
- **Re-open after 10 min:** stale data visible in < 100 ms; incremental delta fetched in the background

---

## Jira API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /rest/api/3/worklog/updated?since=` | Paginated list of worklog IDs updated since a timestamp (also used for incremental sync cursor) |
| `POST /rest/api/3/worklog/list` | Batch-fetch worklog details by ID (up to 1 000 per request) |
| `POST /rest/api/3/search/jql` | Resolve issue IDs → keys; also fetches `timeoriginalestimate` + `timespent` for estimation accuracy |
| `POST /rest/api/3/issue/{key}/worklog` | Submit a new worklog entry |
| `PUT /rest/api/3/issue/{key}/worklog/{id}` | Edit an existing worklog entry |
| `DELETE /rest/api/3/issue/{key}/worklog/{id}` | Delete a worklog entry |

---

## Input Format (Bulk Logging)

The Date Range tab and AI Assistant both accept this shorthand:

```
ISSUE_KEY:TIME_SPENT:DESCRIPTION
```

Examples:

```
PROJ-123:2h:Implemented new feature
PROJ-124:1h30m:Fixed login bug
PROJ-125:45m:Code review
```

The AI Assistant also accepts natural language across a single entry or a comma/newline-separated list:

```
2h on PROJ-123 fixing the login bug, PROJ-124 half hour standup
```

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist credentials, settings, worklog cache, issue key map, sync cursor |
| `alarms` | Schedule daily/weekly reminder notifications |
| `notifications` | Surface alert rule notifications |
| `https://*.atlassian.net/*` | Make authenticated requests to Jira Cloud and inject the Log Time content script on issue pages |

---

## License

MIT License

Copyright (c) 2026 Prakhar Awasthi

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
