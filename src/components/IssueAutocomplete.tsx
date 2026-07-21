import { useState, useEffect, useRef } from "react";
import { useIssueSearch, JiraIssue } from "../hooks/useIssueSearch";

interface IssueAutocompleteProps {
  input: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onSelect: (issueKey: string) => void;
}

export function IssueAutocomplete({ input, textareaRef, onSelect }: IssueAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const { results, loading } = useIssueSearch(query);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = textarea.value.substring(0, cursorPos);
      const currentLineStart = textBeforeCursor.lastIndexOf("\n") + 1;
      const currentLine = textBeforeCursor.substring(currentLineStart);

      const match = currentLine.match(/^([A-Z][A-Z0-9]*-?\d*[A-Z]*)$/i);
      if (match && match[1].length >= 2) {
        setQuery(match[1]);
        setVisible(true);
        setSelectedIndex(0);
      } else {
        setVisible(false);
        setQuery("");
      }
    };

    textarea.addEventListener("input", handleInput);
    textarea.addEventListener("click", handleInput);
    return () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("click", handleInput);
    };
  }, [textareaRef]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible || results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        setVisible(false);
      }
    };

    textarea.addEventListener("keydown", handleKeyDown);
    return () => textarea.removeEventListener("keydown", handleKeyDown);
  }, [visible, results, selectedIndex, textareaRef]);

  const handleSelect = (issue: JiraIssue) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = textarea.value.substring(0, cursorPos);
    const currentLineStart = textBeforeCursor.lastIndexOf("\n") + 1;
    const textBefore = textarea.value.substring(0, currentLineStart);
    const textAfter = textarea.value.substring(cursorPos);

    const insertion = `${issue.key}: `;
    onSelect(textBefore + insertion + textAfter);

    setVisible(false);
    setQuery("");

    setTimeout(() => {
      const newPos = currentLineStart + insertion.length;
      textarea.selectionStart = newPos;
      textarea.selectionEnd = newPos;
      textarea.focus();
    }, 0);
  };

  if (!visible || results.length === 0) return null;

  return (
    <div className="autocomplete-dropdown" ref={containerRef}>
      {results.map((issue, idx) => (
        <div
          key={issue.key}
          className={`autocomplete-item ${idx === selectedIndex ? "selected" : ""}`}
          onMouseDown={(e) => { e.preventDefault(); handleSelect(issue); }}
          onMouseEnter={() => setSelectedIndex(idx)}
        >
          <span className="autocomplete-key">{issue.key}</span>
          <span className="autocomplete-summary">{issue.summary}</span>
        </div>
      ))}
      {loading && <div className="autocomplete-item loading">Searching...</div>}
    </div>
  );
}
