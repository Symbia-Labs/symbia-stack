({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const v = Number(value);
    const min = config.min ?? 0;
    const max = config.max ?? 1;
    emit('out', v >= min && v <= max);
  }
})