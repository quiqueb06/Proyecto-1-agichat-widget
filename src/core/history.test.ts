import type { Message } from '../types';
import { createLocalStorageHistory, DEFAULT_HISTORY_KEY } from './history';

// crea un mensaje valido rapido, cambiando solo lo que haga falta
function msg(id: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    role: 'user',
    content: id,
    createdAt: '2026-09-22T00:00:00.000Z',
    status: 'complete',
    ...extra,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('createLocalStorageHistory', () => {
  it('guarda y carga los mensajes completos con la llave por defecto', () => {
    const history = createLocalStorageHistory();
    history.save([msg('a'), msg('b', { status: 'streaming' }), msg('c')]);
    expect(JSON.parse(localStorage.getItem(DEFAULT_HISTORY_KEY)!)).toHaveLength(2);
    expect(history.load().map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('usa llaves distintas para chats distintos', () => {
    createLocalStorageHistory('uno').save([msg('a')]);
    expect(createLocalStorageHistory('dos').load()).toEqual([]);
    expect(createLocalStorageHistory('uno').load()).toEqual([msg('a')]);
  });

  it('se queda solo con los ultimos mensajes segun el limite', () => {
    const history = createLocalStorageHistory('k', { limit: 2 });
    history.save([msg('a'), msg('b'), msg('c')]);
    expect(history.load().map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('valida el limite', () => {
    expect(() => createLocalStorageHistory('k', { limit: 0 })).toThrow('limit');
    expect(() => createLocalStorageHistory('k', { limit: 1.5 })).toThrow('limit');
  });

  it('ignora datos corruptos o invalidos en el storage', () => {
    const history = createLocalStorageHistory('k');
    expect(history.load()).toEqual([]);
    localStorage.setItem('k', '{no es json');
    expect(history.load()).toEqual([]);
    localStorage.setItem('k', '{"a":1}');
    expect(history.load()).toEqual([]);
    localStorage.setItem('k', JSON.stringify([msg('a'), { id: 'x' }, null, msg('b')]));
    expect(history.load().map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('borra lo guardado con clear', () => {
    const history = createLocalStorageHistory('k');
    history.save([msg('a')]);
    history.clear();
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('no truena si localStorage falla (lleno o bloqueado)', () => {
    const history = createLocalStorageHistory('k');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => history.save([msg('a')])).not.toThrow();
    expect(() => history.clear()).not.toThrow();
  });

  it('funciona como historial vacio si no se puede leer localStorage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const history = createLocalStorageHistory('k');
    expect(history.load()).toEqual([]);
    expect(() => history.save([msg('a')])).not.toThrow();
    expect(() => history.clear()).not.toThrow();
  });

  it('funciona como historial vacio sin window (ssr)', () => {
    vi.stubGlobal('window', undefined);
    try {
      const history = createLocalStorageHistory('k');
      expect(history.load()).toEqual([]);
      expect(() => history.save([msg('a')])).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
