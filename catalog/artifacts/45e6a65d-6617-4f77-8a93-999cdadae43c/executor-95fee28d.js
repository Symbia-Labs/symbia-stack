({ emit }) => ({
  process: async (ctx, port, value) => {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      emit('out', parsed);
    } catch (e) {
      emit('error', { error: e.message, input: value });
    }
  }
})