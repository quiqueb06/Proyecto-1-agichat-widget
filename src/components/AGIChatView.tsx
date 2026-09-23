import { useEffect, useId, useRef } from 'react';
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
  welcomeMessage,
  onSend,
  onRetry,
  onOpen,
  onClose,
}: ChatViewProps) {
  const windowId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
  if (!open) {
    return;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}, [open, onClose]);

useEffect(() => {
  if (open) {
    inputRef.current?.focus();
  } else if (wasOpen.current) {
    launcherRef.current?.focus();
  }

  wasOpen.current = open;
}, [open]);

  return (
    <div className="agichat-widget">
      {open && (
        <ChatWindow
          id={windowId}
          messages={messages}
          isTyping={isTyping}
          title={title}
          placeholder={placeholder}
          welcomeMessage={welcomeMessage}
          connectionState={connectionState}
          failedMessageIds={failedMessageIds}
          error={error}
          onClose={onClose}
          onSend={onSend}
          onRetry={onRetry}
          inputRef={inputRef}
        />
      )}

      <ChatLauncher
        ref={launcherRef}
        isOpen={open}
        controlsId={open ? windowId : undefined}
        onClick={open ? onClose : onOpen}
      />
    </div>
  );
}
