import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageInput } from './MessageInput';

describe('MessageInput', () => {
  it('permite escribir un mensaje', () => {
    render(<MessageInput onSend={() => {}} />);

    const input = screen.getByPlaceholderText(/escribe un mensaje/i);

    fireEvent.change(input, {
      target: { value: 'Hola' },
    });

    expect(input).toHaveValue('Hola');
  });

  it('envía el mensaje', () => {
    const onSend = vi.fn();

    render(<MessageInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/escribe un mensaje/i);

    fireEvent.change(input, {
      target: { value: 'Hola AGIChat' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /enviar mensaje/i }),
    );

    expect(onSend).toHaveBeenCalledWith('Hola AGIChat');
  });

  it('limpia el input después de enviar', () => {
    render(<MessageInput onSend={() => {}} />);

    const input = screen.getByPlaceholderText(/escribe un mensaje/i);

    fireEvent.change(input, {
      target: { value: 'Hola' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /enviar mensaje/i }),
    );

    expect(input).toHaveValue('');
  });

  it('no permite enviar mensajes vacíos', () => {
    render(<MessageInput onSend={() => {}} />);

    expect(
      screen.getByRole('button', { name: /enviar mensaje/i }),
    ).toBeDisabled();
  });
});
