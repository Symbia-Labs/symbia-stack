({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'p1') await setState('p1', value);
    if (port === 'p2') await setState('p2', value);
    const p1 = await getState('p1');
    const p2 = await getState('p2');
    if (p1 && p2) {
      emit('out', Math.atan2(p2.y - p1.y, p2.x - p1.x));
    }
  }
})