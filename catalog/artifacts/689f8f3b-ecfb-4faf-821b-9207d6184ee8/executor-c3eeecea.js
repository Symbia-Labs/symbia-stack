({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const separator = config.separator ?? ',';
    emit('out', String(value).split(separator));
  }
})