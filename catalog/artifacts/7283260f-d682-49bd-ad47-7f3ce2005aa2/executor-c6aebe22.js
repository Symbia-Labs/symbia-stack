({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const path = config.path ?? '';
    const defaultValue = config.default;
    let result = value;
    for (const part of path.split('.')) {
      if (result == null) { result = defaultValue; break; }
      result = result[part];
    }
    emit('out', result ?? defaultValue);
  }
})