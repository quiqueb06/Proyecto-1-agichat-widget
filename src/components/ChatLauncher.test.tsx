import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatLauncher } from './ChatLauncher';

describe('ChatLauncher', () => {
  it('muestra el botón para abrir el chat', () => {
    render(<ChatLauncher isOpen={false} onClick={() => {}} />);

    expect(screen.getByRole('button', { name: /abrir chat/i })).toBeInTheDocument();
  });

  it('cambia la etiqueta cuando el chat está abierto', () => {
    render(<ChatLauncher isOpen onClick={() => {}} />);

    expect(screen.getByRole('button', { name: /cerrar chat/i })).toBeInTheDocument();
  });

  it('ejecuta onClick', () => {
    const onClick = vi.fn();

    render(<ChatLauncher isOpen={false} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir chat/i }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('expone aria-expanded', () => {
    render(<ChatLauncher isOpen={false} onClick={() => {}} />);

    expect(screen.getByRole('button', { name: /abrir chat/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
