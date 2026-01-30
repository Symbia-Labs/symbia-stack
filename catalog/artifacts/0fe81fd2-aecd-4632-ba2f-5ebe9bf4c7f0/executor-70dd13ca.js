({ emit }) => ({
  process: async (ctx, port, value) => {
    const samples = Array.isArray(value) ? value : [];
    const max = Math.max(...samples.map(Math.abs));
    emit('out', max > 0 ? samples.map(s => s / max) : samples);
  }
})