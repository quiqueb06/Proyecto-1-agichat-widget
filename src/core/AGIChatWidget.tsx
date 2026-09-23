import { useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import type { ChatStore } from './ChatStore';
import { DefaultChatView } from './DefaultChatView';
import { DEFAULT_STYLES } from './defaultStyles';
import { createStoreFromOptions, DEFAULT_PLACEHOLDER, DEFAULT_TITLE } from './options';
import type { AGIChatOptions, ChatViewProps, WidgetUIOptions } from './types';
import { useChat } from './useChat';

// props que no dependen de la conexion
interface WidgetBaseProps extends WidgetUIOptions {
  // modo controlado: el padre decide si esta abierto (se usa junto con onOpenChange)
  open?: boolean;
  // modo no controlado: si arranca abierto o no
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  // vista a usar, por defecto la minima. aqui se conecta la interfaz de persona 4
  view?: ComponentType<ChatViewProps>;
  // css que se mete en un <style> del widget. string vacio = sin estilos propios
  styles?: string;
}

// se puede pasar la config (y el widget crea su store) o un store ya creado
export type AGIChatWidgetProps = WidgetBaseProps & (AGIChatOptions | { store: ChatStore });

// componente de react del widget: junta el store (logica) con la vista (interfaz).
// ojo: la config de conexion solo se lee al montar, cambiarla despues no crea otro store
export function AGIChatWidget(props: AGIChatWidgetProps) {
  const {
    open: controlledOpen,
    defaultOpen = false,
    onOpenChange,
    view: View = DefaultChatView,
    styles = DEFAULT_STYLES,
    title = DEFAULT_TITLE,
    placeholder = DEFAULT_PLACEHOLDER,
    welcomeMessage,
    theme = 'auto',
  } = props;

  // el store se crea una sola vez (useState con funcion solo corre en el primer render)
  const [store] = useState(() => ('store' in props ? props.store : createStoreFromOptions(props)));
  const chat = useChat(store);

  // si nos pasan `open` manda el padre, si no lo manejamos aqui adentro
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? innerOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setInnerOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  return (
    <div className="agichat" data-theme={theme}>
      {styles && <style>{styles}</style>}
      <View
        messages={chat.messages}
        isTyping={chat.isTyping}
        connectionState={chat.connectionState}
        failedMessageIds={chat.failedMessageIds}
        error={chat.error}
        open={isOpen}
        title={title}
        placeholder={placeholder}
        welcomeMessage={welcomeMessage}
        onSend={chat.send}
        onRetry={chat.retry}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
