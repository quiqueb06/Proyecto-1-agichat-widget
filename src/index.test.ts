import * as sdk from './index';

describe('API pública del SDK', () => {
  it('expone la versión', () => {
    expect(sdk.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('expone los componentes públicos', () => {
    expect(typeof sdk.StatusBadge).toBe('function');
  });
});
