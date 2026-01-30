({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Object.values(value ?? {}));
  }
})