/**
 * 🏭 TradeScan TURBO DIRECT-API BATCH WORKER ENGINE
 * ==================================================================================
 * Direct TradeMap STS OAuth2 password grant + Direct TradeMap API execution.
 * - Zero Chrome Popups / Zero Browser crashes
 * - Isolated Accounts (Worker 1, 2, 3)
 * - Automatic 1-hour Token Renewals
 * - Full Enrichment: Director Names, Roles, Phone Numbers, MongoDB Atlas upserts
 * - Isolated Unmixed Excel Exports per HS code
 * ==================================================================================
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

const ISO_COUNTRY_MAP = {
  '000': 'World', '699': 'India', '156': 'China', '842': 'United States',
  '276': 'Germany', '764': 'Thailand', '704': 'Vietnam', '360': 'Indonesia',
  '784': 'United Arab Emirates', '682': 'Saudi Arabia', '826': 'United Kingdom',
};

const WORKER_CREDENTIALS = {
  1: { username: 'kingamaan14@gmail.com', password: '7861Amaan' },
  2: { username: 'modipriyanshi013@gmail.com', password: 'Priyanshi@1301' },
  3: { username: 'trademap1235665@gmail.com', password: 'thakkar@3108' },
};

class BatchWorker {
  constructor(workerId, options = {}) {
    this.workerId = Number(workerId);
    this.credentials = WORKER_CREDENTIALS[this.workerId] || WORKER_CREDENTIALS[1];
    this.pageSize = options.pageSize || 100;
    this.apiDelayMs = options.apiDelayMs || 450;
    this.pageDelayMs = options.pageDelayMs || 1500;
    this.logCallback = options.onLog || console.log;

    this.cachedToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = 0;
  }

  log(msg) {
    const time = new Date().toLocaleTimeString();
    this.logCallback(`[Worker #${this.workerId} | ${time}] ${msg}`);
  }

  async close() {
    // Pure HTTP worker: no lingering browser instances to close
    this.log('Worker closed cleanly.');
  }

  async authenticateSTS() {
    this.log(`🔐 Authenticating Account #${this.workerId} (${this.credentials.username}) via TradeMap STS...`);
    try {
      const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: 'TradeMap',
          grant_type: 'password',
          username: this.credentials.username,
          password: this.credentials.password,
          scope: 'openid profile offline_access TradeMap.API Account.API',
        }).toString(),
      });

      const data = await res.json();
      if (data.access_token) {
        this.cachedToken = data.access_token;
        this.refreshToken = data.refresh_token || null;
        this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) - 120) * 1000;
        this.log(`🔑 Account #${this.workerId}: STS Token active! (Valid 1 hour)`);
        return this.cachedToken;
      }

      throw new Error(data.error_description || data.error || 'STS Auth Failed');
    } catch (err) {
      this.log(`❌ STS Auth error: ${err.message}`);
      return null;
    }
  }

  async refreshTokenViaSTS() {
    if (!this.refreshToken) {
      return await this.authenticateSTS();
    }

    try {
      this.log(`🔄 Refreshing STS Token for Account #${this.workerId}...`);
      const res = await fetch('https://sts.marketanalysis.intracen.org/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: 'TradeMap',
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }).toString(),
      });

      const data = await res.json();
      if (data.access_token) {
        this.cachedToken = data.access_token;
        if (data.refresh_token) this.refreshToken = data.refresh_token;
        this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) - 120) * 1000;
        this.log(`🔑 Account #${this.workerId}: Token refreshed successfully.`);
        return this.cachedToken;
      }
    } catch (e) {}

    // Fallback to full password grant
    return await this.authenticateSTS();
  }

  async getValidToken() {
    if (this.cachedToken && this.tokenExpiresAt > Date.now()) {
      return this.cachedToken;
    }
    return await this.refreshTokenViaSTS();
  }

  async fetchCompaniesPage(token, { countryCode, hsCode, tradeFlow, pageIndex, sortDir = 'asc' }) {
    const flow = tradeFlow.toUpperCase().startsWith('E') ? 'E' : 'I';
    const cCode = countryCode === '000' ? '' : countryCode;
    const url = `https://www.trademap.org/api/companies?tradeFlow=${flow}&product=${hsCode}&productType=p&country=${cCode}&page=${pageIndex}&pageSize=${this.pageSize}&sortBy=companyName&sortDir=${sortDir}`;

    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
      });

      const status = res.status;
      if (status === 200) {
        const body = await res.json();
        return { status, body };
      }
      return { status, body: null };
    } catch (err) {
      return { status: 0, error: err.message };
    }
  }

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

      if (res.status === 200) {
        return await res.json().catch(() => null);
      }
      if (res.status === 403) return { rateLimit: true };
      if (res.status === 401) return { needRefresh: true };
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
    if (name.length < 2 || name.length > 80) return null;
    return name;
  }

  cleanPhone(raw) {
    if (!raw) return null;
    let phone = String(raw).trim();
    phone = phone.replace(/[^\d+()\s-]/g, '').replace(/\s+/g, ' ');
    if (phone.replace(/[^\d]/g, '').length < 6) return null;
    return phone;
  }

  async upsertCompany(rawCompany, hsCode, tradeFlowStr) {
    if (!rawCompany.name?.trim()) return { status: 'skipped' };
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
    let isInsert = false;

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

    if (!company) return { status: 'skipped' };

    // Link CompanyProduct
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

    return { status: isInsert ? 'inserted' : 'updated', company };
  }

  async generateExcelForHs(hsCode, tradeFlow, countryName) {
    try {
      const exportDir = path.join(process.cwd(), 'exports');
      if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

      const products = await prisma.companyProduct.findMany({
        where: { hsCode },
        include: { company: true },
      });

      if (products.length === 0) return null;

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

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `HS_${hsCode}`);

      const filename = `TradeScan_${hsCode}_${tradeFlow}_${countryName.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
      const filePath = path.join(exportDir, filename);
      XLSX.writeFile(wb, filePath);

      return { filename, filePath, count: rows.length };
    } catch (err) {
      this.log(`⚠️ Excel export error: ${err.message}`);
      return null;
    }
  }

  async scrapeHsCode({ hsCode, countryCode = '699', tradeFlow = 'exports', onProgress }) {
    const cleanHs = String(hsCode).trim();
    const countryName = ISO_COUNTRY_MAP[countryCode] || 'India';
    const flowStr = tradeFlow.toUpperCase().startsWith('E') ? 'Exporter' : 'Importer';

    this.log(`🚀 Starting Extraction for HS ${cleanHs} (${flowStr}s | ${countryName})`);

    let token = await this.getValidToken();
    if (!token) {
      throw new Error(`Worker #${this.workerId}: Could not obtain valid TradeMap token via STS.`);
    }

    let totalExtracted = 0;
    const passes = ['asc', 'desc'];

    for (const sortDir of passes) {
      let pageIndex = 1;
      let totalPages = 1;

      while (pageIndex <= totalPages) {
        token = await this.getValidToken();
        const res = await this.fetchCompaniesPage(token, {
          countryCode,
          hsCode: cleanHs,
          tradeFlow,
          pageIndex,
          sortDir,
        });

        if (res.status === 401 || res.status === 400) {
          this.log(`⚠️ HTTP ${res.status}: Refreshing token via STS...`);
          token = await this.refreshTokenViaSTS();
          continue;
        }

        if (res.status === 403) {
          this.log('🛑 Rate limit 403 detected. Cooling down for 30s...');
          await sleep(30000);
          token = await this.refreshTokenViaSTS();
          continue;
        }

        if (!res.body || !res.body.records) {
          this.log(`Page ${pageIndex} returned empty data. Ending pass.`);
          break;
        }

        const list = res.body.records || [];
        const totalRecords = res.body.nbRecords || list.length;
        totalPages = res.body.nbPages || Math.min(Math.ceil(totalRecords / this.pageSize), 70);

        this.log(`📄 [${sortDir.toUpperCase()}] Page ${pageIndex}/${totalPages} | Received ${list.length} companies (Goal: ${totalRecords})`);

        for (const item of list) {
          let contactName = null;
          let contactRole = null;
          let phone = this.cleanPhone(item.phone || item.telephone);

          // Fetch contact details (director name & phone)
          if (item.id) {
            const contact = await this.fetchCompanyContact(token, item.id, item.sourceId || 1);
            if (contact && !contact.rateLimit && !contact.needRefresh) {
              contactName = this.cleanDirectorName(contact.name || contact.contactPerson);
              contactRole = contact.role || contact.contactRole || (contactName ? 'Director' : null);
              if (contact.phone) phone = this.cleanPhone(contact.phone) || phone;
            } else if (contact && contact.rateLimit) {
              await sleep(15000);
            }
          }

          const companyData = {
            id: item.id,
            name: item.name || item.company,
            city: item.city,
            address: item.address || item.city,
            website: item.website,
            sourceUrl: `https://www.trademap.org/en/goods/companies/c/${countryCode}/${tradeFlow}/p/${cleanHs}`,
            phone,
            contactName,
            contactRole,
            country: countryName,
          };

          await this.upsertCompany(companyData, cleanHs, flowStr);
          totalExtracted++;
          await sleep(this.apiDelayMs);
        }

        if (onProgress) {
          onProgress({
            workerId: this.workerId,
            hsCode: cleanHs,
            page: pageIndex,
            totalPages,
            totalExtracted,
          });
        }

        pageIndex++;
        await sleep(this.pageDelayMs);
      }

      // If records <= 7000, Pass 1 covers all, no need for Pass 2
      if (totalPages < 70) break;
    }

    // Auto-generate dedicated Excel
    const excelInfo = await this.generateExcelForHs(cleanHs, tradeFlow, countryName);
    this.log(`🎉 Finished HS ${cleanHs}! Total Verified Profiles: ${excelInfo?.count || totalExtracted}`);
    return { hsCode: cleanHs, count: excelInfo?.count || totalExtracted, excel: excelInfo?.filePath };
  }
}

module.exports = { BatchWorker };
