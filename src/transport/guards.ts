import type { Message } from '../types';

// revisa que algo que llego de afuera (server, localStorage) de verdad tenga forma de Message
export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    typeof m.role === 'string' &&
    ['user', 'assistant', 'system'].includes(m.role) &&
    typeof m.content === 'string' &&
    typeof m.createdAt === 'string' &&
    Number.isFinite(Date.parse(m.createdAt)) &&
    (m.status === 'streaming' || m.status === 'complete')
  );
}
