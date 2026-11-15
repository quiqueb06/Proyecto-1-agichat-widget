import { act, within } from '@testing-library/react';
import { AGIChat } from './AGIChat';

class Socket {
  static current: Socket;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose = null;
  onerror = null;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    Socket.current = this;
  }
}

it('recorre WebSocket → store → instancia/global AGIChat → Shadow DOM sin abrir dos veces', () => {
  vi.stubGlobal('WebSocket', Socket);
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const global = vi.fn();
  const stop = AGIChat.on('action', global);
  let instanceStop = () => {};
  try {
    let instanceListener = vi.fn();
    act(() => {
      const instance = AGIChat.init({
        transport: 'websocket',
        endpoint: 'ws://localhost:8787/ws',
        defaultOpen: true,
      });
      instanceListener = vi.fn();
      instanceStop = instance.on('action', instanceListener);
    });
    const action = {
      type: 'open_url',
      url: 'https://www.imdb.com/title/tt0120737/',
      label: 'IMDb',
    };
    act(() => {
      Socket.current.onopen!();
      Socket.current.onmessage!({ data: JSON.stringify({ type: 'action', action }) });
    });
    expect(global).toHaveBeenCalledExactlyOnceWith(action);
    expect(instanceListener).toHaveBeenCalledExactlyOnceWith(action);
    expect(open).toHaveBeenCalledExactlyOnceWith(action.url, '_blank', 'noopener');
    const container = document.querySelector('[data-agichat]')!.shadowRoot!
      .firstElementChild as HTMLElement;
    expect(within(container).getByRole('link', { name: 'IMDb' })).toHaveAttribute(
      'href',
      action.url,
    );
    stop();
    instanceStop();
    act(() =>
      Socket.current.onmessage!({
        data: JSON.stringify({ type: 'action', action: { ...action, url: 'https://imdb.com/' } }),
      }),
    );
    expect(global).toHaveBeenCalledTimes(1);
    expect(instanceListener).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    instanceStop();
    act(() => AGIChat.destroy());
    open.mockRestore();
    vi.unstubAllGlobals();
  }
});
