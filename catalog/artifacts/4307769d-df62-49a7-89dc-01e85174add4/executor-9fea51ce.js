({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.sign(Number(value)));
  }
})