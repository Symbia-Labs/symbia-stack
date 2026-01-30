({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const pretty = config.pretty !== false;
    emit('out', JSON.stringify(value, null, pretty ? 2 : 0));
  }
})