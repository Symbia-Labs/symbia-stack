({ emit }) => ({
  process: async (ctx, port, value) => {
    const points = Array.isArray(value) ? value : [];
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    emit('out', Math.abs(area) / 2);
  }
})