({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const keys = config.keys ?? [];
    const obj = value ?? {};
    const result = {};
    for (const key of keys) {
      if (key in obj) result[key] = obj[key];
    }
    emit('out', result);
  }
})