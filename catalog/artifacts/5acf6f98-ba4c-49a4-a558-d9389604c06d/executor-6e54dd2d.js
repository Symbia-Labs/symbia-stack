({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const mean = config.mean ?? 0;
    const stddev = config.stddev ?? 1;
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    emit('out', mean + z * stddev);
  }
})