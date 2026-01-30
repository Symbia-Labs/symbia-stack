({ emit }) => ({
  process: async (ctx, port, value) => {
    if (port === 'condition') {
      emit(Boolean(value) ? 'true' : 'false', value);
    }
  }
})