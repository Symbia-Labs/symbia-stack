console.log('MESSAGING_ENDPOINT:', process.env.MESSAGING_ENDPOINT);
console.log('MESSAGING_SERVICE_URL:', process.env.MESSAGING_SERVICE_URL);
console.log('All MESSAGING vars:', Object.keys(process.env).filter(k => k.includes('MESSAGING')));
