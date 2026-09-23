// punto de entrada del script embebible (dist/agichat.embed.js).
// este build trae react adentro, asi cualquier pagina lo puede usar con un <script>
// sin instalar nada. todo lo que se exporta aqui queda en window.AGIChat
import { AGIChat } from './core/AGIChat';
import { autoInit } from './core/autoInit';

export { VERSION } from './version';
export { createAGIChat } from './core/AGIChat';

// window.AGIChat.init(...), window.AGIChat.open(), etc.
// (los metodos no usan `this`, por eso se pueden sacar del objeto)
export const { init, open, close, toggle, isOpen, send, on, off, destroy } = AGIChat;

// document.currentScript solo existe mientras el script se esta ejecutando,
// por eso se lee aqui arriba y no despues
autoInit(document.currentScript);
