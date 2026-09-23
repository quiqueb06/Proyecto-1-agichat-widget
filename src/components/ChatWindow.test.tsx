import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatWindow } from './ChatWindow';

describe('ChatWindow', () => {
  const messages = [
    {
      id: '1',
      sender: 'assistant' as const,
      content: 'Hola, ¿en qué puedo ayudarte?',
    },
  ];

  it('muestra los mensajes', () => {
    render(
      <ChatWindow
        messages={messages}
        onClose={() => {}}
        onSend={() => {}}
      />,
    );

    expect(
      screen.getByText('Hola, ¿en qué puedo ayudarte?'),
    ).toBeInTheDocument();
  });

  it('tiene un diálogo accesible', () => {
    render(
      <ChatWindow
        messages={messages}
        onClose={() => {}}
        onSend={() => {}}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ejecuta onClose', () => {
    const onClose = vi.fn();

    render(
      <ChatWindow
        messages={messages}
        onClose={onClose}
        onSend={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /cerrar chat/i }),
    );

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('muestra el indicador de escritura', () => {
    render(
      <ChatWindow
        messages={messages}
        isTyping
        onClose={() => {}}
        onSend={() => {}}
      />,
    );

    expect(
      screen.getByRole('status', {
        name: /agichat está escribiendo/i,
      }),
    ).toBeInTheDocument();
  });
});
