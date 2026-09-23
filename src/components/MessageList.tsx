import { useEffect, useRef } from 'react';
import type { Message } from '../types';

type MessageListProps = {
  messages: readonly Message[];
  isTyping?: boolean;
  welcomeMessage?: string;
  failedMessageIds: readonly string[];
  onRetry: (id: string) => void;
};

export function MessageList({
  messages,
  isTyping = false,
  welcomeMessage,
  failedMessageIds,
  onRetry,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  return (
    <div className="agichat-messages" role="log" aria-live="polite" aria-label="Mensajes del chat">
      {messages.length === 0 && welcomeMessage && (
        <div className="agichat-message agichat-message--assistant">
          <div className="agichat-message__bubble">{welcomeMessage}</div>
        </div>
      )}
      {messages.map((message) => {
        const failed = failedMessageIds.includes(message.id);

        return (
          <div
            key={message.id}
            className={`agichat-message agichat-message--${message.role}`}
            aria-busy={message.status === 'streaming'}
          >
            <div className="agichat-message__bubble">
              {message.content}

              {failed && (
                <div className="agichat-failed">
                  <span>No se envió.</span>

                  <button
                    type="button"
                    className="agichat-retry"
                    onClick={() => onRetry(message.id)}
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isTyping && messages.at(-1)?.status !== 'streaming' && (
        <div className="agichat-typing" role="status" aria-label="AGIChat está escribiendo">
          <span />
          <span />
          <span />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
