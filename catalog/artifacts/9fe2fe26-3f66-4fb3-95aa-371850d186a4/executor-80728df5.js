({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', btoa(String(value)));
  }
})