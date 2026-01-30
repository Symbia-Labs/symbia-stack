({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const op = config.op ?? 'eq';
    const target = config.value;
    let result = false;
    switch (op) {
      case 'eq': result = value === target; break;
      case 'ne': result = value !== target; break;
      case 'gt': result = value > target; break;
      case 'gte': result = value >= target; break;
      case 'lt': result = value < target; break;
      case 'lte': result = value <= target; break;
    }
    emit('out', result);
  }
})