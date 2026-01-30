({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'base') await setState('base', Number(value));
    if (port === 'exp') await setState('exp', Number(value));
    const base = await getState('base');
    const exp = await getState('exp');
    if (base !== undefined && exp !== undefined) {
      emit('out', Math.pow(base, exp));
    }
  }
})