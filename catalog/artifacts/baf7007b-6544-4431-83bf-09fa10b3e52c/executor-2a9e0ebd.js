({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.sqrt(Number(value)));
  }
})