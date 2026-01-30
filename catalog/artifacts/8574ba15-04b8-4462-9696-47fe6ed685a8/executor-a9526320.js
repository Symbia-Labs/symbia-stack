({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', String(config.value ?? ''));
  }
})