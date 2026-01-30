({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, Number(value));
    const a = await getState('a') ?? 0;
    const b = await getState('b') ?? 0;
    const c = await getState('c') ?? 0;
    const d = await getState('d') ?? 0;
    emit('out', a + b + c + d);
  }
})