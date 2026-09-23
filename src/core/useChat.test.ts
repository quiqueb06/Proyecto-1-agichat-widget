import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { FakeTransport } from '../test/FakeTransport';
import { MockWebSocketTransport, WebSocketTransport } from '../transport';
import { ChatStore } from './ChatStore';
import { createChatStore, useChat } from './useChat';

// arma un store con el transporte falso y monta el hook
function setup(wrapper?: typeof StrictMode) {
  const transport = new FakeTransport();
  const store = new ChatStore(transport);
  const hook = renderHook(() => useChat(store), { wrapper });
  return { transport, store, ...hook };
}

describe('useChat', () => {
  it('conecta al montar y desconecta al desmontar', () => {
    const { transport, result, unmount } = setup();
    expect(result.current.connectionState).toBe('connected');
    unmount();
    expect(transport.state).toBe('disconnected');
  });

  it('re-renderiza con los mensajes enviados y recibidos', () => {
    const { transport, result } = setup();
    act(() => {
      result.current.send('Hola');
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.isTyping).toBe(true);

    act(() => transport.receive({ id: 'a1', content: 'Ho', status: 'streaming' }));
    expect(result.current.messages[1]).toMatchObject({ content: 'Ho', status: 'streaming' });
    act(() => transport.receive({ id: 'a1', content: 'Hola!' }));
    expect(result.current.messages[1]).toMatchObject({ content: 'Hola!', status: 'complete' });
    expect(result.current.isTyping).toBe(false);
  });

  it('expone retry y clear', () => {
    const { transport, result } = setup();
    transport.failNextSend = true;
    let id = '';
    act(() => {
      id = result.current.send('Hola')!.id;
    });
    expect(result.current.failedMessageIds).toEqual([id]);
    act(() => {
      expect(result.current.retry(id)).toBe(true);
    });
    expect(result.current.failedMessageIds).toEqual([]);
    act(() => result.current.clear());
    expect(result.current.messages).toEqual([]);
  });

  it('mantiene las mismas acciones entre renders', () => {
    const { transport, result } = setup();
    const { send, retry, clear } = result.current;
    act(() => transport.receive({ id: 'a1' }));
    expect(result.current.send).toBe(send);
    expect(result.current.retry).toBe(retry);
    expect(result.current.clear).toBe(clear);
  });

  it('sigue funcionando con StrictMode (monta, desmonta y vuelve a montar)', () => {
    const { transport, result } = setup(StrictMode);
    expect(transport.state).toBe('connected');
    act(() => {
      result.current.send('Hola');
    });
    expect(transport.sent).toHaveLength(1);
  });
});

describe('createChatStore', () => {
  it('crea el store con el transporte que dice la config', () => {
    const mock = createChatStore({ transport: 'mock' });
    const real = createChatStore({ transport: 'websocket', endpoint: 'ws://localhost' });
    expect(mock).toBeInstanceOf(ChatStore);
    // revisamos el transporte privado solo para confirmar que la factory eligio bien
    expect(Reflect.get(mock, 'transport')).toBeInstanceOf(MockWebSocketTransport);
    expect(Reflect.get(real, 'transport')).toBeInstanceOf(WebSocketTransport);
    mock.destroy();
    real.destroy();
  });
});
