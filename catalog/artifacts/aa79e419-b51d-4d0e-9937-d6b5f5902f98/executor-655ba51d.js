({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', Boolean(config.value ?? false));
  }
})