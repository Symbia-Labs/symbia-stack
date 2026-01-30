({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', !Boolean(value));
  }
})