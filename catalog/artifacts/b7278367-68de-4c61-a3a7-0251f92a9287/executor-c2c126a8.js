({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', String(value).length);
  }
})