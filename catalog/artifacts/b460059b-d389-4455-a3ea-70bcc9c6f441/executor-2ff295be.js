({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const index = config.index ?? 0;
    const arr = Array.isArray(value) ? value : [];
    emit('out', arr.at(index));
  }
})