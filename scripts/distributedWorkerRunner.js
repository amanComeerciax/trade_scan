/**
 * 👑 TradeScan DISTRIBUTED PRODUCER-CONSUMER RUNNER
 * ==================================================================================
 * Master Producer: Breaks searches into page-level tasks in MongoDB.
 * 3 Worker Consumers (Account 1, 2, 3): Parallel consumers with lease-locking,
 * auto-failover, and atomic database upserts.
 * ==================================================================================
 */

const { DistributedQueueManager } = require('./distributedQueueManager');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

require('dotenv').config();
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const WORKER_CREDENTIALS = {
  1: {
    username: process.env.TRADEMAP_ACCOUNT_1_USER || 'kingamaan14@gmail.com',
    password: process.env.TRADEMAP_ACCOUNT_1_PASS || '7861Amaan',
  },
  2: {
    username: process.env.TRADEMAP_ACCOUNT_2_USER || 'modipriyanshi013@gmail.com',
    password: process.env.TRADEMAP_ACCOUNT_2_PASS || 'Priyanshi@1301',
  },
  3: {
    username: process.env.TRADEMAP_ACCOUNT_3_USER || 'trademap1235665@gmail.com',
    password: process.env.TRADEMAP_ACCOUNT_3_PASS || 'thakkar@3108',
  },
};

class DistributedWorkerRunner {
  constructor(options = {}) {
    this.queue = new DistributedQueueManager();
    this.activeWorkers = options.workerCount || 3;
    this.tokens = {}; // workerId -> { token, expiresAt, refreshToken }
    this.isRunning = false;
    this.recentLogs = [];
    this.stateFilePath = path.join(process.cwd(), 'scripts', '.distributed_state.json');
    this.onUpdateCallback = options.onUpdate || null;
  }

  log(msg) {
    const time = new Date().toLocaleTimeString();
    const formatted = `[${time}] ${msg}`;
    console.log(formatted);
    this.recentLogs.push(formatted);
    if (this.recentLogs.length > 50) this.recentLogs.shift();
    this.saveState();
  }

