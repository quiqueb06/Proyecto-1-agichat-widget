import { createEmitter } from './emitter';

type Events = { ping: number; pong: string };

describe('createEmitter', () => {
  it('entrega el payload solo a los listeners del evento', () => {
    const emitter = createEmitter<Events>();
    const ping = vi.fn();
    const pong = vi.fn();
    emitter.on('ping', ping);
    emitter.on('pong', pong);
    emitter.emit('ping', 1);
    expect(ping).toHaveBeenCalledWith(1);
    expect(pong).not.toHaveBeenCalled();
  });

  it('quita listeners con la función devuelta, con off y con clear', () => {
    const emitter = createEmitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const stop = emitter.on('ping', a);
    emitter.on('ping', b);
    emitter.on('pong', c);
    stop();
    emitter.off('ping', b);
    emitter.off('pong', vi.fn());
    emitter.emit('ping', 1);
    emitter.clear();
    emitter.emit('pong', 'x');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(c).not.toHaveBeenCalled();
  });

  it('aísla los errores de un listener', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const emitter = createEmitter<Events>();
    const after = vi.fn();
    emitter.on('ping', () => {
      throw new Error('falla');
    });
    emitter.on('ping', after);
    expect(() => emitter.emit('ping', 1)).not.toThrow();
    expect(after).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      '[AGIChat] Error en un listener de "ping":',
      expect.any(Error),
    );
    error.mockRestore();
  });

  it('permite quitar un listener mientras se emite', () => {
    const emitter = createEmitter<Events>();
    const second = vi.fn();
    const stop = emitter.on('ping', () => stop());
    emitter.on('ping', second);
    emitter.emit('ping', 1);
    emitter.emit('ping', 2);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
