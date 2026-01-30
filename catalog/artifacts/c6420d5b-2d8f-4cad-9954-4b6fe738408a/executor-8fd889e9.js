({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const transform = config.transform ?? 'item';
    const arr = Array.isArray(value) ? value : [];
    try {
      const fn = new Function('item', 'index', 'return ' + transform);
      emit('out', arr.map((item, index) => fn(item, index)));
    } catch (e) {
      emit('error', { error: e.message, value });
    }
  }
})