({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const pattern = config.pattern ?? '';
    const replacement = config.replacement ?? '';
    const flags = config.flags ?? 'g';
    const regex = new RegExp(pattern, flags);
    emit('out', String(value).replace(regex, replacement));
  }
})