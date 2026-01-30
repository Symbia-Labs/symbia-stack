({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    const threshold = config.threshold ?? 0.1;
    const last = await getState('last');
    const v = Number(value);
    if (last === undefined || Math.abs(v - last) >= threshold) {
      await setState('last', v);
      emit('out', v);
    }
  }
})