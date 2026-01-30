({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', Number(config.value ?? 0));
  }
})