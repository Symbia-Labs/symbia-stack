({ emit }) => ({
  process: async (ctx, port, value) => {
    const v = Array.isArray(value) ? value : [];
    emit('out', Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)));
  }
})