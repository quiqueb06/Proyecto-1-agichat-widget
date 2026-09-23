import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '../types';
import { DefaultChatView } from './DefaultChatView';
import type { ChatViewProps } from './types';

function msg(id: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    role: 'assistant',
    content: `texto ${id}`,
    createdAt: '2026-09-22T00:00:00.000Z',
    status: 'complete',
    ...extra,
  };
}

// monta la vista con props por defecto + lo que cambie cada test
function renderView(props: Partial<ChatViewProps> = {}) {
  const handlers = {
    onSend: vi.fn(),
    onRetry: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
  };
  const all: ChatViewProps = {
    messages: [],
    isTyping: false,
    connectionState: 'connected',
    failedMessageIds: [],
    error: null,
    open: true,
    title: 'Soporte',
    placeholder: 'Escribe…',
    ...handlers,
    ...props,
  };
  const view = render(<DefaultChatView {...all} />);
  return { ...view, ...handlers, props: all, user: userEvent.setup() };
}

describe('DefaultChatView', () => {
  it('cerrado solo muestra el boton flotante', async () => {
    const { user, onOpen } = renderView({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const launcher = screen.getByRole('button', { name: 'Abrir chat' });
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    await user.click(launcher);
    expect(onOpen).toHaveBeenCalled();
  });

  it('abierto muestra titulo, estado y mensajes, y enfoca el input', () => {
    renderView({ messages: [msg('a'), msg('b', { role: 'user' })] });
    expect(screen.getByRole('dialog', { name: 'Soporte' })).toBeInTheDocument();
    expect(screen.getByText('En línea')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.dataset.role)).toEqual([
      'assistant',
      'user',
    ]);
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Ocultar chat' })).toHaveAttribute(
      'aria-controls',
      screen.getByRole('dialog').id,
    );
  });

  it('muestra el mensaje de bienvenida solo sin conversacion', () => {
    const { rerender, props } = renderView({ welcomeMessage: 'Hola, ¿en qué te ayudo?' });
    expect(screen.getByText('Hola, ¿en qué te ayudo?')).toBeInTheDocument();
    rerender(<DefaultChatView {...props} messages={[msg('a')]} />);
    expect(screen.queryByText('Hola, ¿en qué te ayudo?')).not.toBeInTheDocument();
  });

  it('manda con Enter o con el boton, y Shift+Enter hace salto de linea', async () => {
    const { user, onSend } = renderView();
    const input = screen.getByRole('textbox', { name: 'Mensaje' });
    const send = screen.getByRole('button', { name: 'Enviar' });
    expect(send).toBeDisabled();

    await user.type(input, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    await user.clear(input);

    await user.type(input, 'hola{Shift>}{Enter}{/Shift}mundo');
    expect(input).toHaveValue('hola\nmundo');
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenLastCalledWith('hola\nmundo');
    expect(input).toHaveValue('');

    await user.type(input, 'otro');
    await user.click(send);
    expect(onSend).toHaveBeenLastCalledWith('otro');
  });

  it('muestra "escribiendo" solo antes de que empiece el streaming', () => {
    const { rerender, props } = renderView({
      isTyping: true,
      messages: [msg('u', { role: 'user' })],
    });
    expect(screen.getByText('El asistente está escribiendo…')).toBeInTheDocument();
    rerender(
      <DefaultChatView
        {...props}
        messages={[...props.messages, msg('a', { status: 'streaming' })]}
      />,
    );
    expect(screen.queryByText('El asistente está escribiendo…')).not.toBeInTheDocument();
    expect(screen.getByText('texto a').closest('li')).toHaveAttribute('aria-busy', 'true');
  });

  it('permite reintentar mensajes fallidos', async () => {
    const { user, onRetry } = renderView({
      messages: [msg('u', { role: 'user' })],
      failedMessageIds: ['u'],
    });
    expect(screen.getByText('No se envió.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledWith('u');
  });

  it('muestra el error como alerta', () => {
    renderView({ error: new Error('Servidor ocupado'), connectionState: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent('Servidor ocupado');
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
  });

  it('cierra con Escape, con la X y con el boton flotante', async () => {
    const { user, onClose } = renderView();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cerrar chat' }));
    await user.click(screen.getByRole('button', { name: 'Ocultar chat' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('regresa el foco al boton flotante al cerrar', () => {
    const { rerender, props } = renderView();
    rerender(<DefaultChatView {...props} open={false} />);
    expect(screen.getByRole('button', { name: 'Abrir chat' })).toHaveFocus();
  });
});
