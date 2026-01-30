({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    const rate = config.rate ?? 1;
    const current = await getState('current') ?? 0;
    const target = Number(value);
    const diff = target - current;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), rate);
    const next = current + step;
    await setState('current', next);
    emit('out', next);
  }
})