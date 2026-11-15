import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeTransport } from '../test/FakeTransport';
import { AGIChatWidget } from './AGIChatWidget';
import { ChatStore } from './ChatStore';
import { DEFAULT_STYLES } from './defaultStyles';
import type { ChatViewProps } from './types';
import { AGIChatView } from '../components/AGIChatView';
import { StrictMode } from 'react';

afterEach(() => localStorage.clear());

// widget con un store sobre el transporte falso, para controlar lo que llega
function renderWithStore(props: Partial<Parameters<typeof AGIChatWidget>[0]> = {}) {
  const transport = new FakeTransport();
  const store = new ChatStore(transport);
  const view = render(<AGIChatWidget store={store} {...props} />);
  return { transport, store, ...view, user: userEvent.setup() };
}

describe('AGIChatWidget', () => {
  it('muestra respaldos en la vista completa, incluso bajo StrictMode, sin reabrir al remontar', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const transport = new FakeTransport();
    const store = new ChatStore(transport);
    const action = { type: 'open_url' as const, url: 'https://www.imdb.com/', label: 'IMDb' };
    try {
      const first = render(
        <StrictMode>
          <AGIChatWidget store={store} defaultOpen view={AGIChatView} />
        </StrictMode>,
      );
      act(() => transport.receiveAction(action));
      expect(open).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog')).toContainElement(
        screen.getByRole('link', { name: 'IMDb' }),
      );
      first.unmount();
      const second = render(<AGIChatWidget store={store} defaultOpen view={AGIChatView} />);
      expect(screen.getByRole('link', { name: 'IMDb' })).toBeVisible();
      expect(open).toHaveBeenCalledTimes(1);
      second.unmount();
    } finally {
      store.destroy();
      open.mockRestore();
    }
  });
  it.each(['blocked', 'opened', 'throws'])(
    'abre pestañas y conserva el respaldo cuando window.open %s',
    (outcome) => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => {
        if (outcome === 'throws') throw new Error('blocked');
        return outcome === 'opened' ? window : null;
      });
      try {
        const { transport, store, unmount } = renderWithStore({ defaultOpen: true });
        const action = {
          type: 'open_url' as const,
          url: 'https://books.google.com/books?id=Dune',
          label: 'Google Books',
        };
        act(() => transport.receiveAction(action));
        expect(open).toHaveBeenCalledExactlyOnceWith(action.url, '_blank', 'noopener');
        expect(screen.getByRole('link', { name: 'Google Books' })).toHaveAttribute(
          'rel',
          'noopener noreferrer',
        );
        expect(screen.getByRole('link', { name: 'Google Books' })).toHaveAttribute(
          'href',
          action.url,
        );
        act(() => transport.receiveAction(action));
        expect(open).toHaveBeenCalledTimes(1);
        act(() => store.clear());
        expect(screen.queryByRole('link', { name: 'Google Books' })).not.toBeInTheDocument();
        unmount();
        transport.receiveAction(action);
        expect(open).toHaveBeenCalledTimes(1);
      } finally {
        open.mockRestore();
      }
    },
  );
  it('arranca cerrado, con estilos, tema auto y textos por defecto', async () => {
    const { container, user } = renderWithStore();
    const root = container.querySelector('.agichat')!;
    expect(root).toHaveAttribute('data-theme', 'auto');
    expect(root.querySelector('style')?.textContent).toBe(DEFAULT_STYLES);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir chat' }));
    expect(screen.getByRole('dialog', { name: 'AGIChat' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Escribe tu mensaje…')).toBeInTheDocument();
  });

  it('conecta el store con la vista: enviar, recibir y reintentar', async () => {
    const { transport, user } = renderWithStore({ defaultOpen: true });
    const input = screen.getByRole('textbox', { name: 'Mensaje' });

    await user.type(input, 'Hola{Enter}');
    expect(transport.sent.map((m) => m.content)).toEqual(['Hola']);
    expect(screen.getByText('El asistente está escribiendo…')).toBeInTheDocument();

    act(() => transport.receive({ id: 'a1', content: 'Respuesta' }));
    expect(screen.getByText('Respuesta')).toBeInTheDocument();

    transport.failNextSend = true;
    await user.type(input, 'Falla{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo enviar');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(transport.sent.map((m) => m.content)).toEqual(['Hola', 'Falla']);
    expect(screen.queryByText('No se envió.')).not.toBeInTheDocument();
  });

  it('respeta el modo controlado y avisa con onOpenChange', async () => {
    const onOpenChange = vi.fn();
    const { user, rerender, store } = renderWithStore({ open: false, onOpenChange });
    await user.click(screen.getByRole('button', { name: 'Abrir chat' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    // sigue cerrado porque el padre no cambio `open`
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<AGIChatWidget store={store} open onOpenChange={onOpenChange} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('acepta una vista propia (contrato para persona 4), tema y sin estilos', () => {
    const CustomView = vi.fn((props: ChatViewProps) => <p>{props.title}</p>);
    const { container } = renderWithStore({
      view: CustomView,
      styles: '',
      theme: 'dark',
      title: 'Ventas',
      welcomeMessage: 'Bienvenido',
    });
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelector('.agichat')).toHaveAttribute('data-theme', 'dark');
    expect(CustomView.mock.lastCall?.[0]).toMatchObject({
      open: false,
      connectionState: 'connected',
      welcomeMessage: 'Bienvenido',
      placeholder: 'Escribe tu mensaje…',
    });
  });

  it('crea su propio store desde la config, con el mock y con historial', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <AGIChatWidget
          transport="mock"
          mock={{ delayMs: 5, chunkIntervalMs: 1, chunkSize: 50, response: 'Hola **mundo**' }}
          persistHistory="test-chat"
          defaultOpen
        />,
      );
      expect(screen.getByText('Conectando…')).toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(5));
      expect(screen.getByText('En línea')).toBeInTheDocument();
      unmount();
      // mismo historial en otro montaje
      localStorage.setItem(
        'test-chat',
        JSON.stringify([
          {
            id: 'x',
            role: 'assistant',
            content: 'guardado',
            createdAt: '2026-09-22T00:00:00.000Z',
            status: 'complete',
          },
        ]),
      );
      render(<AGIChatWidget transport="mock" persistHistory="test-chat" defaultOpen />);
      expect(screen.getByText('guardado')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('usa la llave por defecto con persistHistory = true', () => {
    localStorage.setItem(
      'agichat:history',
      JSON.stringify([
        {
          id: 'y',
          role: 'assistant',
          content: 'por defecto',
          createdAt: '2026-09-22T00:00:00.000Z',
          status: 'complete',
        },
      ]),
    );
    render(<AGIChatWidget transport="mock" persistHistory defaultOpen />);
    expect(screen.getByText('por defecto')).toBeInTheDocument();
  });
});
