import { agentConnection } from '../demo/connection';

describe('agentConnection (demo)', () => {
  it('sin url usa el mock', () => {
    expect(agentConnection(undefined)).toEqual({ transport: 'mock' });
    expect(agentConnection('   ')).toEqual({ transport: 'mock' });
  });

  it('con una url ws o wss usa el servidor del agente', () => {
    expect(agentConnection('ws://localhost:8787/ws')).toEqual({
      transport: 'websocket',
      endpoint: 'ws://localhost:8787/ws',
    });
    expect(agentConnection(' wss://agente.example.com/ws ')).toEqual({
      transport: 'websocket',
      endpoint: 'wss://agente.example.com/ws',
    });
  });

  it('con una url mal puesta avisa y cae al mock en vez de romper la demo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(agentConnection('http://localhost:8787/ws')).toEqual({ transport: 'mock' });
    expect(agentConnection('no es url')).toEqual({ transport: 'mock' });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
