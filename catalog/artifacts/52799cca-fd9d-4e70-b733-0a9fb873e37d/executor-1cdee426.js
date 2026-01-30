({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const condition = config.condition ?? 'true';
    const arr = Array.isArray(value) ? value : [];
    try {
      const fn = new Function('item', 'index', 'return ' + condition);
      emit('out', arr.filter((item, index) => fn(item, index)));
    } catch (e) {
      emit('error', { error: e.message, value });
    }
  }
})