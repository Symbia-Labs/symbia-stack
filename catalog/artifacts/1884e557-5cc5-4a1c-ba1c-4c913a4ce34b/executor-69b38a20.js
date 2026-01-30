({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, Boolean(value));
    const a = await getState('a');
    const b = await getState('b');
    const c = await getState('c');
    const d = await getState('d');
    if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) {
      emit('out', a || b || c || d);
    }
  }
})