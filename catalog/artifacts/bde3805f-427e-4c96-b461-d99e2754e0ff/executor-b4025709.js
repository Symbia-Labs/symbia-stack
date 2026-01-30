({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.floor(Number(config.value ?? 0)));
  }
})