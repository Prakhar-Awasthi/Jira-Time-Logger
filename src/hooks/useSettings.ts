import { useState, useEffect } from "react";
import { Settings, DEFAULT_SETTINGS, loadSettings, saveSettings, AlertRule } from "../utils/alert-rules";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const update = (partial: Partial<Settings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    saveSettings(updated);
  };

  const addRule = (rule: Omit<AlertRule, "id">) => {
    const newRule: AlertRule = { ...rule, id: Date.now().toString(36) };
    update({ alertRules: [...settings.alertRules, newRule] });
  };

  const updateRule = (id: string, partial: Partial<AlertRule>) => {
    update({
      alertRules: settings.alertRules.map(r => r.id === id ? { ...r, ...partial } : r),
    });
  };

  const removeRule = (id: string) => {
    update({ alertRules: settings.alertRules.filter(r => r.id !== id) });
  };

  const toggleRule = (id: string) => {
    const rule = settings.alertRules.find(r => r.id === id);
    if (rule) updateRule(id, { enabled: !rule.enabled });
  };

  return { settings, loaded, update, addRule, updateRule, removeRule, toggleRule };
}
