({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'open') await setState('open', Boolean(value));
    if (port === 'in') {
      const open = await getState('open');
      if (open) emit('out', value);
    }
  }
})