({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'obj') await setState('obj', value);
    if (port === 'value') await setState('value', value);
    const obj = await getState('obj');
    const val = await getState('value');
    if (obj !== undefined && val !== undefined) {
      const path = config.path ?? '';
      const parts = path.split('.');
      const result = JSON.parse(JSON.stringify(obj));
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = val;
      emit('out', result);
    }
  }
})