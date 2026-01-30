({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const size = config.size ?? 1;
    const arr = Array.isArray(value) ? value : [];
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    emit('out', chunks);
  }
})