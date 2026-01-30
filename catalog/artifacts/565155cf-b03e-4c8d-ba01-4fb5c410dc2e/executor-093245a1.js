({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const cases = config.cases ?? {};
    const defaultValue = config.default;
    const key = String(value);
    emit('out', cases[key] ?? defaultValue);
  }
})