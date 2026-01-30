({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? value : [];
    const op = config.op ?? 'sum';
    let result;
    switch (op) {
      case 'sum': result = arr.reduce((a, b) => a + Number(b), 0); break;
      case 'product': result = arr.reduce((a, b) => a * Number(b), 1); break;
      case 'min': result = Math.min(...arr.map(Number)); break;
      case 'max': result = Math.max(...arr.map(Number)); break;
      case 'count': result = arr.length; break;
      case 'concat': result = arr.join(''); break;
      default: result = arr;
    }
    emit('out', result);
  }
})