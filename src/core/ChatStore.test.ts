import { FakeTransport } from '../test/FakeTransport';
import { MockWebSocketTransport } from '../transport';
import type { Message } from '../types';
import { ChatStore } from './ChatStore';

// arma un store con el transporte falso y un espia para ver cuando cambia el estado
function setup() {
  const transport = new FakeTransport();
  const store = new ChatStore(transport);
  const onChange = vi.fn();
  store.subscribe(onChange);
  return { transport, store, onChange };
}

describe('ChatStore', () => {
  it('parte del estado actual del transporte y lo sigue', () => {
    const { transport, store } = setup();
    const states = vi.fn();
    store.on('state', states);
    expect(store.getSnapshot()).toEqual({
      messages: [],
      connectionState: 'disconnected',
      isTyping: false,
      failedMessageIds: [],
      error: null,
    });
    store.connect();
    expect(store.getSnapshot().connectionState).toBe('connected');
    transport.changeState('reconnecting');
    expect(store.getSnapshot().connectionState).toBe('reconnecting');
    store.disconnect();
    expect(states.mock.calls.map(([state]) => state)).toEqual([
      'connected',
      'reconnecting',
      'disconnected',
    ]);
  });

  it('agrega y envía el mensaje del usuario, ignorando texto vacío', () => {
    const { transport, store, onChange } = setup();
    const messages = vi.fn();
    store.on('message', messages);
    store.connect();
    onChange.mockClear();

    expect(store.send('   ')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    const sent = store.send('  Hola  ');
    expect(sent).toMatchObject({ role: 'user', content: 'Hola', status: 'complete' });
    expect(Number.isFinite(Date.parse(sent!.createdAt))).toBe(true);
    expect(transport.sent).toEqual([sent]);
    expect(store.getSnapshot().messages).toEqual([sent]);
    expect(store.getSnapshot().isTyping).toBe(true);
    expect(messages).toHaveBeenCalledWith(sent);
  });

  it('reemplaza por id los fragmentos en streaming y deja de escribir al completar', () => {
    const { transport, store } = setup();
    const messages = vi.fn();
    store.on('message', messages);
    store.connect();
    store.send('Hola');
    const before = store.getSnapshot();

    transport.receive({ id: 'a1', content: '**Ho', status: 'streaming' });
    expect(store.getSnapshot().isTyping).toBe(true);
    transport.receive({ id: 'a1', content: '**Hola**', status: 'complete' });

    const state = store.getSnapshot();
    expect(state).not.toBe(before);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]).toMatchObject({ id: 'a1', content: '**Hola**' });
    expect(state.isTyping).toBe(false);
    expect(messages).toHaveBeenCalledTimes(2);

    // si el server repite el mismo 'complete' no se vuelve a avisar ni se descuenta otra vez
    transport.receive({ id: 'a1', content: '**Hola**', status: 'complete' });
    expect(messages).toHaveBeenCalledTimes(2);
  });

  it('mantiene "escribiendo" hasta que se completan todas las respuestas pendientes', () => {
    const { transport, store } = setup();
    store.connect();
    store.send('uno');
    store.send('dos');
    transport.receive({ id: 'a1' });
    expect(store.getSnapshot().isTyping).toBe(true);
    transport.receive({ id: 'a2' });
    expect(store.getSnapshot().isTyping).toBe(false);
    // mensajes que no esperabamos (ej. avisos del sistema) no dejan el contador en negativo
    transport.receive({ id: 's1', role: 'system' });
    transport.receive({ id: 'a3' });
    store.send('tres');
    expect(store.getSnapshot().isTyping).toBe(true);
  });

  it('cierra las respuestas en curso si se interrumpe la conexión', () => {
    const { transport, store } = setup();
    store.connect();
    store.send('Hola');
    transport.receive({ id: 'a1', content: 'Parcial', status: 'streaming' });
    const messages = store.getSnapshot().messages;

    transport.changeState('reconnecting');
    const state = store.getSnapshot();
    expect(state.isTyping).toBe(false);
    expect(state.messages[1]).toMatchObject({ content: 'Parcial', status: 'complete' });
    expect(state.messages[0]).toBe(messages[0]);

    // si no hay nada en streaming el historial sigue siendo el mismo arreglo
    transport.changeState('error');
    expect(store.getSnapshot().messages).toBe(state.messages);
  });

  it('marca como fallido un envío sin conexión y lo reintenta con el mismo id', () => {
    const { transport, store } = setup();
    const errors = vi.fn();
    const messages = vi.fn();
    store.on('error', errors);
    store.on('message', messages);

    const failed = store.send('Hola')!;
    let state = store.getSnapshot();
    expect(state.messages).toEqual([failed]);
    expect(state.failedMessageIds).toEqual([failed.id]);
    expect(state.isTyping).toBe(false);
    expect(state.error?.message).toMatch('no está conectado');
    expect(errors).toHaveBeenCalledTimes(1);
    expect(messages).not.toHaveBeenCalled();

    store.connect();
    expect(store.getSnapshot().error).toBeNull();
    expect(store.retry(failed.id)).toBe(true);
    state = store.getSnapshot();
    expect(state.failedMessageIds).toEqual([]);
    expect(state.messages).toEqual([failed]);
    expect(transport.sent.map((m) => m.id)).toEqual([failed.id]);
    expect(state.isTyping).toBe(true);
    expect(messages).toHaveBeenCalledWith(failed);
  });

  it('vuelve a marcar como fallido un reintento que falla', () => {
    const { transport, store } = setup();
    store.connect();
    transport.failNextSend = true;
    const failed = store.send('Hola')!;
    expect(store.getSnapshot().failedMessageIds).toEqual([failed.id]);

    transport.failNextSend = true;
    expect(store.retry(failed.id)).toBe(false);
    expect(store.getSnapshot().failedMessageIds).toEqual([failed.id]);
    expect(store.retry('desconocido')).toBe(false);
  });

  it('ignora el reintento si el historial se vació', () => {
    const { store } = setup();
    const failed = store.send('Hola')!;
    store.clear();
    expect(store.retry(failed.id)).toBe(false);
  });

  it('guarda el error del servidor y lo limpia con un envío exitoso', () => {
    const { transport, store } = setup();
    store.connect();
    transport.receiveError('Servidor ocupado');
    expect(store.getSnapshot().error?.message).toBe('Servidor ocupado');
    store.send('Hola');
    expect(store.getSnapshot().error).toBeNull();
  });

  it('vacía el historial con clear', () => {
    const { transport, store } = setup();
    store.connect();
    store.send('Hola');
    transport.receiveError('x');
    store.clear();
    expect(store.getSnapshot()).toMatchObject({
      messages: [],
      failedMessageIds: [],
      isTyping: false,
      error: null,
    });
  });

  it('destroy libera el transporte, los listeners y es idempotente', () => {
    const { transport, store, onChange } = setup();
    const messages = vi.fn();
    store.on('message', messages);
    store.connect();
    const unsubscribe = store.subscribe(vi.fn());
    const disconnect = vi.spyOn(transport, 'disconnect');

    store.destroy();
    store.destroy();
    unsubscribe();
    expect(disconnect).toHaveBeenCalledTimes(1);

    onChange.mockClear();
    transport.receive({ id: 'a1' });
    store.connect();
    expect(transport.state).toBe('disconnected');
    expect(store.send('Hola')).toBeNull();
    expect(store.retry('a1')).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(messages).not.toHaveBeenCalled();
  });

  it('permite dejar de escuchar eventos con off o con la función devuelta', () => {
    const { transport, store } = setup();
    const a = vi.fn();
    const b = vi.fn();
    const stop = store.on('state', a);
    store.on('state', b);
    stop();
    store.off('state', b);
    transport.changeState('connected');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('funciona de punta a punta con el mock de WebSocket', () => {
    // aqui si usamos el mock real de persona 2, con timers falsos para no esperar de verdad
    vi.useFakeTimers();
    try {
      const store = new ChatStore(
        new MockWebSocketTransport({
          delayMs: 10,
          chunkIntervalMs: 5,
          chunkSize: 4,
          response: '**Hola**',
        }),
      );
      const completed: Message[] = [];
      store.on('message', (m) => completed.push(m));
      store.connect();
      vi.advanceTimersByTime(10);
      store.send('Hola');
      vi.advanceTimersByTime(10);
      expect(store.getSnapshot().messages[1]).toMatchObject({
        content: '**Ho',
        status: 'streaming',
      });
      expect(store.getSnapshot().isTyping).toBe(true);
      vi.runAllTimers();
      expect(store.getSnapshot().messages[1]).toMatchObject({
        role: 'assistant',
        content: '**Hola**',
        status: 'complete',
      });
      expect(store.getSnapshot().isTyping).toBe(false);
      expect(completed.map((m) => m.role)).toEqual(['user', 'assistant']);
      store.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ChatStore con historial', () => {
  // historial en memoria para ver que se guarda y cuando
  function memoryHistory(initial: Message[] = []) {
    let saved = initial;
    return {
      load: vi.fn(() => saved),
      save: vi.fn((messages: readonly Message[]) => {
        saved = [...messages];
      }),
      clear: vi.fn(() => {
        saved = [];
      }),
      get saved() {
        return saved;
      },
    };
  }

  const old: Message = {
    id: 'old',
    role: 'assistant',
    content: 'de antes',
    createdAt: '2026-09-21T00:00:00.000Z',
    status: 'complete',
  };

  it('arranca con los mensajes guardados', () => {
    const history = memoryHistory([old]);
    const store = new ChatStore(new FakeTransport(), { history });
    expect(store.getSnapshot().messages).toEqual([old]);
  });

  it('guarda al enviar y al completar una respuesta, no en cada fragmento', () => {
    const history = memoryHistory();
    const transport = new FakeTransport();
    const store = new ChatStore(transport, { history });
    store.connect();
    const sent = store.send('Hola')!;
    expect(history.save).toHaveBeenCalledTimes(1);
    transport.receive({ id: 'a1', content: 'Ho', status: 'streaming' });
    transport.receive({ id: 'a1', content: 'Hol', status: 'streaming' });
    expect(history.save).toHaveBeenCalledTimes(1);
    transport.receive({ id: 'a1', content: 'Hola' });
    expect(history.save).toHaveBeenCalledTimes(2);
    expect(history.saved.map((m) => m.id)).toEqual([sent.id, 'a1']);
  });

  it('no guarda mensajes fallidos hasta que el reintento funciona', () => {
    const history = memoryHistory();
    const transport = new FakeTransport();
    const store = new ChatStore(transport, { history });
    store.connect();
    store.send('primero');
    transport.failNextSend = true;
    const failed = store.send('Hola')!;
    transport.receive({ id: 'a1' });
    expect(history.saved.map((m) => m.id)).not.toContain(failed.id);
    store.retry(failed.id);
    expect(history.saved.map((m) => m.id)).toContain(failed.id);
  });

  it('guarda las respuestas cortadas por una desconexion', () => {
    const history = memoryHistory();
    const transport = new FakeTransport();
    const store = new ChatStore(transport, { history });
    store.connect();
    transport.receive({ id: 'a1', content: 'Parcial', status: 'streaming' });
    transport.changeState('reconnecting');
    expect(history.saved).toEqual([expect.objectContaining({ id: 'a1', status: 'complete' })]);
    history.save.mockClear();
    // sin nada en streaming no hace falta volver a guardar
    transport.changeState('error');
    expect(history.save).not.toHaveBeenCalled();
  });

  it('clear tambien borra el historial guardado', () => {
    const history = memoryHistory([old]);
    const store = new ChatStore(new FakeTransport(), { history });
    store.clear();
    expect(history.clear).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().messages).toEqual([]);
  });
});
