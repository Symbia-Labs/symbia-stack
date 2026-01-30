({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, value);
    const a = await getState('a');
    const b = await getState('b');
    emit('out', a ?? b ?? null);
  }
})