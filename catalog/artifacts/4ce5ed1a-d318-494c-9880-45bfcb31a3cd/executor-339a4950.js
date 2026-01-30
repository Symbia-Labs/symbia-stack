({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const start = config.start ?? 0;
    const end = config.end;
    emit('out', String(value).slice(start, end));
  }
})