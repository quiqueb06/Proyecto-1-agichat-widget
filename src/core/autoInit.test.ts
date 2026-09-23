import { act } from '@testing-library/react';
import { AGIChat } from './AGIChat';
import { autoInit, readScriptConfig } from './autoInit';

// crea un <script> con los data-* que se le pasen, como lo pondria un cliente
function script(attributes: Record<string, string> = {}) {
  const element = document.createElement('script');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

afterEach(() => {
  act(() => AGIChat.destroy());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('readScriptConfig', () => {
  it('sin script o sin data-transport no hace nada (init manual)', () => {
    expect(readScriptConfig(null)).toBeNull();
    expect(readScriptConfig(script())).toBeNull();
    // un elemento que no es html (ej. svg) tampoco
    expect(
      readScriptConfig(document.createElementNS('http://www.w3.org/2000/svg', 'script')),
    ).toBeNull();
  });

  it('lee el mock con todas las opciones de interfaz', () => {
    expect(
      readScriptConfig(
        script({
          'data-transport': 'mock',
          'data-title': 'Soporte',
          'data-placeholder': 'Pregunta algo',
          'data-welcome-message': 'Hola!',
          'data-target': '#chat',
          'data-theme': 'dark',
          'data-open': '',
          'data-persist-history': '',
        }),
      ),
    ).toEqual({
      transport: 'mock',
      title: 'Soporte',
      placeholder: 'Pregunta algo',
      welcomeMessage: 'Hola!',
      target: '#chat',
      theme: 'dark',
      defaultOpen: true,
      persistHistory: true,
    });
  });

  it('lee el websocket real con su endpoint', () => {
    expect(
      readScriptConfig(
        script({ 'data-transport': 'websocket', 'data-endpoint': 'wss://example.test/chat' }),
      ),
    ).toEqual({ transport: 'websocket', endpoint: 'wss://example.test/chat' });
  });

  it('interpreta true/false y llaves propias del historial', () => {
    const read = (attributes: Record<string, string>) =>
      readScriptConfig(script({ 'data-transport': 'mock', ...attributes }));
    expect(read({ 'data-open': 'true' })).toMatchObject({ defaultOpen: true });
    expect(read({ 'data-open': 'false' })).toMatchObject({ defaultOpen: false });
    expect(read({ 'data-persist-history': 'true' })).toMatchObject({ persistHistory: true });
    expect(read({ 'data-persist-history': 'false' })).toMatchObject({ persistHistory: false });
    expect(read({ 'data-persist-history': 'mi-chat' })).toMatchObject({
      persistHistory: 'mi-chat',
    });
  });

  it('lanza errores claros con config invalida', () => {
    expect(() => readScriptConfig(script({ 'data-transport': 'http' }))).toThrow(
      'data-transport debe ser "mock" o "websocket"',
    );
    expect(() => readScriptConfig(script({ 'data-transport': 'websocket' }))).toThrow(
      'necesita data-endpoint',
    );
    expect(() =>
      readScriptConfig(script({ 'data-transport': 'mock', 'data-theme': 'rosa' })),
    ).toThrow('data-theme debe ser light, dark, auto');
  });
});

describe('autoInit', () => {
  it('monta el widget de una vez si la pagina ya cargo', () => {
    act(() => autoInit(script({ 'data-transport': 'mock', 'data-open': '' })));
    expect(document.querySelector('[data-agichat]')).not.toBeNull();
    expect(AGIChat.isOpen()).toBe(true);
  });

  it('con la pagina cargando monta de una si ya existe el body', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    act(() => autoInit(script({ 'data-transport': 'mock' })));
    expect(document.querySelector('[data-agichat]')).not.toBeNull();
  });

  it('con data-target espera a DOMContentLoaded para que exista el elemento', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    act(() => autoInit(script({ 'data-transport': 'mock', 'data-target': '#chat' })));
    expect(document.querySelector('[data-agichat]')).toBeNull();
    // el elemento aparece cuando termina de cargar el html
    document.body.innerHTML = '<div id="chat"></div>';
    act(() => {
      document.dispatchEvent(new Event('DOMContentLoaded'));
    });
    expect(document.querySelector('#chat [data-agichat]')).not.toBeNull();
  });

  it('sin data-transport no monta nada', () => {
    autoInit(script());
    autoInit(null);
    expect(document.querySelector('[data-agichat]')).toBeNull();
  });

  it('con config invalida avisa en consola sin romper la pagina', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => autoInit(script({ 'data-transport': 'nada' }))).not.toThrow();
    // target que no existe: el error sale al montar, tambien solo en consola
    expect(() =>
      autoInit(script({ 'data-transport': 'mock', 'data-target': '#no-existe' })),
    ).not.toThrow();
    expect(error).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-agichat]')).toBeNull();
  });
});
