({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    if (port === 't') await setState('t', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    const t = await getState('t') ?? 0.5;
    if (a && b) {
      emit('out', {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t)
      });
    }
  }
})