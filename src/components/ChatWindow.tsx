import type { ConnectionState, Message } from '../types';
import type { RefObject } from 'react';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';

const STATUS_LABELS: Record<ConnectionState, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'En línea',
  reconnecting: 'Reconectando…',
  error: 'Sin conexión',
};

type ChatWindowProps = {
  messages: readonly Message[];
  isTyping?: boolean;
  title: string;
  placeholder: string;
  connectionState: ConnectionState;
  failedMessageIds: readonly string[];
  error: Error | null;
  onClose: () => void;
  onSend: (message: string) => void;
  onRetry: (id: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  welcomeMessage?: string;
};

export function ChatWindow({
  messages,
  isTyping = false,
  title,
  placeholder,
  connectionState,
  welcomeMessage,
  failedMessageIds,
  error,
  onClose,
  onSend,
  onRetry,
  inputRef,
}: ChatWindowProps) {
  return (
    <section
      className="agichat-window"
      role="dialog"
      aria-modal="false"
      aria-labelledby="agichat-title"
    >
      <header className="agichat-header">
        <div>
          <h2 id="agichat-title">{title}</h2>
          <span
            className="agichat-status"
            data-state={connectionState}
          >
            {STATUS_LABELS[connectionState]}
          </span>
        </div>

        <button
          type="button"
          className="agichat-close"
          onClick={onClose}
          aria-label="Cerrar chat"
        >
          ×
        </button>
      </header>

      <MessageList
        messages={messages}
        isTyping={isTyping}
        welcomeMessage={welcomeMessage}
        failedMessageIds={failedMessageIds}
        onRetry={onRetry}
      />

      {error && (
        <p className="agichat-error" role="alert">
          {error.message}
        </p>
      )}

      <MessageInput
        ref={inputRef}
        onSend={onSend}
        placeholder={placeholder}
      />
    </section>
  );
}
