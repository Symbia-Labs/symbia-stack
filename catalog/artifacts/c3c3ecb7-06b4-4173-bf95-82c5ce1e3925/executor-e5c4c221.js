({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const min = config.min ?? 0;
    const max = config.max ?? 1;
    emit('out', Math.max(min, Math.min(max, Number(value))));
  }
})