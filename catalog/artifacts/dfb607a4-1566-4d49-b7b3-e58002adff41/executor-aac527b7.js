({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a && b) {
      emit('out', a.map((v, i) => v + b[i]));
    }
  }
})