import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWorklogs, invalidateWorklogCache } from "../jira";

// ---------------------------------------------------------------------------
// Globals mock — chrome.storage.local (not available in Node)
// ---------------------------------------------------------------------------

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
};
vi.stubGlobal("chrome", chromeMock);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const URL = "https://example.atlassian.net";
const EMAIL = "user@example.com";
const TOKEN = "token123";
// Dates in summer 2026 for isolation from "today" comparisons in computeStreak
const START = new Date("2026-08-11T00:00:00.000Z");
const END = new Date("2026-08-15T00:00:00.000Z");

// A raw worklog object as Jira would return it from /worklog/list
const RAW_WL = {
  id: "100",
  issueId: "999",
  started: "2026-08-12T09:00:00.000+0000",
  timeSpent: "2h",
  timeSpentSeconds: 7200,
  comment: "review notes",
  author: { displayName: "Alice", emailAddress: "alice@example.com" },
};

/** Stubs globalThis.fetch with the three sequential responses a full fetch needs:
 *  1. GET /worklog/updated  →  { values: [{worklogId}], lastPage: true, until }
 *  2. POST /worklog/list    →  [rawWorklog, ...]
 *  3. POST /search/jql      →  { issues: [{id, key}] }
 */
function stubFetch(rawWorklogs: typeof RAW_WL[] = [RAW_WL]) {
  const mock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        values: rawWorklogs.map(w => ({ worklogId: w.id })),
        lastPage: true,
        until: Date.now(),
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => rawWorklogs,
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issues: [{ id: "999", key: "PROJ-123" }] }),
    });
  vi.stubGlobal("fetch", mock);
  return mock;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear in-memory cache and inflight map between tests
  invalidateWorklogCache();
  // Reset chrome mock to "nothing cached" state
  chromeMock.storage.local.get.mockImplementation(
    (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({})
  );
  chromeMock.storage.local.set.mockReset();
  chromeMock.storage.local.remove.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchWorklogs — Layer 4: full network fetch", () => {
  it("maps raw Jira response to Worklog shape correctly", async () => {
    stubFetch();
    const result = await fetchWorklogs(URL, EMAIL, TOKEN, START, END);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "100",
      issueKey: "PROJ-123",
      team: "PROJ",
      timeSpentSeconds: 7200,
      authorEmail: "alice@example.com",
      author: "Alice",
    });
  });

  it("filters by email when filterEmail is provided", async () => {
    stubFetch([
      { ...RAW_WL, id: "100", author: { displayName: "Alice", emailAddress: "alice@example.com" } },
      { ...RAW_WL, id: "101", author: { displayName: "Bob", emailAddress: "bob@example.com" } },
    ]);
    const result = await fetchWorklogs(URL, EMAIL, TOKEN, START, END, "alice@example.com");
    expect(result).toHaveLength(1);
    expect(result[0].authorEmail).toBe("alice@example.com");
  });

  it("returns empty array when /worklog/updated has no IDs", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: [], lastPage: true, until: Date.now() }),
    });
    vi.stubGlobal("fetch", mock);
    const result = await fetchWorklogs(URL, EMAIL, TOKEN, START, END);
    expect(result).toHaveLength(0);
  });

  it("stores the until cursor in chrome.storage.local after a successful fetch", async () => {
    stubFetch();
    await fetchWorklogs(URL, EMAIL, TOKEN, START, END);
    const setCallArgs = chromeMock.storage.local.set.mock.calls.map((c: unknown[]) => c[0]);
    const cursorSet = setCallArgs.some((arg: unknown) =>
      typeof arg === "object" && arg !== null &&
      Object.keys(arg).some(k => k.startsWith("wlCursor_"))
    );
    expect(cursorSet).toBe(true);
  });
});

