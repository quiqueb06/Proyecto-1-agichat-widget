import { createStoreFromOptions } from './options';

afterEach(() => localStorage.clear());

describe('createStoreFromOptions', () => {
  const saved = JSON.stringify([
    {
      id: 'x',
      role: 'assistant',
      content: 'guardado',
      createdAt: '2026-09-22T00:00:00.000Z',
      status: 'complete',
    },
  ]);

  it('sin persistHistory no lee ni guarda nada', () => {
    localStorage.setItem('agichat:history', saved);
    const store = createStoreFromOptions({ transport: 'mock' });
    expect(store.getSnapshot().messages).toEqual([]);
    store.destroy();
  });

  it('con true usa la llave por defecto y con string usa esa llave', () => {
    localStorage.setItem('agichat:history', saved);
    localStorage.setItem('mi-llave', saved);
    const byDefault = createStoreFromOptions({ transport: 'mock', persistHistory: true });
    const custom = createStoreFromOptions({ transport: 'mock', persistHistory: 'mi-llave' });
    expect(byDefault.getSnapshot().messages).toHaveLength(1);
    expect(custom.getSnapshot().messages).toHaveLength(1);
    localStorage.removeItem('mi-llave');
    expect(
      createStoreFromOptions({ transport: 'mock', persistHistory: 'mi-llave' }).getSnapshot()
        .messages,
    ).toEqual([]);
  });
});
