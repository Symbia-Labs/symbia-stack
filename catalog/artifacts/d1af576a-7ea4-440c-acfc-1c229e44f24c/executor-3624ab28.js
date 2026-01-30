({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const freq = config.frequency ?? 440;
    const sampleRate = config.sampleRate ?? 44100;
    const duration = config.duration ?? 1;
    const samples = [];
    const numSamples = Math.floor(sampleRate * duration);
    for (let i = 0; i < numSamples; i++) {
      samples.push(Math.sin(2 * Math.PI * freq * i / sampleRate));
    }
    emit('out', samples);
  }
})