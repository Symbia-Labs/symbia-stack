({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.round(Number(value)));
  }
})