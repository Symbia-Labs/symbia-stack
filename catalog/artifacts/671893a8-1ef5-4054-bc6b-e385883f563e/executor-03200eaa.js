({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'r') await setState('r', Number(value));
    if (port === 'theta') await setState('theta', Number(value));
    const r = await getState('r');
    const theta = await getState('theta');
    if (r !== undefined && theta !== undefined) {
      emit('out', { re: r * Math.cos(theta), im: r * Math.sin(theta) });
    }
  }
})