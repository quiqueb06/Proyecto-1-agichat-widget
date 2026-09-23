import { useEffect, useRef } from 'react';

type DemoMessage = {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
};

type MessageListProps = {
  messages: DemoMessage[];
  isTyping?: boolean;
};

export function MessageList({
  messages,
  isTyping = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  return (
    <div
      className="agichat-messages"
      role="log"
      aria-live="polite"
      aria-label="Mensajes del chat"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`agichat-message agichat-message--${message.sender}`}
        >
          <div className="agichat-message__bubble">
            {message.content}
          </div>
        </div>
      ))}

      {isTyping && (
        <div
          className="agichat-typing"
          role="status"
          aria-label="AGIChat está escribiendo"
        >
          <span />
          <span />
          <span />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
