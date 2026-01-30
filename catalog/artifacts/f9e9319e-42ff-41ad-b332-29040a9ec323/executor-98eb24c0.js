({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', Math.max(a, b));
    }
  }
})