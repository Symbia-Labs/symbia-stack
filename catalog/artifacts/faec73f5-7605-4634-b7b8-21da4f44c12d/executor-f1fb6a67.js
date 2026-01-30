({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    let arr = await getState('array') || [];
    arr = [...arr, value];
    await setState('array', arr);
    emit('out', arr);
  }
})