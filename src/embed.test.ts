import { act } from '@testing-library/react';
import * as embed from './embed';

afterEach(() => {
  act(() => embed.destroy());
  document.body.innerHTML = '';
});

describe('script embebible', () => {
  it('expone la api global que queda en window.AGIChat', () => {
    expect(Object.keys(embed).sort()).toEqual(
      [
        'VERSION',
        'close',
        'createAGIChat',
        'destroy',
        'init',
        'isOpen',
        'off',
        'on',
        'open',
        'send',
        'toggle',
      ].sort(),
    );
  });

  it('los metodos sueltos funcionan igual que AGIChat.*', () => {
    const opened = vi.fn();
    act(() => {
      embed.init({ transport: 'mock' });
    });
    embed.on('open', opened);
    act(() => embed.open());
    expect(embed.isOpen()).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);
    act(() => embed.toggle());
    act(() => embed.close());
    expect(embed.isOpen()).toBe(false);
    embed.off('open', opened);
    expect(embed.send('   ')).toBeNull();
  });
});
