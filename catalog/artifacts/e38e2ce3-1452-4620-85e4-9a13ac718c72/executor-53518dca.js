({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const min = config.min ?? -Infinity;
    const max = config.max ?? Infinity;
    emit('out', Math.max(min, Math.min(max, Number(value))));
  }
})