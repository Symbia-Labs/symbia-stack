({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const pattern = config.pattern ?? '';
    const flags = config.flags ?? '';
    const regex = new RegExp(pattern, flags);
    const match = String(value).match(regex);
    emit('matches', match || []);
    emit('matched', match !== null);
  }
})