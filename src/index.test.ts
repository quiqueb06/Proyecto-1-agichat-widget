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
});
