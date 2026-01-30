({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const A = await getState('a');
    const b = await getState('b');
    if (A && b) {
      // Simple Gaussian elimination for small systems
      const n = b.length;
      const aug = A.map((row, i) => [...row, b[i]]);
      for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
          if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
        }
        [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
        for (let k = i + 1; k < n; k++) {
          const c = aug[k][i] / aug[i][i];
          for (let j = i; j <= n; j++) aug[k][j] -= c * aug[i][j];
        }
      }
      const x = new Array(n);
      for (let i = n - 1; i >= 0; i--) {
        x[i] = aug[i][n] / aug[i][i];
        for (let k = i - 1; k >= 0; k--) aug[k][n] -= aug[k][i] * x[i];
      }
      emit('out', x);
    }
  }
})