import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';

type DemoMessage = {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
};

type ChatWindowProps = {
  messages: DemoMessage[];
  isTyping?: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
};

export function ChatWindow({
  messages,
  isTyping = false,
  onClose,
  onSend,
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
          <h2 id="agichat-title">AGIChat</h2>
          <span className="agichat-status">En línea</span>
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

      <MessageList messages={messages} isTyping={isTyping} />

      <MessageInput onSend={onSend} />
    </section>
  );
}
