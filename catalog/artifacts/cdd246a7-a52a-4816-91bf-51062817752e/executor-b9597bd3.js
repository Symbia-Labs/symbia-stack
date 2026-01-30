({ emit }) => ({
  process: async (ctx, port, value) => {
    try {
      emit('out', atob(String(value)));
    } catch (e) {
      emit('error', { error: e.message });
    }
  }
})