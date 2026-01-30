({ emit, config }) => ({
  process: async (ctx, port, value) => {
    // Simple hash for demo - real implementation would use WebCrypto
    const str = String(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    emit('out', hash.toString(16));
  }
})