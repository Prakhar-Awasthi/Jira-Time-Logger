import { useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { AlertRule } from "../utils/alert-rules";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, loaded, update, addRule, updateRule, removeRule, toggleRule } = useSettings();
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState<AlertRule["type"]>("daily_min");
  const [newRuleThreshold, setNewRuleThreshold] = useState(6);
  const [newRuleTime, setNewRuleTime] = useState("17:00");

  if (!loaded) return null;

  const handleAddRule = () => {
    if (!newRuleName.trim()) return;
    addRule({
      name: newRuleName.trim(),
      type: newRuleType,
      threshold: newRuleThreshold,
      time: newRuleType === "daily_min" || newRuleType === "reminder" ? newRuleTime : undefined,
      enabled: true,
    });
    setNewRuleName("");
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Targets</h3>
            <div className="settings-field">
              <label>Daily target (hours)</label>
              <input
                type="number"
                min="1"
                max="24"
                value={settings.dailyTargetHours}
                onChange={(e) => update({ dailyTargetHours: Number(e.target.value) })}
              />
            </div>
            <div className="settings-field">
              <label>Weekly target (hours)</label>
              <input
                type="number"
                min="1"
                max="168"
                value={settings.weeklyTargetHours}
                onChange={(e) => update({ weeklyTargetHours: Number(e.target.value) })}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>Notifications</h3>
            <div className="settings-field settings-field--row">
              <label>Enable notifications</label>
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(e) => update({ notificationsEnabled: e.target.checked })}
              />
            </div>
            <div className="settings-field">
              <label>Check interval (minutes)</label>
              <input
                type="number"
                min="5"
                max="120"
                value={settings.checkIntervalMinutes}
                onChange={(e) => update({ checkIntervalMinutes: Number(e.target.value) })}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>Alert Rules</h3>
            <div className="alert-rules-list">
              {settings.alertRules.map((rule) => (
                <div key={rule.id} className="alert-rule-item">
                  <div className="alert-rule-info">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleRule(rule.id)}
                    />
                    <span className={`rule-name ${!rule.enabled ? "disabled" : ""}`}>{rule.name}</span>
                    <span className="rule-type">{rule.type.replace("_", " ")}</span>
                  </div>
                  <button className="rule-delete" onClick={() => removeRule(rule.id)} aria-label="Delete rule">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="add-rule-form">
              <input
                type="text"
                placeholder="Rule name"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
              />
              <select value={newRuleType} onChange={(e) => setNewRuleType(e.target.value as AlertRule["type"])}>
                <option value="daily_min">Daily minimum</option>
                <option value="daily_max">Daily maximum</option>
                <option value="weekend_log">Weekend flag</option>
                <option value="reminder">Reminder</option>
              </select>
              <input
                type="number"
                placeholder="Hours"
                min="0"
                max="24"
                value={newRuleThreshold}
                onChange={(e) => setNewRuleThreshold(Number(e.target.value))}
              />
              {(newRuleType === "daily_min" || newRuleType === "reminder") && (
                <input
                  type="time"
                  value={newRuleTime}
                  onChange={(e) => setNewRuleTime(e.target.value)}
                />
              )}
              <button className="btn-add-rule" onClick={handleAddRule}>Add</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