  saveState(extra = {}) {
    try {
      const state = {
        isRunning: this.isRunning,
        workerCount: this.activeWorkers,
        pendingCount: 0,
        active: [],
        completed: [],
        failed: [],
        logs: this.recentLogs,
        updatedAt: new Date().toISOString(),
        ...extra,
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2));
      const batchStatePath = path.join(process.cwd(), 'scripts', '.batch_state.json');
      fs.writeFileSync(batchStatePath, JSON.stringify(state, null, 2));
      if (this.onUpdateCallback) this.onUpdateCallback(state);
    } catch {}
  }

  /**
   * TradeMap STS Direct OAuth2 Token
   */
  async getOrRefreshToken(workerId) {
    const creds = WORKER_CREDENTIALS[workerId] || WORKER_CREDENTIALS[1];
    const cached = this.tokens[workerId];

    if (cached && cached.token && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    // Refresh token flow
    if (cached && cached.refreshToken) {
      try {
        const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: 'TradeMap',
            grant_type: 'refresh_token',
            refresh_token: cached.refreshToken,
          }).toString(),
        });
        const data = await res.json();
        if (data.access_token) {
          this.tokens[workerId] = {
            token: data.access_token,
            refreshToken: data.refresh_token || cached.refreshToken,
            expiresAt: Date.now() + ((data.expires_in || 3600) - 120) * 1000,
          };
          return data.access_token;
        }
      } catch {}
    }

    // Password grant flow
    this.log(`🔐 Worker #${workerId} (${creds.username}) authenticating via TradeMap STS...`);
    const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'TradeMap',
        grant_type: 'password',
        username: creds.username,
        password: creds.password,
        scope: 'openid profile offline_access TradeMap.API Account.API',
      }).toString(),
    });

    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`Auth failed for Account #${workerId}: ${data.error_description || data.error}`);
    }

    this.tokens[workerId] = {
      token: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: Date.now() + ((data.expires_in || 3600) - 120) * 1000,
    };

    this.log(`🔑 Worker #${workerId}: STS Token active!`);
    return data.access_token;
  }

  /**
   * PRODUCER: Splits user search items into page-level tasks in MongoDB
   */
  async produceTasks(searchesList, batchId) {
    this.log(`📦 [Master Producer] Inspecting total pages for ${searchesList.length} search criteria...`);
    const masterToken = await this.getOrRefreshToken(1);
    const tasksToEnqueue = [];

    for (const search of searchesList) {
      const hsCode = String(search.hsCode).trim();
      const countryCode = String(search.countryCode || '699').trim();
      const countryName = search.countryName || 'India';
      const tradeFlow = search.tradeFlow || 'exports';

      try {
        const flow = tradeFlow.toUpperCase().startsWith('E') ? 'E' : 'I';
        const cCode = countryCode || '000';
        const url = `https://www.trademap.org/api/companies?tradeFlow=${flow}&product=${encodeURIComponent(hsCode)}&productType=p&country=${encodeURIComponent(cCode)}&page=1&pageSize=100&sortBy=companyName&sortDir=asc`;
        const res = await fetch(url, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': `Bearer ${masterToken}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          },
        });

        const data = await res.json();
        const list = data.records || [];
        const totalRecords = data.nbRecords !== undefined ? data.nbRecords : list.length;
        const totalPages = data.nbPages !== undefined ? data.nbPages : (totalRecords > 0 ? Math.ceil(totalRecords / 100) : 0);

        this.log(`🔎 [Master Producer] HS ${hsCode} (${tradeFlow}, ${countryName}): Found ${totalRecords} records across ${totalPages} page(s)`);

        if (totalPages === 0) {
          this.log(`⚠️ HS ${hsCode} has 0 records. Skipping.`);
          continue;
        }

        for (let p = 1; p <= totalPages; p++) {
          tasksToEnqueue.push({
            hsCode,
            countryCode,
            countryName,
            tradeFlow,
            page: p,
            totalPages,
          });
        }
      } catch (err) {
        this.log(`❌ Error inspecting HS ${hsCode}: ${err.message}. Enqueuing fallback Page 1.`);
        tasksToEnqueue.push({
          hsCode,
          countryCode,
          countryName,
          tradeFlow,
          page: 1,
          totalPages: 1,
        });
      }
    }

    const count = await this.queue.enqueueBatchTasks({ batchId, tasks: tasksToEnqueue });
    this.log(`✅ [Master Producer] Successfully created ${count} discrete tasks in MongoDB Queue!`);
    return count;
  }

  /**
   * Fetch company contact details (Phone, Director, Role)
   */
  async fetchCompanyContact(token, companyId, sourceId = 1) {
    if (!companyId) return null;
    const url = `https://www.trademap.org/api/companies/contact?companyId=${encodeURIComponent(companyId)}&sourceId=${sourceId}`;
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
      });
      if (res.status === 200) return await res.json().catch(() => null);
      return null;
    } catch {
      return null;
    }
  }

  cleanDirectorName(raw) {
    if (!raw) return null;
    let name = String(raw).trim();
    name = name.replace(/^(mr\.|mrs\.|ms\.|dr\.|prof\.)\s*/i, '');
    name = name.replace(/\s+/g, ' ');
    return (name.length < 2 || name.length > 80) ? null : name;
  }

  cleanPhone(raw) {
    if (!raw) return null;
    let phone = String(raw).trim().replace(/[^\d+()\s-]/g, '').replace(/\s+/g, ' ');
    return phone.replace(/[^\d]/g, '').length < 6 ? null : phone;
  }

  /**
   * Atomic Upsert to MongoDB
   */
  async upsertCompany(rawCompany, hsCode, tradeFlowStr) {
    if (!rawCompany.name?.trim()) return null;
    const cleanName = rawCompany.name.trim();
    const finalCountry = rawCompany.country?.trim() || 'India';
    const trademapId = rawCompany.id ? String(rawCompany.id).trim() : null;

    const payload = {
      city: rawCompany.city || undefined,
      address: rawCompany.address || undefined,
      website: rawCompany.website || undefined,
      sourceUrl: rawCompany.sourceUrl || undefined,
      phone: rawCompany.phone || undefined,
      contactName: rawCompany.contactName || undefined,
      contactRole: rawCompany.contactRole || undefined,
      tradeFlow: tradeFlowStr,
      trademapId: trademapId || undefined,
    };

    let company;
    try {
      if (trademapId) {
        company = await prisma.company.upsert({
          where: { trademapId },
          update: payload,
          create: { name: cleanName, country: finalCountry, ...payload },
        });
      } else {
        company = await prisma.company.upsert({
          where: { name_country: { name: cleanName, country: finalCountry } },
          update: payload,
          create: { name: cleanName, country: finalCountry, ...payload },
        });
      }
    } catch (upsertErr) {
      company = (trademapId ? await prisma.company.findUnique({ where: { trademapId } }) : null) ||
                await prisma.company.findFirst({ where: { name: cleanName, country: finalCountry } });
    }

    if (!company) return null;

    const existingProd = await prisma.companyProduct.findFirst({
      where: { companyId: company.id, hsCode, tradeType: tradeFlowStr },
    });
    if (!existingProd) {
      await prisma.companyProduct.create({
        data: {
          companyId: company.id,
          hsCode,
          productCategory: `HS ${hsCode} Goods`,
          tradeType: tradeFlowStr,
        },
      }).catch(() => {});
    }

    return company;
  }

  /**
   * CONSUMER: Independent Worker Loop for Account #1, 2, or 3
   */
  async runWorkerLoop(workerId, batchId) {
    this.log(`👷 Worker #${workerId} started consumer loop.`);

    while (this.isRunning) {
      // 1. Claim next task atomically from MongoDB Queue
      const task = await this.queue.claimNextTask(workerId, batchId);

      if (!task) {
        // Check if entire batch is finished
        const stats = await this.queue.getBatchStats(batchId);
        if (stats.isFinished) {
          this.log(`🏁 Worker #${workerId}: No more tasks left in batch. Stopping consumer.`);
          break;
        }
        // Sleep briefly and check again
        await sleep(2000);
        continue;
      }

      this.log(`📥 Worker #${workerId} CLAIMED: Task [HS ${task.hsCode} | Page ${task.page}/${task.totalPages} | ${task.tradeFlow}]`);

      try {
        const token = await this.getOrRefreshToken(workerId);
        const flow = task.tradeFlow.toUpperCase().startsWith('E') ? 'E' : 'I';
        const cCode = task.countryCode || '000';
        const url = `https://www.trademap.org/api/companies?tradeFlow=${flow}&product=${encodeURIComponent(task.hsCode)}&productType=p&country=${encodeURIComponent(cCode)}&page=${task.page}&pageSize=100&sortBy=companyName&sortDir=asc`;

        const res = await fetch(url, {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          },
        });

        if (res.status === 401) {
          delete this.tokens[workerId];
          throw new Error('Token expired');
        }

        if (res.status === 429) {
          throw new Error('Rate limit 429 from TradeMap');
        }

        const data = await res.json();
        const rawCompanies = data.records || [];
        this.log(`📊 Worker #${workerId}: Received ${rawCompanies.length} companies for HS ${task.hsCode} (Page ${task.page})`);

        let extractedCount = 0;
        for (let i = 0; i < rawCompanies.length; i++) {
          const raw = rawCompanies[i];
          const tradeFlowStr = task.tradeFlow === 'imports' ? 'Importer' : 'Exporter';

          let phone = this.cleanPhone(raw.phone || raw.telephone);
          let contactName = null;
          let contactRole = null;

          // Enrich contact details
          const contact = await this.fetchCompanyContact(token, raw.id, raw.sourceId || 1);
          if (contact) {
            contactName = this.cleanDirectorName(contact.name || contact.contactPerson);
            contactRole = contact.role || contact.contactRole || (contactName ? 'Director' : null);
            if (contact.phone) phone = this.cleanPhone(contact.phone) || phone;
          }

          const parsed = {
            id: raw.id,
            name: raw.name || raw.company,
            country: task.countryName,
            city: raw.city || null,
            address: raw.address || raw.city || null,
            phone: phone || null,
            contactName: contactName || null,
            contactRole: contactRole || null,
            website: raw.website || null,
            sourceUrl: `https://www.trademap.org/Company_SelProduct_TS.aspx`,
          };

          await this.upsertCompany(parsed, task.hsCode, tradeFlowStr);
          extractedCount++;

          // Gentle delay
          await sleep(200);
        }

        // Mark task complete
        await this.queue.completeTask(task._id, extractedCount);
        this.log(`✅ Worker #${workerId} COMPLETED: HS ${task.hsCode} Page ${task.page} (${extractedCount} companies saved)`);
      } catch (err) {
        this.log(`⚠️ Worker #${workerId} FAILED on HS ${task.hsCode} Page ${task.page}: ${err.message}`);
        // Automatic Failover: Re-releases task to PENDING so another worker will process it!
        await this.queue.failTask(task._id, err.message);
        await sleep(3000); // Backoff before next task
      }
    }
  }

  /**
   * Generate Consolidated Excel for finished batch
   */
  async generateBatchExcels(searchesList) {
    const exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const generatedFiles = [];

    for (const search of searchesList) {
      const hsCode = String(search.hsCode).trim();
      const tradeFlow = search.tradeFlow || 'exports';
      const countryName = search.countryName || 'India';

      const products = await prisma.companyProduct.findMany({
        where: { hsCode },
        include: { company: true },
      });

      if (products.length === 0) continue;

      const rows = products.map((p, idx) => {
        const c = p.company;
        return {
          '#': idx + 1,
          'Company Name': c.name,
          'Trade Flow': p.tradeType || c.tradeFlow || 'Both',
          'Country': c.country,
          'City': c.city || 'N/A',
          'Key Contact Person': c.contactName || 'N/A',
          'Role / Designation': c.contactRole || 'Director',
          'Phone Number': c.phone || 'N/A',
          'Website': c.website || 'N/A',
          'HS Code': p.hsCode,
          'Product Category': p.productCategory,
          'Extracted At': c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A',
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `HS_${hsCode}`);

      const filename = `TradeScan_${hsCode}_${tradeFlow}_${countryName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
      const filePath = path.join(exportDir, filename);
      XLSX.writeFile(wb, filePath);

      generatedFiles.push({ hsCode, filePath, total: rows.length });
      this.log(`📁 Generated Excel for HS ${hsCode}: ${filename} (${rows.length} rows)`);
    }

    return generatedFiles;
  }

  /**
   * Main Entry Point
   */
  async runDistributedBatch(searchesList) {
    if (this.isRunning) throw new Error('A distributed batch job is already running.');
    this.isRunning = true;

    const batchId = `batch_${Date.now()}`;
    this.log('======================================================================');
    this.log(`🚀 STARTING DISTRIBUTED QUEUE BATCH: ${batchId}`);
    this.log(`👥 Active Worker Accounts: ${this.activeWorkers}`);
    this.log('======================================================================\n');

    try {
      // Step 1: Master Producer generates tasks
      const totalTasks = await this.produceTasks(searchesList, batchId);
      if (totalTasks === 0) {
        this.log('⚠️ No tasks created. Exiting batch.');
        this.isRunning = false;
        return { batchId, totalTasks: 0, files: [] };
      }

      // Step 2: Spawn 3 Consumer Workers in parallel
      const workerPromises = [];
      for (let wId = 1; wId <= this.activeWorkers; wId++) {
        workerPromises.push(this.runWorkerLoop(wId, batchId));
      }

      await Promise.all(workerPromises);

      // Step 3: Generate Excel reports
      this.log('\n📦 All workers finished! Generating consolidated Excel exports...');
      const files = await this.generateBatchExcels(searchesList);

      const finalStats = await this.queue.getBatchStats(batchId);
      this.log('\n======================================================================');
      this.log(`🎉 DISTRIBUTED BATCH FINISHED!`);
      this.log(`✅ Completed Tasks: ${finalStats.completed}/${finalStats.total}`);
      this.log(`❌ Failed Tasks: ${finalStats.failed}/${finalStats.total}`);
      this.log(`📊 Total Records Extracted: ${finalStats.totalRecordsExtracted}`);
      this.log('======================================================================\n');

      this.isRunning = false;
      this.saveState({
        completed: searchesList.map((s) => ({
          hsCode: s.hsCode,
          count: finalStats.totalRecordsExtracted,
        })),
      });
      return { batchId, stats: finalStats, files };
    } catch (err) {
      this.log(`❌ Distributed Batch Error: ${err.message}`);
      this.isRunning = false;
      this.saveState();
      throw err;
    }
  }
}

module.exports = { DistributedWorkerRunner };

if (require.main === module) {
  const args = process.argv.slice(2);
  let tasksFile = null;
  let workers = 3;

  for (const arg of args) {
    if (arg.startsWith('--tasksFile=')) tasksFile = arg.split('=')[1];
    if (arg.startsWith('--workers=')) workers = parseInt(arg.split('=')[1], 10) || 3;
  }

  let tasks = [
    { hsCode: '0101', countryCode: '699', countryName: 'India', tradeFlow: 'exports' },
    { hsCode: '0101', countryCode: '699', countryName: 'India', tradeFlow: 'imports' },
    { hsCode: '01', countryCode: '699', countryName: 'India', tradeFlow: 'exports' },
  ];

  if (tasksFile && fs.existsSync(tasksFile)) {
    try {
      tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    } catch {}
  }

  const runner = new DistributedWorkerRunner({ workerCount: workers });
  runner.runDistributedBatch(tasks).then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
