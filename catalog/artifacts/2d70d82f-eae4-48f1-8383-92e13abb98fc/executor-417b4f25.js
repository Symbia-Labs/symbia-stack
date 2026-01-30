({ emit }) => ({
  process: async (ctx, port, value) => {
    const n = Math.floor(Number(value));
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    emit('out', result);
  }
})