({ emit, config }) => ({
  process: async (ctx, port, value) => {
    let template = config.template ?? '';
    const values = typeof value === 'object' && value !== null ? value : { value };
    for (const [k, v] of Object.entries(values)) {
      template = template.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), String(v));
    }
    emit('out', template);
  }
})