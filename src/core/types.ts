import type { ConnectionState, Message, WidgetConfig } from '../types';

export type Theme = 'light' | 'dark' | 'auto';

// opciones de apariencia/comportamiento del widget (no de conexion)
export interface WidgetUIOptions {
  // titulo del encabezado de la ventana
  title?: string;
  // texto de ayuda dentro del input
  placeholder?: string;
  // mensaje que se muestra cuando todavia no hay conversacion
  welcomeMessage?: string;
  // tema de colores, 'auto' sigue al sistema operativo
  theme?: Theme;
}

// todo lo que se le puede pasar al widget: la config de conexion de persona 2
// (mock o websocket) + las opciones de ui + historial.
// se usa & con la union de WidgetConfig para no tener que modificar ese tipo
export type AGIChatOptions = WidgetConfig &
  WidgetUIOptions & {
    // true = guarda con la llave por defecto, string = guarda con esa llave
    persistHistory?: boolean | string;
  };

// contrato entre la logica (persona 3) y la interfaz (persona 4).
// cualquier componente que reciba estas props se puede usar como vista del widget
export interface ChatViewProps {
  // datos del chat
  messages: readonly Message[];
  isTyping: boolean;
  connectionState: ConnectionState;
  failedMessageIds: readonly string[];
  error: Error | null;
  // si la ventana esta abierta o solo se ve el boton flotante
  open: boolean;
  // textos
  title: string;
  placeholder: string;
  welcomeMessage?: string;
  // acciones
  onSend: (text: string) => void;
  onRetry: (id: string) => void;
  onOpen: () => void;
  onClose: () => void;
}
