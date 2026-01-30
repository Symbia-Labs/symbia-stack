({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a') ?? 0;
    const b = await getState('b') ?? 0;
    emit('out', a + b);
  }
})