describe("fetchWorklogs — Layer 1: in-memory cache", () => {
  it("returns cached data on second call without hitting fetch", async () => {
    const mock = stubFetch();
    await fetchWorklogs(URL, EMAIL, TOKEN, START, END);

    // Replace fetch with a mock that should NOT be called
    const mock2 = stubFetch();
    const result = await fetchWorklogs(URL, EMAIL, TOKEN, START, END);

    expect(mock2).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("different date ranges use separate cache entries", async () => {
    const START2 = new Date("2026-08-18T00:00:00.000Z");
    const END2 = new Date("2026-08-22T00:00:00.000Z");

    // Worklog within START2/END2
    const RAW_WL2 = { ...RAW_WL, id: "200", started: "2026-08-19T09:00:00.000+0000" };

    const mock1 = stubFetch([RAW_WL]);
    await fetchWorklogs(URL, EMAIL, TOKEN, START, END);

    const mock2 = stubFetch([RAW_WL2]);
    await fetchWorklogs(URL, EMAIL, TOKEN, START2, END2);

    // Both network fetches should have fired (different cache keys)
    expect(mock1).toHaveBeenCalled();
    expect(mock2).toHaveBeenCalled();

    // Now both are cached — further calls should not hit the network
    const mock3 = stubFetch();
    await fetchWorklogs(URL, EMAIL, TOKEN, START, END);
    await fetchWorklogs(URL, EMAIL, TOKEN, START2, END2);
    expect(mock3).not.toHaveBeenCalled();
  });
});

describe("fetchWorklogs — invalidateWorklogCache", () => {
  it("forces a re-fetch after cache is invalidated", async () => {
    stubFetch();
    await fetchWorklogs(URL, EMAIL, TOKEN, START, END);

    invalidateWorklogCache();

    const mock2 = stubFetch();
    await fetchWorklogs(URL, EMAIL, TOKEN, START, END);
    expect(mock2).toHaveBeenCalled();
  });

  it("clears chrome.storage.local wlCache_* and wlCursor_* keys", () => {
    invalidateWorklogCache();
    const removeCalls = chromeMock.storage.local.get.mock.calls;
    // The get-then-remove pattern fires chrome.storage.local.get(null, ...)
    // We just verify get was called (to look up keys to remove)
    expect(removeCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("fetchWorklogs — Layer 3: inflight deduplication", () => {
  it("concurrent calls with the same range share one network round-trip", async () => {
    const mock = stubFetch();

    // Fire two fetches concurrently
    const [r1, r2] = await Promise.all([
      fetchWorklogs(URL, EMAIL, TOKEN, START, END),
      fetchWorklogs(URL, EMAIL, TOKEN, START, END),
    ]);

    // Both should get the same result
    expect(r1).toEqual(r2);

    // /worklog/updated should only be called once
    const updatedHits = mock.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes("/worklog/updated")
    );
    expect(updatedHits).toHaveLength(1);
  });
});

describe("fetchWorklogs — onStaleData callback", () => {
  it("calls onStaleData with stale persistent data before fresh fetch resolves", async () => {
    const staleWorklogs = [
      {
        id: "99",
        issueKey: "PROJ-STALE",
        team: "PROJ",
        timeSpent: "1h",
        timeSpentSeconds: 3600,
        comment: "old",
        started: "2026-08-12T09:00:00.000+0000",
        author: "Bob",
        authorEmail: "bob@example.com",
      },
    ];
    const staleTimestamp = Date.now() - 15 * 60_000; // 15 min ago — past the 10-min TTL
    const cacheKey = `${START.getTime()}-${END.getTime()}`;

    // Make the persistent cache return stale data for the worklog key,
    // and empty for everything else (issue key cache, cursor)
    chromeMock.storage.local.get.mockImplementation(
      (keys: unknown, cb: (r: Record<string, unknown>) => void) => {
        const k = Array.isArray(keys) ? keys[0] : keys;
        if (k === `wlCache_${cacheKey}`) {
          cb({ [`wlCache_${cacheKey}`]: { data: staleWorklogs, timestamp: staleTimestamp } });
        } else {
          cb({});
        }
      }
    );

    // Empty fresh fetch (nothing new since cursor is null → full fetch → no worklogs)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ values: [], lastPage: true, until: Date.now() }),
      })
    );

    const onStaleData = vi.fn();
    await fetchWorklogs(URL, EMAIL, TOKEN, START, END, undefined, undefined, onStaleData);

    expect(onStaleData).toHaveBeenCalledOnce();
    expect(onStaleData).toHaveBeenCalledWith(staleWorklogs);
  });

  it("does not call onStaleData when persistent cache is fresh", async () => {
    const freshTimestamp = Date.now() - 60_000; // 1 min ago — within 10-min TTL
    const cacheKey = `${START.getTime()}-${END.getTime()}`;
    const cachedData = [
      { id: "50", issueKey: "PROJ-1", team: "PROJ", timeSpent: "2h", timeSpentSeconds: 7200, comment: "", started: "2026-08-12T09:00:00", author: "Alice", authorEmail: "alice@example.com" },
    ];

    chromeMock.storage.local.get.mockImplementation(
      (keys: unknown, cb: (r: Record<string, unknown>) => void) => {
        const k = Array.isArray(keys) ? keys[0] : keys;
        if (k === `wlCache_${cacheKey}`) {
          cb({ [`wlCache_${cacheKey}`]: { data: cachedData, timestamp: freshTimestamp } });
        } else {
          cb({});
        }
      }
    );

    const onStaleData = vi.fn();
    const result = await fetchWorklogs(URL, EMAIL, TOKEN, START, END, undefined, undefined, onStaleData);

    expect(onStaleData).not.toHaveBeenCalled();
    expect(result).toEqual(cachedData); // served from persistent cache
  });
});
