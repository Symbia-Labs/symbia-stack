({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const sep = config.separator ?? '';
    const arr = Array.isArray(value) ? value : [value];
    emit('out', arr.map(String).join(sep));
  }
})