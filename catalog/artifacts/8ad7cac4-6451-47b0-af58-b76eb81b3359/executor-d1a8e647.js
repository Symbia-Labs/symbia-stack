({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const A = await getState('a');
    const B = await getState('b');
    if (A && B) {
      const result = A.map((row, i) =>
        B[0].map((_, j) => row.reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0))
      );
      emit('out', result);
    }
  }
})