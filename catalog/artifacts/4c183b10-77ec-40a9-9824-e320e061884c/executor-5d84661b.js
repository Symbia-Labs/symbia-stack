({ emit }) => ({
  process: async (ctx, port, value) => {
    const { r = 0, g = 0, b = 0 } = value ?? {};
    const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
    emit('out', '#' + toHex(r) + toHex(g) + toHex(b));
  }
})