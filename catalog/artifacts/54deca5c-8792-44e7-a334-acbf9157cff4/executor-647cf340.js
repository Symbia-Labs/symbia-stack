({ emit }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? value.map(Number) : [];
    const n = arr.length;
    if (n === 0) { emit('mean', 0); emit('variance', 0); return; }
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    emit('mean', mean);
    emit('variance', variance);
  }
})