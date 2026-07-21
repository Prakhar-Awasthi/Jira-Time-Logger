import { ChatMessage } from "../services/ai-service";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

export function ChatMessageBubble({ message }: ChatMessageBubbleProps) {
  return (
    <div className={`chat-message ${message.role}`}>
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
