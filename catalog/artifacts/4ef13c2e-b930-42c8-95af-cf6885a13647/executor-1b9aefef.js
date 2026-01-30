({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.abs(Number(value)));
  }
})