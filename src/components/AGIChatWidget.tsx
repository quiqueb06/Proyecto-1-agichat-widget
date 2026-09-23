import { useEffect, useState } from 'react';
import { ChatLauncher } from './ChatLauncher';
import { ChatWindow } from './ChatWindow';
import '../styles/theme.css';
import '../styles/widget.css';

type DemoMessage = {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
};

const initialMessages: DemoMessage[] = [
  {
    id: '1',
    sender: 'assistant',
    content: 'Hola, ¿en qué puedo ayudarte?',
  },
];

export function AGIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] =
    useState<DemoMessage[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
  if (!isOpen) {
    return;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
  };
}, [isOpen]);

  function handleSend(message: string) {
    const userMessage: DemoMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      content: message,
    };

    setMessages((current) => [...current, userMessage]);
    setIsTyping(true);

    window.setTimeout(() => {
      const assistantMessage: DemoMessage = {
        id: crypto.randomUUID(),
        sender: 'assistant',
        content: `Recibí tu mensaje: "${message}"`,
      };

      setMessages((current) => [...current, assistantMessage]);
      setIsTyping(false);
    }, 1000);
  }

  return (
    <div className="agichat-widget">
      {isOpen && (
        <ChatWindow
          messages={messages}
          isTyping={isTyping}
          onClose={() => setIsOpen(false)}
          onSend={handleSend}
        />
      )}

      <ChatLauncher
        isOpen={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      />
    </div>
  );
}
