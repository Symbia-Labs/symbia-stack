({ emit, log, config }) => ({
  process: async (ctx, port, value) => {
    const level = config.level ?? 'info';
    log(level, JSON.stringify(value));
    emit('out', value);
  }
})