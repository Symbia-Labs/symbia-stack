({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const depth = config.depth ?? 1;
    const arr = Array.isArray(value) ? value : [value];
    emit('out', arr.flat(depth));
  }
})