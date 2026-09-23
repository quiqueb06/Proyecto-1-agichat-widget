import { act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '../types';
import { AGIChat, createAGIChat } from './AGIChat';
import type { AGIChatInitOptions, AGIChatInstance } from './AGIChat';

// el widget vive en un shadow dom, entonces `screen` no lo ve:
// hay que buscar adentro del shadowRoot del host
function hosts() {
  return [...document.querySelectorAll<HTMLElement>('[data-agichat]')];
}
function inWidget(host = hosts()[0]!) {
  return within(host.shadowRoot!.firstElementChild as HTMLElement);
}

// init envuelto en act para que react termine de renderizar antes de revisar
function init(options: AGIChatInitOptions = { transport: 'mock' }): AGIChatInstance {
  let chat!: AGIChatInstance;
  act(() => {
    chat = AGIChat.init(options);
  });
  return chat;
}

// los listeners globales sobreviven a destroy, entonces cada test quita los suyos
const cleanups: (() => void)[] = [];
const listen: typeof AGIChat.on = (event, listener) => {
  const stop = AGIChat.on(event, listener);
  cleanups.push(stop);
  return stop;
};

afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
  act(() => AGIChat.destroy());
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('AGIChat (api global)', () => {
  it('on funciona antes de init y sigue escuchando despues de destroy e init', () => {
    const opened = vi.fn();
    // como en un <script> que corre antes de que el widget exista
    listen('open', opened);
    init({ transport: 'mock', defaultOpen: false });
    act(() => AGIChat.open());
    act(() => AGIChat.destroy());
    init();
    act(() => AGIChat.open());
    expect(opened).toHaveBeenCalledTimes(2);
    AGIChat.off('open', opened);
    act(() => AGIChat.close());
    act(() => AGIChat.open());
    expect(opened).toHaveBeenCalledTimes(2);
  });

  it('monta el widget dentro de un shadow dom en el body', () => {
    init({ transport: 'mock', title: 'Soporte' });
    expect(hosts()).toHaveLength(1);
    const host = hosts()[0]!;
    expect(host.parentElement).toBe(document.body);
    expect(host.shadowRoot).not.toBeNull();
    // los estilos van adentro del shadow root, no en la pagina del cliente
    expect(host.shadowRoot!.querySelector('style')).not.toBeNull();
    expect(document.head.querySelector('style')).toBeNull();
    expect(inWidget().getByRole('button', { name: 'Abrir chat' })).toBeInTheDocument();
  });

  it('open, close y toggle cambian la ventana y avisan con eventos', () => {
    init();
    const opened = vi.fn();
    const closed = vi.fn();
    listen('open', opened);
    listen('close', closed);

    act(() => AGIChat.open());
    expect(AGIChat.isOpen()).toBe(true);
    expect(inWidget().getByRole('dialog')).toBeInTheDocument();
    // abrir otra vez no repite el evento
    act(() => AGIChat.open());
    expect(opened).toHaveBeenCalledTimes(1);

    act(() => AGIChat.toggle());
    expect(AGIChat.isOpen()).toBe(false);
    expect(inWidget().queryByRole('dialog')).not.toBeInTheDocument();
    act(() => AGIChat.toggle());
    act(() => AGIChat.close());
    expect(opened).toHaveBeenCalledTimes(2);
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('los botones del widget tambien disparan open/close', async () => {
    init();
    const user = userEvent.setup();
    const opened = vi.fn();
    const closed = vi.fn();
    listen('open', opened);
    listen('close', closed);
    await user.click(inWidget().getByRole('button', { name: 'Abrir chat' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(AGIChat.isOpen()).toBe(true);
    await user.click(inWidget().getByRole('button', { name: 'Cerrar chat' }));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(AGIChat.isOpen()).toBe(false);
  });

  it("on('message') recibe el mensaje del usuario y la respuesta completa del mock", async () => {
    vi.useFakeTimers();
    init({
      transport: 'mock',
      mock: { delayMs: 10, chunkIntervalMs: 5, chunkSize: 4, response: '**Hola**' },
    });
    const messages: Message[] = [];
    const states: string[] = [];
    listen('message', (m) => messages.push(m));
    listen('state', (s) => states.push(s));

    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(states).toContain('connected');
    act(() => {
      AGIChat.send('Hola');
    });
    await act(() => vi.runAllTimersAsync());
    // solo llegan mensajes completos, no cada pedacito del streaming
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Hola'],
      ['assistant', '**Hola**'],
    ]);
  });

  it("on('error') avisa cuando no se puede enviar y off deja de escuchar", () => {
    init();
    const errors = vi.fn();
    const stop = listen('error', errors);
    // todavia no conecta (el mock tarda), entonces el envio falla
    act(() => {
      AGIChat.send('Hola');
    });
    expect(errors).toHaveBeenCalledTimes(1);
    stop();
    AGIChat.off('error', errors);
    act(() => {
      AGIChat.send('otra vez');
    });
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('init otra vez reemplaza el widget anterior en lugar de duplicarlo', () => {
    const first = init();
    const second = init({ transport: 'mock', defaultOpen: true });
    expect(second).not.toBe(first);
    expect(hosts()).toHaveLength(1);
    expect(AGIChat.isOpen()).toBe(true);
    expect(inWidget().getByRole('dialog')).toBeInTheDocument();
  });

  it('destroy quita todo, es idempotente y despues las acciones piden init', () => {
    const chat = init();
    const closed = vi.fn();
    chat.on('close', closed);
    act(() => AGIChat.destroy());
    act(() => AGIChat.destroy());
    expect(hosts()).toHaveLength(0);
    expect(AGIChat.isOpen()).toBe(false);
    expect(() => AGIChat.open()).toThrow('AGIChat no está inicializado');
    expect(() => AGIChat.close()).toThrow('AGIChat no está inicializado');
    expect(() => AGIChat.toggle()).toThrow('AGIChat no está inicializado');
    expect(() => AGIChat.send('x')).toThrow('AGIChat no está inicializado');
    // la instancia vieja ya no hace nada
    chat.open();
    chat.destroy();
    expect(chat.isOpen()).toBe(false);
    expect(chat.send('x')).toBeNull();
    expect(closed).not.toHaveBeenCalled();
  });
});

it('destroy directo en la instancia tambien limpia la api global', () => {
  const first = init();
  const second = init();
  // destruir una instancia vieja no afecta a la actual
  act(() => first.destroy());
  expect(() => AGIChat.open()).not.toThrow();
  act(() => second.destroy());
  expect(hosts()).toHaveLength(0);
  expect(() => AGIChat.open()).toThrow('AGIChat no está inicializado');
});

describe('createAGIChat', () => {
  it('monta en un selector o elemento propio y permite varios chats a la vez', () => {
    document.body.innerHTML = '<div id="soporte"></div><section class="ventas"></section>';
    const section = document.querySelector<HTMLElement>('.ventas')!;
    let a!: AGIChatInstance;
    let b!: AGIChatInstance;
    act(() => {
      a = createAGIChat({ transport: 'mock', target: '#soporte', title: 'Soporte' });
      b = createAGIChat({ transport: 'mock', target: section, title: 'Ventas', defaultOpen: true });
    });
    expect(document.querySelector('#soporte [data-agichat]')).not.toBeNull();
    expect(section.querySelector('[data-agichat]')).not.toBeNull();
    expect(inWidget(hosts()[1]).getByRole('dialog', { name: 'Ventas' })).toBeInTheDocument();
    expect(a.isOpen()).toBe(false);
    expect(b.isOpen()).toBe(true);
    act(() => {
      a.destroy();
      b.destroy();
    });
    expect(hosts()).toHaveLength(0);
  });

  it('cada instancia tiene sus propios eventos con on y off', () => {
    let chat!: AGIChatInstance;
    act(() => {
      chat = createAGIChat({ transport: 'mock' });
    });
    const opened = vi.fn();
    const stop = chat.on('open', opened);
    act(() => chat.open());
    chat.off('open', opened);
    stop();
    act(() => chat.toggle());
    act(() => chat.toggle());
    expect(opened).toHaveBeenCalledTimes(1);
    act(() => chat.destroy());
  });

  it('falla con un mensaje claro si el selector no existe', () => {
    expect(() => createAGIChat({ transport: 'mock', target: '#no-existe' })).toThrow(
      'no se encontró el elemento "#no-existe"',
    );
    expect(hosts()).toHaveLength(0);
  });

  it('acepta estilos propios y carga el historial guardado', () => {
    localStorage.setItem(
      'k',
      JSON.stringify([
        {
          id: 'x',
          role: 'assistant',
          content: 'de la visita anterior',
          createdAt: '2026-09-22T00:00:00.000Z',
          status: 'complete',
        },
      ]),
    );
    let chat!: AGIChatInstance;
    act(() => {
      chat = createAGIChat({
        transport: 'mock',
        styles: '.x{}',
        persistHistory: 'k',
        defaultOpen: true,
      });
    });
    expect(hosts()[0]!.shadowRoot!.querySelector('style')!.textContent).toBe('.x{}');
    expect(inWidget().getByText('de la visita anterior')).toBeInTheDocument();
    act(() => chat.destroy());
  });
});
