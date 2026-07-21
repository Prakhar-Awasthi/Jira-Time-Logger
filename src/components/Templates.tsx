import { useState } from "react";
import { useTemplates } from "../hooks/useTemplates";

interface TemplatesProps {
  onInsert: (text: string) => void;
  currentInput: string;
}

export function Templates({ onInsert, currentInput }: TemplatesProps) {
  const { templates, addTemplate, removeTemplate } = useTemplates();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const handleSave = () => {
    if (templateName.trim() && currentInput.trim()) {
      addTemplate(templateName.trim(), currentInput.trim());
      setTemplateName("");
      setShowSaveDialog(false);
    }
  };

  return (
    <div className="templates-container">
      <div className="templates-chips">
        {templates.map(t => (
          <div key={t.id} className="template-chip" onClick={() => onInsert(t.entries)}>
            <span className="template-chip-name">{t.name}</span>
            <button
              className="template-chip-remove"
              onClick={(e) => { e.stopPropagation(); removeTemplate(t.id); }}
              aria-label={`Remove ${t.name}`}
            >
              &times;
            </button>
          </div>
        ))}
        {currentInput.trim() && !showSaveDialog && (
          <button className="template-save-btn" onClick={() => setShowSaveDialog(true)}>
            + Save as template
          </button>
        )}
      </div>
      {showSaveDialog && (
        <div className="template-save-dialog">
          <input
            type="text"
            placeholder="Template name..."
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSaveDialog(false); }}
            autoFocus
          />
          <button className="btn-secondary" onClick={handleSave} disabled={!templateName.trim()}>Save</button>
          <button className="btn-secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
