({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const search = config.search ?? '';
    emit('out', String(value).includes(search));
  }
})