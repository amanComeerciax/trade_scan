/**
 * 👑 TradeScan DISTRIBUTED QUEUE MANAGER (MongoDB-Backed Producer-Consumer)
 * ==================================================================================
 * - Enterprise-grade Producer & Task Queue
 * - Atomic Lease-Locking with Auto-Recovery (Stall detection)
 * - Auto-Retry with backoff (Failover to another worker)
 * ==================================================================================
 */

const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const uri = process.env.DATABASE_URL;
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  if (!uri) throw new Error('DATABASE_URL is not set in .env');

  cachedClient = new MongoClient(uri);
  await cachedClient.connect();
  cachedDb = cachedClient.db('tradescan');
  return cachedDb;
}

class DistributedQueueManager {
  constructor() {
    this.collectionName = 'ScrapeQueueTask';
  }

  async getCollection() {
    const db = await getDb();
    return db.collection(this.collectionName);
  }

  /**
   * Producer: Splits search requirements into page-level tasks in MongoDB
   */
  async enqueueBatchTasks({ batchId, tasks }) {
    const col = await this.getCollection();
    const records = tasks.map((t) => ({
      batchId,
      type: 'FETCH_PAGE',
      hsCode: String(t.hsCode).trim(),
      countryCode: String(t.countryCode || '699'),
      countryName: t.countryName || 'India',
      tradeFlow: t.tradeFlow || 'exports',
      page: Number(t.page),
      totalPages: Number(t.totalPages || 1),
      status: 'PENDING',
      assignedWorkerId: null,
      lockedUntil: null,
      retries: 0,
      recordsFound: 0,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (records.length > 0) {
      await col.insertMany(records);
    }
    return records.length;
  }

  /**
   * Consumer: Atomically claims the next pending or stalled task
   * If a worker crashed, its lease expires after 90 seconds and another worker claims it!
   */
  async claimNextTask(workerId, batchId = null) {
    const col = await this.getCollection();
    const now = new Date();
    const leaseTime = new Date(Date.now() + 90 * 1000); // 90-second lease

    const filter = {
      $and: [
        batchId ? { batchId } : {},
        {
          $or: [
            { status: 'PENDING' },
            { status: 'IN_PROGRESS', lockedUntil: { $lt: now } }, // Auto-recovery of stalled tasks
          ],
        },
        { retries: { $lt: 3 } },
      ],
    };

    const update = {
      $set: {
        status: 'IN_PROGRESS',
        assignedWorkerId: Number(workerId),
        lockedUntil: leaseTime,
        updatedAt: now,
      },
    };

    const result = await col.findOneAndUpdate(filter, update, {
      sort: { createdAt: 1, page: 1 },
      returnDocument: 'after',
    });

    return result || null;
  }

  /**
   * Consumer: Heartbeat to renew lock on long tasks
   */
  async renewTaskLock(taskId) {
    const col = await this.getCollection();
    const leaseTime = new Date(Date.now() + 90 * 1000);
    await col.updateOne(
      { _id: new ObjectId(taskId) },
      { $set: { lockedUntil: leaseTime, updatedAt: new Date() } }
    );
  }

  /**
   * Consumer: Marks task as successfully completed
   */
  async completeTask(taskId, recordsFound = 0) {
    const col = await this.getCollection();
    await col.updateOne(
      { _id: new ObjectId(taskId) },
      {
        $set: {
          status: 'COMPLETED',
          recordsFound: Number(recordsFound),
          lockedUntil: null,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Consumer: Failover handling. If retries < 3, puts task back into PENDING!
   */
  async failTask(taskId, errorMessage) {
    const col = await this.getCollection();
    const task = await col.findOne({ _id: new ObjectId(taskId) });
    if (!task) return;

    const nextRetries = (task.retries || 0) + 1;
    const isPermanentFail = nextRetries >= 3;

    await col.updateOne(
      { _id: new ObjectId(taskId) },
      {
        $set: {
          status: isPermanentFail ? 'FAILED' : 'PENDING', // PENDING allows another worker to take over!
          retries: nextRetries,
          error: errorMessage,
          assignedWorkerId: null,
          lockedUntil: null,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Queue Statistics for a batch
   */
  async getBatchStats(batchId) {
    const col = await this.getCollection();
    const tasks = await col.find({ batchId }).toArray();
    
    const stats = {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === 'PENDING').length,
      inProgress: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      completed: tasks.filter((t) => t.status === 'COMPLETED').length,
      failed: tasks.filter((t) => t.status === 'FAILED').length,
      totalRecordsExtracted: tasks.reduce((sum, t) => sum + (t.recordsFound || 0), 0),
      isFinished: tasks.length > 0 && tasks.every((t) => t.status === 'COMPLETED' || t.status === 'FAILED'),
    };

    return stats;
  }

  async close() {
    if (cachedClient) {
      await cachedClient.close();
      cachedClient = null;
      cachedDb = null;
    }
  }
}

module.exports = { DistributedQueueManager, getDb };
