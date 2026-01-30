({ emit }) => ({
  process: async (ctx, port, value) => {
    const m = Array.isArray(value) ? value : [];
    if (m.length === 0) { emit('out', []); return; }
    const result = m[0].map((_, i) => m.map(row => row[i]));
    emit('out', result);
  }
})