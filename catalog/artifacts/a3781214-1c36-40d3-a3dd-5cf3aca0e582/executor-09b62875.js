({ emit }) => ({
  process: async (ctx, port, value) => {
    const samples = Array.isArray(value) ? value : [];
    const sum = samples.reduce((acc, s) => acc + s * s, 0);
    emit('out', Math.sqrt(sum / samples.length));
  }
})