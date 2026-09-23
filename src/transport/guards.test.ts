import { isMessage } from './guards';

describe('isMessage', () => {
  const valid = {
    id: 'm1',
    role: 'assistant',
    content: 'Hola',
    createdAt: '2026-09-22T00:00:00.000Z',
    status: 'complete',
  };

  it('acepta un mensaje valido', () => {
    expect(isMessage(valid)).toBe(true);
    expect(isMessage({ ...valid, role: 'system', status: 'streaming' })).toBe(true);
  });

  it('rechaza valores que no tienen forma de mensaje', () => {
    for (const value of [
      null,
      'texto',
      { ...valid, id: '' },
      { ...valid, role: 'bot' },
      { ...valid, content: 1 },
      { ...valid, createdAt: 'ayer' },
      { ...valid, status: 'error' },
    ])
      expect(isMessage(value)).toBe(false);
  });
});
