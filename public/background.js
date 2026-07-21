const ALARM_NAME = "jira-time-check";
const SETTINGS_KEY = "appSettings";
const LAST_NOTIFICATION_KEY = "lastNotificationTime";

const DEFAULT_SETTINGS = {
  dailyTargetHours: 8,
  weeklyTargetHours: 40,
  notificationsEnabled: true,
  checkIntervalMinutes: 30,
  alertRules: [
    { id: "daily_min_default", name: "Daily minimum", type: "daily_min", threshold: 6, time: "17:00", enabled: true },
    { id: "daily_max_default", name: "Overwork alert", type: "daily_max", threshold: 10, enabled: true },
    { id: "weekend_default", name: "Weekend flag", type: "weekend_log", threshold: 0, enabled: true },
    { id: "reminder_default", name: "End of day reminder", type: "reminder", threshold: 0, time: "16:30", enabled: true },
  ],
};

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
});

async function setupAlarm() {
  const settings = await getSettings();
  chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: settings.checkIntervalMinutes || 30,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await checkAndNotify();
  }
});

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_KEY], (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...data[SETTINGS_KEY] });
    });
  });
}

async function getCredentials() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["jiraUrl", "email", "token"], (data) => {
      resolve(data);
    });
  });
}

async function fetchTodayHours(baseUrl, email, token) {
  try {
    const auth = btoa(`${email}:${token}`);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const res = await fetch(`${baseUrl}/rest/api/3/worklog/updated?since=${startOfDay}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });

    if (!res.ok) return 0;
    const data = await res.json();
    const worklogIds = (data.values || []).map((v) => String(v.worklogId)).filter(Boolean);

    if (worklogIds.length === 0) return 0;

    const listRes = await fetch(`${baseUrl}/rest/api/3/worklog/list`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: worklogIds.slice(0, 1000) }),
    });

    if (!listRes.ok) return 0;
    const worklogs = await listRes.json();

    const today = now.toISOString().split("T")[0];
    let totalSeconds = 0;
    (Array.isArray(worklogs) ? worklogs : []).forEach((wl) => {
      if (wl.started && wl.started.startsWith(today) && wl.author && wl.author.emailAddress === email) {
        totalSeconds += wl.timeSpentSeconds || 0;
      }
    });

    return totalSeconds;
  } catch {
    return 0;
  }
}

async function checkAndNotify() {
  const creds = await getCredentials();
  if (!creds.jiraUrl || !creds.email || !creds.token) return;

  const settings = await getSettings();
  const todaySeconds = await fetchTodayHours(creds.jiraUrl, creds.email, creds.token);
  const todayHours = todaySeconds / 3600;

  // Update badge
  const badgeText = todayHours > 0 ? todayHours.toFixed(1) : "";
  chrome.action.setBadgeText({ text: badgeText });

  const ratio = todayHours / (settings.dailyTargetHours || 8);
  let badgeColor = "#ef4444"; // red
  if (ratio >= 1) badgeColor = "#10b981"; // green
  else if (ratio >= 0.5) badgeColor = "#f59e0b"; // yellow
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });

  // Check alert rules
  if (!settings.notificationsEnabled) return;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  // Prevent duplicate notifications within same hour
  const lastNotif = await new Promise((resolve) => {
    chrome.storage.local.get([LAST_NOTIFICATION_KEY], (data) => resolve(data[LAST_NOTIFICATION_KEY] || 0));
  });
  const hourKey = `${now.toISOString().split("T")[0]}-${currentHour}`;

  for (const rule of settings.alertRules || []) {
    if (!rule.enabled) continue;

    let shouldNotify = false;
    let message = "";

    switch (rule.type) {
      case "daily_min": {
        const [ruleHour] = (rule.time || "17:00").split(":").map(Number);
        if (currentHour >= ruleHour && todayHours < rule.threshold) {
          shouldNotify = true;
          message = `You've only logged ${todayHours.toFixed(1)}h today (target: ${rule.threshold}h)`;
        }
        break;
      }
      case "daily_max": {
        if (todayHours > rule.threshold) {
          shouldNotify = true;
          message = `You've logged ${todayHours.toFixed(1)}h today — over ${rule.threshold}h!`;
        }
        break;
      }
      case "weekend_log": {
        if (isWeekend && todaySeconds > 0) {
          shouldNotify = true;
          message = `Time logged on weekend (${todayHours.toFixed(1)}h). Was this intentional?`;
        }
        break;
      }
      case "reminder": {
        const [ruleHour, ruleMinute] = (rule.time || "16:30").split(":").map(Number);
        if (currentHour === ruleHour && Math.abs(currentMinute - ruleMinute) <= 15 && !isWeekend) {
          shouldNotify = true;
          message = `Don't forget to log your time! (${todayHours.toFixed(1)}h so far)`;
        }
        break;
      }
    }

    if (shouldNotify && lastNotif !== hourKey) {
      chrome.notifications.create(`jira-alert-${rule.id}-${Date.now()}`, {
        type: "basic",
        iconUrl: "icon128.png",
        title: `Jira Time Logger: ${rule.name}`,
        message,
      });
      chrome.storage.local.set({ [LAST_NOTIFICATION_KEY]: hourKey });
      break; // One notification per check cycle
    }
  }
}
