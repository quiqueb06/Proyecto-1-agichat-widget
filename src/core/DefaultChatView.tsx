import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { ConnectionState } from '../types';
import type { ChatViewProps } from './types';

// texto que se muestra en el encabezado segun el estado de la conexion
const STATUS_LABELS: Record<ConnectionState, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando…',
  connected: 'En línea',
  reconnecting: 'Reconectando…',
  error: 'Sin conexión',
};

// vista minima y accesible del widget. sirve para probar toda la logica mientras
// persona 4 termina la interfaz final; su vista solo tiene que recibir ChatViewProps.
// los mensajes se muestran como texto plano (el markdown lo agrega persona 5)
export function DefaultChatView({
  messages,
  isTyping,
  connectionState,
  failedMessageIds,
  error,
  open,
  title,
  placeholder,
  welcomeMessage,
  onSend,
  onRetry,
  onOpen,
  onClose,
}: ChatViewProps) {
  const [draft, setDraft] = useState('');
  // ids unicos para conectar el boton con la ventana (aria-controls)
  const windowId = useId();
  const titleId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  // al abrir se pone el foco en el input; al cerrar regresa al boton flotante
  // (para que alguien que usa teclado no pierda donde estaba)
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // cada vez que llega algo nuevo se baja hasta el ultimo mensaje
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, isTyping, open]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  };

  // enter manda el mensaje, shift+enter hace salto de linea.
  // isComposing evita mandar mientras se escribe con teclados de acentos/idiomas asiaticos
  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  };

  // escape cierra la ventana
  const handleWindowKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  };

  return (
    <>
      {open && (
        <section
          id={windowId}
          className="agichat-window"
          role="dialog"
          aria-labelledby={titleId}
          onKeyDown={handleWindowKeyDown}
        >
          <header className="agichat-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              <span className="agichat-status" data-state={connectionState}>
                {STATUS_LABELS[connectionState]}
              </span>
            </div>
            <button
              type="button"
              className="agichat-close"
              aria-label="Cerrar chat"
              onClick={onClose}
            >
              ×
            </button>
          </header>

          {/* aria-live hace que los lectores de pantalla lean los mensajes nuevos */}
          <ol ref={listRef} className="agichat-messages" aria-live="polite" aria-label="Mensajes">
            {messages.length === 0 && welcomeMessage && (
              <li className="agichat-message agichat-welcome">{welcomeMessage}</li>
            )}
            {messages.map((message) => {
              const failed = failedMessageIds.includes(message.id);
              return (
                <li
                  key={message.id}
                  className="agichat-message"
                  data-role={message.role}
                  data-status={message.status}
                  aria-busy={message.status === 'streaming'}
                >
                  {message.content}
                  {failed && (
                    <span className="agichat-failed">
                      No se envió.
                      <button
                        type="button"
                        className="agichat-retry"
                        onClick={() => onRetry(message.id)}
                      >
                        Reintentar
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
            {/* los puntitos solo salen mientras todavia no empieza a llegar la respuesta */}
            {isTyping && messages.at(-1)?.status !== 'streaming' && (
              <li className="agichat-message agichat-typing">El asistente está escribiendo…</li>
            )}
          </ol>

          {error && (
            <p className="agichat-error" role="alert">
              {error.message}
            </p>
          )}

          <form className="agichat-form" onSubmit={submit}>
            <textarea
              ref={inputRef}
              className="agichat-input"
              aria-label="Mensaje"
              placeholder={placeholder}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
            />
            <button type="submit" className="agichat-send" disabled={!draft.trim()}>
              Enviar
            </button>
          </form>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        className="agichat-launcher"
        aria-label={open ? 'Ocultar chat' : 'Abrir chat'}
        aria-expanded={open}
        aria-controls={open ? windowId : undefined}
        onClick={open ? onClose : onOpen}
      >
        {open ? '×' : '💬'}
      </button>
    </>
  );
}
