import { ChatMessage } from "../services/ai-service";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  return (
    <div className={`chat-avatar ${role}`}>
      {role === "assistant" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="16" height="13" rx="3" />
          <path d="M9 20l3-3 3 3" />
          <circle cx="9" cy="10.5" r="1" fill="currentColor" />
          <circle cx="15" cy="10.5" r="1" fill="currentColor" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      )}
    </div>
  );
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  return (
    <div className={`chat-message ${message.role}`}>
      <Avatar role={message.role} />
      <div className="chat-bubble">
        {message.content.split("\n").map((line, i) => {
          if (line.startsWith("**") && line.endsWith("**")) {
            return <strong key={i}>{line.slice(2, -2)}</strong>;
          }
          if (line.includes("**")) {
            const parts = line.split(/\*\*(.*?)\*\*/g);
            return (
              <p key={i}>
                {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
              </p>
            );
          }
          if (line.startsWith("- ") || line.startsWith("\u2022 ") || line.startsWith("• ")) {
            return <div key={i} className="chat-list-item">{line}</div>;
          }
          if (line.startsWith("[Warning]") || line.startsWith("[Info]")) {
            return <div key={i} className="chat-alert">{line}</div>;
          }
          if (line === "") return <br key={i} />;
          return <p key={i}>{line}</p>;
        })}
      </div>
    </div>
  );
}
