import type { ChatViewProps } from '../core';
import { ChatLauncher } from './ChatLauncher';
import { ChatWindow } from './ChatWindow';
import '../styles/theme.css';
import '../styles/widget.css';

export function AGIChatView({
  messages,
  isTyping,
  connectionState,
  failedMessageIds,
  error,
  open,
  title,
  placeholder,
  onSend,
  onRetry,
  onOpen,
  onClose,
}: ChatViewProps) {
  return (
    <div className="agichat-widget">
      {open && (
        <ChatWindow
          messages={messages}
          isTyping={isTyping}
          title={title}
          placeholder={placeholder}
          connectionState={connectionState}
          failedMessageIds={failedMessageIds}
          error={error}
          onClose={onClose}
          onSend={onSend}
          onRetry={onRetry}
        />
      )}

      <ChatLauncher
        isOpen={open}
        onClick={open ? onClose : onOpen}
      />
    </div>
  );
}
