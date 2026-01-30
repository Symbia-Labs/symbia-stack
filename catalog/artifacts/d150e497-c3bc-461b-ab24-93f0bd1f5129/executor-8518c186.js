({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.floor(Number(value)));
  }
})