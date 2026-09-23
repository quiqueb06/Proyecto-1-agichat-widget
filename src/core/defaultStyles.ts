// estilos minimos de la vista por defecto, mientras persona 4 termina los suyos.
// todo sale de variables --agichat-*, asi el cliente puede cambiar colores desde su pagina
// (las variables css si atraviesan el shadow dom). van como string para poder meterlos
// en un <style> dentro del widget, sin depender de que el cliente importe un .css
export const DEFAULT_STYLES = `
.agichat {
  --_primary: var(--agichat-primary, #4f46e5);
  --_on-primary: var(--agichat-on-primary, #ffffff);
  --_bg: var(--agichat-bg, #ffffff);
  --_surface: var(--agichat-surface, #f3f4f6);
  --_text: var(--agichat-text, #111827);
  --_muted: var(--agichat-muted, #6b7280);
  --_danger: var(--agichat-danger, #b91c1c);
  --_radius: var(--agichat-radius, 16px);
  --_font: var(--agichat-font, system-ui, -apple-system, 'Segoe UI', sans-serif);
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483000;
  font-family: var(--_font);
  font-size: 14px;
  line-height: 1.45;
  color: var(--_text);
}
.agichat[data-theme='dark'] {
  --_bg: var(--agichat-bg, #111827);
  --_surface: var(--agichat-surface, #1f2937);
  --_text: var(--agichat-text, #f9fafb);
  --_muted: var(--agichat-muted, #9ca3af);
  --_danger: var(--agichat-danger, #f87171);
}
@media (prefers-color-scheme: dark) {
  .agichat[data-theme='auto'] {
    --_bg: var(--agichat-bg, #111827);
    --_surface: var(--agichat-surface, #1f2937);
    --_text: var(--agichat-text, #f9fafb);
    --_muted: var(--agichat-muted, #9ca3af);
    --_danger: var(--agichat-danger, #f87171);
  }
}
.agichat *, .agichat *::before, .agichat *::after { box-sizing: border-box; }
.agichat button, .agichat textarea { font: inherit; color: inherit; }
.agichat :focus-visible { outline: 2px solid var(--_primary); outline-offset: 2px; }

.agichat-launcher {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-left: auto;
  border: 0;
  border-radius: 50%;
  background: var(--_primary);
  color: var(--_on-primary);
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
}

.agichat-window {
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - 40px));
  height: min(560px, calc(100vh - 120px));
  margin-bottom: 12px;
  overflow: hidden;
  border-radius: var(--_radius);
  background: var(--_bg);
  box-shadow: 0 16px 48px rgb(0 0 0 / 0.25);
}

.agichat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--_primary);
  color: var(--_on-primary);
}
.agichat-header h2 { margin: 0; font-size: 16px; }
.agichat-status { font-size: 12px; opacity: 0.85; }
.agichat-close {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 20px;
  cursor: pointer;
}

.agichat-messages {
  flex: 1;
  margin: 0;
  padding: 16px;
  overflow-y: auto;
  list-style: none;
}
.agichat-message {
  max-width: 85%;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--_surface);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.agichat-message[data-role='user'] {
  margin-left: auto;
  background: var(--_primary);
  color: var(--_on-primary);
}
.agichat-message[data-role='system'], .agichat-welcome { color: var(--_muted); }
.agichat-markdown > :first-child { margin-top: 0; }
.agichat-markdown > :last-child { margin-bottom: 0; }
.agichat-markdown p, .agichat-markdown h1, .agichat-markdown h2, .agichat-markdown h3,
.agichat-markdown ul, .agichat-markdown ol, .agichat-markdown pre, .agichat-markdown table {
  margin: 0 0 0.65em;
}
.agichat-markdown h1, .agichat-markdown h2, .agichat-markdown h3 { font-size: 1.1em; line-height: 1.3; }
.agichat-markdown ul, .agichat-markdown ol { padding-left: 1.4em; }
.agichat-markdown a { color: var(--_primary); text-decoration: underline; }
.agichat-markdown code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.agichat-markdown :not(pre) > code { padding: 0.1em 0.3em; border-radius: 4px; background: rgb(127 127 127 / 16%); }
.agichat-markdown pre { max-width: 100%; padding: 0.75em; overflow-x: auto; border-radius: 6px; background: rgb(127 127 127 / 14%); }
.agichat-markdown pre code { background: transparent; }
.agichat-markdown table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.agichat-markdown th, .agichat-markdown td { padding: 0.3em 0.5em; border: 1px solid var(--_muted); }
.agichat-markdown th { font-weight: 700; }
.agichat-markdown .hljs-keyword, .agichat-markdown .hljs-selector-tag,
.agichat-markdown .hljs-literal { color: #c026d3; }
.agichat-markdown .hljs-string, .agichat-markdown .hljs-title,
.agichat-markdown .hljs-attr { color: #15803d; }
.agichat-markdown .hljs-comment { color: #64748b; }
.agichat-failed { display: block; margin-top: 4px; font-size: 12px; }
.agichat-retry {
  margin-left: 6px;
  border: 0;
  background: transparent;
  text-decoration: underline;
  cursor: pointer;
}
.agichat-typing { color: var(--_muted); font-style: italic; }
.agichat-error { margin: 0 16px 8px; color: var(--_danger); font-size: 12px; }

.agichat-form {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--_surface);
}
.agichat-input {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: 8px 12px;
  border: 1px solid var(--_surface);
  border-radius: 12px;
  background: var(--_bg);
  resize: none;
}
.agichat-send {
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: var(--_primary);
  color: var(--_on-primary);
  cursor: pointer;
}
.agichat-send:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 480px) {
  .agichat { right: 12px; bottom: 12px; }
  .agichat-window { width: calc(100vw - 24px); height: calc(100vh - 100px); }
}
@media (prefers-reduced-motion: no-preference) {
  .agichat-launcher { transition: transform 0.15s ease; }
  .agichat-launcher:hover { transform: scale(1.05); }
}
`;
