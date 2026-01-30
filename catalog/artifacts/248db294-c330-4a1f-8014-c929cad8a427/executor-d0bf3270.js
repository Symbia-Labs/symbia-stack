({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const factor = config.factor ?? 1;
    const { r, g, b } = value ?? { r: 0, g: 0, b: 0 };
    const adjust = (c) => Math.max(0, Math.min(255, ((c / 255 - 0.5) * factor + 0.5) * 255));
    emit('out', { r: adjust(r), g: adjust(g), b: adjust(b) });
  }
})