import { BaseTransport } from '../transport/BaseTransport';
import type { ConnectionState, Message } from '../types';

// transporte falso para los tests: no usa timers, nosotros decidimos cuando pasa cada cosa.
// hereda de BaseTransport (de persona 2) para portarse igual que los transportes reales
export class FakeTransport extends BaseTransport {
  // todo lo que se mando queda aqui para revisarlo en los tests
  readonly sent: Message[] = [];
  // si es true, el siguiente send falla como si se hubiera caido el socket
  failNextSend = false;

  connect(): void {
    this.setState('connected');
  }

  disconnect(): void {
    this.setState('disconnected');
  }

  send(message: Message): void {
    this.assertConnected();
    if (this.failNextSend) {
      this.failNextSend = false;
      throw this.fail('No se pudo enviar el mensaje.');
    }
    this.sent.push(message);
  }

  // simula que la conexion cambia de estado
  changeState(state: ConnectionState): void {
    this.setState(state);
  }

  // simula un mensaje que llega del server (por defecto una respuesta completa del asistente)
  receive(message: Partial<Message> & Pick<Message, 'id'>): void {
    this.emit({
      type: 'message',
      message: {
        role: 'assistant',
        content: '',
        createdAt: '2026-09-22T00:00:00.000Z',
        status: 'complete',
        ...message,
      },
    });
  }

  // simula un error que manda el server
  receiveError(text: string): void {
    this.fail(text);
  }
}
