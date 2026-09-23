import { render, screen } from '@testing-library/react';
import type { Message } from '../types';
import { MessageList } from './MessageList';

const base = {
  createdAt: '2026-09-22T00:00:00.000Z',
  status: 'complete' as const,
};

describe('MessageList Markdown', () => {
  it('renderiza Markdown para el asistente y texto literal para el usuario', () => {
    const messages: Message[] = [
      { ...base, id: 'assistant', role: 'assistant', content: '**respuesta**' },
      { ...base, id: 'user', role: 'user', content: '**pregunta**' },
    ];
    render(<MessageList messages={messages} failedMessageIds={[]} onRetry={vi.fn()} />);
    expect(screen.getByText('respuesta').tagName).toBe('STRONG');
    expect(screen.getByText('**pregunta**')).toBeInTheDocument();
  });
});
