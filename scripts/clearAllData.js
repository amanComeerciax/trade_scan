const { MongoClient } = require('mongodb');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

async function clearAll() {
  console.log('🗑️  Connecting to MongoDB Atlas...');
  const client = new MongoClient(DATABASE_URL);
  
  try {
    await client.connect();
    const db = client.db('tradescan');
    
    // Delete CompanyProduct first (child), then Company (parent)
    const prodResult = await db.collection('CompanyProduct').deleteMany({});
    console.log(`✅ Deleted ${prodResult.deletedCount} CompanyProduct records`);
    
    const compResult = await db.collection('Company').deleteMany({});
    console.log(`✅ Deleted ${compResult.deletedCount} Company records`);
    
    // Also clear ScrapeJob and ScrapeQueueTask
    const jobResult = await db.collection('ScrapeJob').deleteMany({});
    console.log(`✅ Deleted ${jobResult.deletedCount} ScrapeJob records`);
    
    const taskResult = await db.collection('ScrapeQueueTask').deleteMany({});
    console.log(`✅ Deleted ${taskResult.deletedCount} ScrapeQueueTask records`);
    
    console.log('\n🎉 ALL DATA CLEARED SUCCESSFULLY!');
    console.log('   Refresh your browser to see empty database.');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.close();
  }
}

clearAll();
