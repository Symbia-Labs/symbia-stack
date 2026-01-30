({ emit, config }) => ({
  process: async (ctx, port, value) => {
    // Note: Real implementation would use WebCrypto API
    emit('out', { hmac: 'placeholder', input: value });
  }
})