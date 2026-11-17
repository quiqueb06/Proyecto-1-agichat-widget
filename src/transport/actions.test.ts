import { isOpenUrlAction } from './actions';

const action = { type: 'open_url', label: 'IMDb', url: 'https://www.imdb.com/title/tt0120737/' };
describe('acciones seguras', () => {
  it('acepta solo enlaces HTTPS a IMDb y volúmenes de Google Books', () => {
    for (const url of [
      action.url,
      'https://imdb.com/',
      'https://books.google.com/books?id=abc_1',
      'https://books.google.es/books?id=abc',
    ])
      expect(isOpenUrlAction({ ...action, url })).toBe(true);
  });
  it('rechaza payloads, esquemas, dominios, credenciales y redirecciones inválidas', () => {
    for (const value of [
      null,
      1,
      {},
      { ...action, type: 'execute' },
      { ...action, label: ' ' },
      { ...action, label: 'x'.repeat(81) },
      ...[
        'bad',
        'javascript:alert(1)',
        'http://www.imdb.com/',
        'https://www.imdb.com.evil.test/',
        'https://user@www.imdb.com/',
        'https://www.imdb.com:8443/',
        'https://www.imdb.com/offsite/',
        'https://www.imdb.com/?redirect=evil',
        'https://www.imdb.com/#x',
        'https://books.google.com/books',
        'https://books.google.com/books?id=a&redirect=evil',
        'https://books.google.com/books?id=a&id=b',
        'https://books.google.com/books?id=a#x',
        'https://books.google.com/redirect?id=a',
        'https://books.google.com/books?id=' + 'x'.repeat(2100),
      ].map((url) => ({ ...action, url })),
    ])
      expect(isOpenUrlAction(value)).toBe(false);
  });
});
