import { createElement } from 'react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { Message } from '../types';
import { AGIChatWidget } from './AGIChatWidget';
import type { ChatStoreEvents } from './ChatStore';
import { createEmitter } from './emitter';
import type { Listener } from './emitter';
import { createStoreFromOptions } from './options';
import type { AGIChatOptions, ChatViewProps } from './types';

// opciones de AGIChat.init(): las del widget + donde montarlo
export type AGIChatInitOptions = AGIChatOptions & {
  // elemento o selector css donde se monta el widget (por defecto document.body)
  target?: HTMLElement | string;
  // si el chat arranca abierto
  defaultOpen?: boolean;
  // vista propia (contrato ChatViewProps), por defecto la minima
  view?: ComponentType<ChatViewProps>;
  // css propio para reemplazar los estilos por defecto
  styles?: string;
};

// eventos publicos del sdk: los del store + abrir/cerrar la ventana
export type AGIChatEvents = ChatStoreEvents & {
  open: void;
  close: void;
};

// lo que devuelve init(): una instancia del widget ya montada en la pagina
export interface AGIChatInstance {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  // manda un mensaje como si el usuario lo hubiera escrito
  send(text: string): Message | null;
  on<K extends keyof AGIChatEvents>(event: K, listener: Listener<AGIChatEvents[K]>): () => void;
  off<K extends keyof AGIChatEvents>(event: K, listener: Listener<AGIChatEvents[K]>): void;
  // quita el widget de la pagina y cierra la conexion
  destroy(): void;
}

// busca el elemento donde se va a montar el widget
function resolveTarget(target: AGIChatInitOptions['target']): HTMLElement {
  if (target instanceof HTMLElement) return target;
  if (typeof target === 'string') {
    const element = document.querySelector<HTMLElement>(target);
    if (!element) throw new Error(`AGIChat: no se encontró el elemento "${target}".`);
    return element;
  }
  return document.body;
}

// crea y monta un widget. se puede usar directo si alguien quiere varios chats en la misma pagina
export function createAGIChat(options: AGIChatInitOptions): AGIChatInstance {
  const { target, defaultOpen = false, ...widgetOptions } = options;

  // el widget vive dentro de un shadow dom: asi el css de la pagina del cliente no lo rompe
  // y nuestro css no se sale a su pagina. las variables --agichat-* si pasan, para el tema
  const host = document.createElement('div');
  host.setAttribute('data-agichat', '');
  resolveTarget(target).appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  shadow.appendChild(container);
  const root = createRoot(container);

  const store = createStoreFromOptions(widgetOptions);
  const events = createEmitter<AGIChatEvents>();
  // los eventos del store se reenvian tal cual a quien use AGIChat.on(...)
  store.on('message', (message) => events.emit('message', message));
  store.on('state', (state) => events.emit('state', state));
  store.on('error', (error) => events.emit('error', error));

  let isOpen = defaultOpen;
  let destroyed = false;

  // react se vuelve a renderizar con el estado de abierto/cerrado de esta instancia
  const render = () => {
    root.render(
      createElement(AGIChatWidget, {
        ...widgetOptions,
        store,
        open: isOpen,
        onOpenChange: setOpen,
      }),
    );
  };

  // unico lugar donde cambia abierto/cerrado (lo usan los botones y la api)
  function setOpen(next: boolean) {
    if (destroyed || next === isOpen) return;
    isOpen = next;
    render();
    events.emit(next ? 'open' : 'close', undefined);
  }

  render();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    isOpen: () => isOpen,
    send: (text) => store.send(text),
    on: (event, listener) => events.on(event, listener),
    off: (event, listener) => events.off(event, listener),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.unmount();
      store.destroy();
      events.clear();
      host.remove();
    },
  };
}

// el widget que se creo con init() (solo puede haber uno a la vez con la api global)
let current: AGIChatInstance | null = null;

// listeners de AGIChat.on(...). viven aqui y no en la instancia para que se puedan
// registrar antes de init (ej. un <script> justo despues del sdk) y sigan despues de re-init
const globalEvents = createEmitter<AGIChatEvents>();

function instance(): AGIChatInstance {
  if (!current) throw new Error('AGIChat no está inicializado. Llama a AGIChat.init() primero.');
  return current;
}

// api publica del sdk: AGIChat.init({...}), AGIChat.open(), AGIChat.on('message', ...), etc.
export const AGIChat = {
  // monta el widget. si ya habia uno, lo quita primero (asi llamar init dos veces no duplica)
  init(options: AGIChatInitOptions): AGIChatInstance {
    current?.destroy();
    const chat = createAGIChat(options);
    // lo que pase en la instancia se reenvia a los listeners globales
    chat.on('message', (message) => globalEvents.emit('message', message));
    chat.on('state', (state) => globalEvents.emit('state', state));
    chat.on('error', (error) => globalEvents.emit('error', error));
    chat.on('open', () => globalEvents.emit('open', undefined));
    chat.on('close', () => globalEvents.emit('close', undefined));
    // si alguien hace destroy() directo en la instancia, la api global tambien se entera
    const instanceWithCleanup: AGIChatInstance = {
      ...chat,
      destroy() {
        chat.destroy();
        if (current === instanceWithCleanup) current = null;
      },
    };
    current = instanceWithCleanup;
    return current;
  },
  open: (): void => instance().open(),
  close: (): void => instance().close(),
  toggle: (): void => instance().toggle(),
  isOpen: (): boolean => current?.isOpen() ?? false,
  send: (text: string): Message | null => instance().send(text),
  // se puede llamar antes de init; el listener sigue registrado aunque se haga destroy e init
  on<K extends keyof AGIChatEvents>(event: K, listener: Listener<AGIChatEvents[K]>): () => void {
    return globalEvents.on(event, listener);
  },
  off<K extends keyof AGIChatEvents>(event: K, listener: Listener<AGIChatEvents[K]>): void {
    globalEvents.off(event, listener);
  },
  // quita el widget (los listeners de on se quedan). si no habia ninguno no pasa nada
  destroy(): void {
    current?.destroy();
    current = null;
  },
};
