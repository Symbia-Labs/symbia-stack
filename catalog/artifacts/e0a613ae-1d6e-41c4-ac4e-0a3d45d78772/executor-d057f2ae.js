({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Array.isArray(value) ? value.length : 0);
  }
})