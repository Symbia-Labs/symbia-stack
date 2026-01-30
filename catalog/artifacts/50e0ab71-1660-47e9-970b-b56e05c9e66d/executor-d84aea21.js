({ emit }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? value : [];
    emit('out', [...new Set(arr)]);
  }
})