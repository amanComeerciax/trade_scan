async function stopAndStartWorldBatch() {
  console.log('1. Stopping current batch...');
  const stopRes = await fetch('http://localhost:3000/api/scraper/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop' }),
  });
  console.log('Stop response:', await stopRes.json());

  await new Promise(r => setTimeout(r, 2000));

  console.log('2. Starting HS 020130 World Exports batch across 4 workers...');
  const startRes = await fetch('http://localhost:3000/api/scraper/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hsCodes: ['020130, World, exports'],
      countryCode: '000',
      tradeFlow: 'exports',
      workerCount: 4,
    }),
  });
  console.log('Start response:', await startRes.json());
}

stopAndStartWorldBatch().catch(console.error);
