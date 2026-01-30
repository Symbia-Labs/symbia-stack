({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const n = config.n ?? Number(value);
    const k = config.k ?? 0;
    const factorial = (x) => x <= 1 ? 1 : x * factorial(x - 1);
    const result = factorial(n) / (factorial(k) * factorial(n - k));
    emit('out', result);
  }
})