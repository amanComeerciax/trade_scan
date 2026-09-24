const { DistributedWorkerRunner } = require('./distributedWorkerRunner');
require('dotenv').config();

async function runWorld020130() {
  console.log('🚀 Starting Distributed 4-Worker Pipeline for HS 020130 World Exports...');
  
  const tasks = [
    {
      hsCode: '020130',
      countryCode: '000',
      countryName: 'World',
      tradeFlow: 'exports',
    }
  ];

  const runner = new DistributedWorkerRunner({ workerCount: 4 });
  await runner.runDistributedBatch(tasks);
}

runWorld020130().then(() => {
  console.log('🎉 Complete!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
