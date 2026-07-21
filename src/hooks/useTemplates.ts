import { useState, useEffect } from "react";

export interface Template {
  id: string;
  name: string;
  entries: string;
}

const STORAGE_KEY = "templates";

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY], (data) => {
      if (data[STORAGE_KEY]) {
        setTemplates(data[STORAGE_KEY]);
      }
    });
  }, []);

  const save = (templates: Template[]) => {
    setTemplates(templates);
    chrome.storage.local.set({ [STORAGE_KEY]: templates });
  };

  const addTemplate = (name: string, entries: string) => {
    const newTemplate: Template = {
      id: Date.now().toString(36),
      name,
      entries,
    };
    save([...templates, newTemplate]);
  };

  const removeTemplate = (id: string) => {
    save(templates.filter(t => t.id !== id));
  };

  return { templates, addTemplate, removeTemplate };
}
