({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const inMin = config.inMin ?? 0;
    const inMax = config.inMax ?? 1;
    const outMin = config.outMin ?? 0;
    const outMax = config.outMax ?? 1;
    const v = Number(value);
    const mapped = outMin + (v - inMin) * (outMax - outMin) / (inMax - inMin);
    emit('out', mapped);
  }
})