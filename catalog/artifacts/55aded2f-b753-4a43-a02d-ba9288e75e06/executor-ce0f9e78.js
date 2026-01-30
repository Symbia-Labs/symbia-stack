({ emit }) => ({
  process: async (ctx, port, value) => {
    const { re = 0, im = 0 } = value ?? {};
    emit('out', Math.sqrt(re * re + im * im));
  }
})