import * as sdk from './index';

describe('API pública del SDK', () => {
  it('expone la versión', () => {
    expect(sdk.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('expone los componentes públicos', () => {
    expect(typeof sdk.StatusBadge).toBe('function');
  });

  it('expone el store y el hook del chat', () => {
    expect(typeof sdk.ChatStore).toBe('function');
    expect(typeof sdk.createChatStore).toBe('function');
    expect(typeof sdk.useChat).toBe('function');
  });

  it('expone el widget y la api global AGIChat', () => {
    expect(typeof sdk.AGIChatWidget).toBe('function');
    expect(typeof sdk.createAGIChat).toBe('function');
    expect(Object.keys(sdk.AGIChat)).toEqual(
      expect.arrayContaining(['init', 'open', 'close', 'toggle', 'destroy', 'on', 'off', 'send']),
    );
  });
});
