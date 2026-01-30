({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? [...value] : [];
    const order = config.order ?? 'asc';
    const key = config.key;
    arr.sort((a, b) => {
      const va = key ? a[key] : a;
      const vb = key ? b[key] : b;
      if (va < vb) return order === 'asc' ? -1 : 1;
      if (va > vb) return order === 'asc' ? 1 : -1;
      return 0;
    });
    emit('out', arr);
  }
})