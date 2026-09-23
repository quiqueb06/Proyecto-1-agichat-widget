import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatWindow } from './ChatWindow';
import { createRef } from 'react';

describe('ChatWindow', () => {
  const messages = [
    {
      id: '1',
      role: 'assistant' as const,
      content: 'Hola, ¿en qué puedo ayudarte?',
      createdAt: new Date().toISOString(),
      status: 'complete' as const,
    },
  ];

  const inputRef = createRef<HTMLInputElement>();

  const baseProps = {
    id: 'agichat-test-window',
    messages,
    title: 'AGIChat',
    placeholder: 'Escribe un mensaje...',
    connectionState: 'connected' as const,
    failedMessageIds: [] as readonly string[],
    error: null,
    onClose: () => {},
    onSend: () => {},
    onRetry: () => {},
    inputRef,
  };

  it('muestra los mensajes', () => {
    render(<ChatWindow {...baseProps} />);

    expect(screen.getByText('Hola, ¿en qué puedo ayudarte?')).toBeInTheDocument();
  });

  it('tiene un diálogo accesible', () => {
    render(<ChatWindow {...baseProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ejecuta onClose', () => {
    const onClose = vi.fn();

    render(<ChatWindow {...baseProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /cerrar chat/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('muestra el indicador de escritura', () => {
    render(<ChatWindow {...baseProps} isTyping />);

    expect(
      screen.getByRole('status', {
        name: /agichat está escribiendo/i,
      }),
    ).toBeInTheDocument();
  });
});
