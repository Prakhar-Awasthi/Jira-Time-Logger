export interface AlertRule {
  id: string;
  name: string;
  type: "daily_min" | "daily_max" | "weekend_log" | "reminder";
  threshold: number;
  time?: string;
  enabled: boolean;
}

export interface Settings {
  dailyTargetHours: number;
  weeklyTargetHours: number;
  notificationsEnabled: boolean;
  checkIntervalMinutes: number;
  alertRules: AlertRule[];
}

const SETTINGS_KEY = "appSettings";

export const DEFAULT_SETTINGS: Settings = {
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

export async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get([SETTINGS_KEY], (data) => {
        resolve({ ...DEFAULT_SETTINGS, ...data[SETTINGS_KEY] });
      });
    } else {
      resolve(DEFAULT_SETTINGS);
    }
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }
}

export interface AlertCheckResult {
  rule: AlertRule;
  triggered: boolean;
  message: string;
}

export function evaluateRules(
  rules: AlertRule[],
  todaySeconds: number,
  settings: Settings
): AlertCheckResult[] {
  const results: AlertCheckResult[] = [];
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const todayHours = todaySeconds / 3600;
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.type) {
      case "daily_min": {
        const [ruleHour] = (rule.time || "17:00").split(":").map(Number);
        if (currentHour >= ruleHour && todayHours < rule.threshold) {
          results.push({
            rule,
            triggered: true,
            message: `You've only logged ${todayHours.toFixed(1)}h today (target: ${rule.threshold}h)`,
          });
        }
        break;
      }
      case "daily_max": {
        if (todayHours > rule.threshold) {
          results.push({
            rule,
            triggered: true,
            message: `You've logged ${todayHours.toFixed(1)}h today — over the ${rule.threshold}h limit!`,
          });
        }
        break;
      }
      case "weekend_log": {
        if (isWeekend && todaySeconds > 0) {
          results.push({
            rule,
            triggered: true,
            message: `Time logged on a weekend (${todayHours.toFixed(1)}h). Was this intentional?`,
          });
        }
        break;
      }
      case "reminder": {
        const [ruleHour, ruleMinute] = (rule.time || "16:30").split(":").map(Number);
        if (currentHour === ruleHour && Math.abs(currentMinute - ruleMinute) <= 15 && !isWeekend) {
          results.push({
            rule,
            triggered: true,
            message: `Reminder: Don't forget to log your time today! (${todayHours.toFixed(1)}h so far)`,
          });
        }
        break;
      }
    }
  }

  return results;
}
