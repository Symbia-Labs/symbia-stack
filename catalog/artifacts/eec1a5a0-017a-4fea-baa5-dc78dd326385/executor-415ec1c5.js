({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const start = config.start ?? 0;
    const end = config.end;
    const arr = Array.isArray(value) ? value : [];
    emit('out', arr.slice(start, end));
  }
})