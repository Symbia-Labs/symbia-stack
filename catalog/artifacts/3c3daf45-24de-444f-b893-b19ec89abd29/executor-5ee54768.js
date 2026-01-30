({ emit }) => ({
  process: async (ctx, port, value) => {
    const hex = String(value).replace('#', '');
    const num = parseInt(hex, 16);
    emit('out', {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    });
  }
})