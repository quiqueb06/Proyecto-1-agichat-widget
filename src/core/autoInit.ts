import { AGIChat } from './AGIChat';
import type { AGIChatInitOptions } from './AGIChat';
import type { Theme, WidgetUIOptions } from './types';

const THEMES: readonly Theme[] = ['light', 'dark', 'auto'];

// los data-* booleanos: <script data-open> o data-open="true" = true, data-open="false" = false
function isTrue(value: string): boolean {
  return value === '' || value === 'true';
}

// lee la config desde los atributos data-* del <script> que carga el sdk, ej:
// <script src="agichat.embed.js" data-transport="mock" data-title="Soporte"></script>
// si no hay data-transport devuelve null (el cliente va a llamar AGIChat.init() a mano).
// si la config esta mal lanza un error con un mensaje claro
export function readScriptConfig(script: Element | null): AGIChatInitOptions | null {
  if (!(script instanceof HTMLElement)) return null;
  const data = script.dataset;
  if (data.transport === undefined) return null;

  // opciones de interfaz, solo se agregan las que vienen en el script
  const ui: WidgetUIOptions & {
    target?: string;
    defaultOpen?: boolean;
    persistHistory?: boolean | string;
  } = {};
  if (data.title !== undefined) ui.title = data.title;
  if (data.placeholder !== undefined) ui.placeholder = data.placeholder;
  if (data.welcomeMessage !== undefined) ui.welcomeMessage = data.welcomeMessage;
  if (data.target !== undefined) ui.target = data.target;
  if (data.open !== undefined) ui.defaultOpen = isTrue(data.open);
  if (data.theme !== undefined) {
    if (!THEMES.includes(data.theme as Theme))
      throw new Error(`AGIChat: data-theme debe ser ${THEMES.join(', ')}.`);
    ui.theme = data.theme as Theme;
  }
  // data-persist-history sin valor o "true" = llave por defecto, otro texto = esa llave
  if (data.persistHistory !== undefined) {
    const value = data.persistHistory;
    ui.persistHistory = isTrue(value) ? true : value === 'false' ? false : value;
  }

  if (data.transport === 'mock') return { ...ui, transport: 'mock' };
  if (data.transport === 'websocket') {
    if (!data.endpoint)
      throw new Error('AGIChat: data-transport="websocket" necesita data-endpoint.');
    return { ...ui, transport: 'websocket', endpoint: data.endpoint };
  }
  throw new Error('AGIChat: data-transport debe ser "mock" o "websocket".');
}

// arranca el widget solo si el <script> trae data-transport
export function autoInit(script: Element | null): void {
  let options: AGIChatInitOptions | null;
  try {
    options = readScriptConfig(script);
  } catch (error) {
    // no se lanza para no romper la pagina del cliente, solo se avisa en consola
    console.error(error);
    return;
  }
  if (!options) return;
  const config = options;
  const start = () => {
    try {
      AGIChat.init(config);
    } catch (error) {
      console.error(error);
    }
  };
  // si el <script> esta en el body y no hay data-target, el body ya existe y se monta de una
  // (asi AGIChat.open() funciona justo despues del script). si no, se espera a que cargue
  const canStartNow =
    document.readyState !== 'loading' || (config.target === undefined && document.body !== null);
  if (canStartNow) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
