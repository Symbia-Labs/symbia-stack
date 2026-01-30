({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const gain = config.gain ?? 1;
    if (Array.isArray(value)) {
      emit('out', value.map(s => s * gain));
    } else {
      emit('out', Number(value) * gain);
    }
  }
})