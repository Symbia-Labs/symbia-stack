({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.ceil(Number(value)));
  }
})