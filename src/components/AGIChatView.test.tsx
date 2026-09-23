import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AGIChatView } from './AGIChatView';

const baseProps = {
  messages: [
    {
      id: '1',
      role: 'assistant' as const,
      content: 'Hola desde AGIChat',
      createdAt: new Date().toISOString(),
      status: 'complete' as const,
    },
  ],
  isTyping: false,
  connectionState: 'connected' as const,
  failedMessageIds: [] as readonly string[],
  error: null,
  open: true,
  title: 'AGIChat',
  placeholder: 'Escribe un mensaje...',
  welcomeMessage: 'Hola, ¿en qué puedo ayudarte?',
  onSend: vi.fn(),
  onRetry: vi.fn(),
  onOpen: vi.fn(),
  onClose: vi.fn(),
};

describe('AGIChatView', () => {
  it('muestra la ventana y los mensajes cuando está abierto', () => {
    render(<AGIChatView {...baseProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hola desde AGIChat')).toBeInTheDocument();
    expect(screen.getByText('En línea')).toBeInTheDocument();
  });

  it('solo muestra el launcher cuando está cerrado', () => {
    render(<AGIChatView {...baseProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /abrir chat/i })).toBeInTheDocument();
  });

  it('abre el chat desde el launcher', () => {
    const onOpen = vi.fn();

    render(<AGIChatView {...baseProps} open={false} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir chat/i }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('cierra el chat con Escape', () => {
    const onClose = vi.fn();

    render(<AGIChatView {...baseProps} onClose={onClose} />);

    fireEvent.keyDown(window, {
      key: 'Escape',
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('envía mensajes mediante la interfaz', () => {
    const onSend = vi.fn();

    render(<AGIChatView {...baseProps} onSend={onSend} />);

    const input = screen.getByPlaceholderText(/escribe un mensaje/i);

    fireEvent.change(input, {
      target: { value: 'Mensaje de prueba' },
    });

    fireEvent.click(screen.getByRole('button', { name: /enviar mensaje/i }));

    expect(onSend).toHaveBeenCalledWith('Mensaje de prueba');
  });

  it('mueve el foco al input cuando el chat está abierto', () => {
    render(<AGIChatView {...baseProps} />);

    expect(screen.getByPlaceholderText(/escribe un mensaje/i)).toHaveFocus();
  });
});
