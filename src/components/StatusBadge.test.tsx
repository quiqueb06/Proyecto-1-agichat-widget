import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('muestra el estado desconectado por defecto', () => {
    render(<StatusBadge label="Agente" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('data-online', 'false');
    expect(badge).toHaveAccessibleName('Agente: desconectado');
  });

  it('muestra el estado en línea', () => {
    render(<StatusBadge label="Agente" online />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Agente: en línea');
  });
});
