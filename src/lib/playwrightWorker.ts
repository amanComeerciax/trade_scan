import { chromium, BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { resolveCommodity } from "./aiParser";

export interface PlaywrightScrapeParams {
  country?: string;
  countryCode?: string;
  hsCode?: string;
  productCategory?: string;
  tradeFlow?: "exports" | "imports" | "both";
  limit?: number;
}

const SESSION_DIR = path.join(process.cwd(), ".session-cache", "trademap-profile");

// Country codes mapping for TradeMap (ISO 3166 / UN M49 numeric codes)
const COUNTRY_CODES: Record<string, string> = {
  india: "699",
  in: "699",
  germany: "276",
  de: "276",
  vietnam: "704",
  vn: "704",
  china: "156",
  cn: "156",
  "united states": "842",
  usa: "842",
  us: "842",
  brazil: "076",
  br: "076",
  indonesia: "360",
  id: "360",
  turkey: "792",
  tr: "792",
  italy: "380",
  it: "380",
  france: "250",
  fr: "250",
  japan: "392",
  jp: "392",
  "united kingdom": "826",
  uk: "826",
  gb: "826",
  mexico: "484",
  mx: "484",
  canada: "124",
  ca: "124",
  thailand: "764",
  th: "764",
  "united arab emirates": "784",
  uae: "784",
  ae: "784",
  "saudi arabia": "682",
  sa: "682",
  singapore: "702",
  sg: "702",
  malaysia: "458",
  my: "458",
  australia: "036",
  au: "036",
  spain: "724",
  es: "724",
  netherlands: "528",
  nl: "528",
  russia: "643",
  ru: "643",
  "south korea": "410",
  korea: "410",
  kr: "410",
  "south africa": "710",
  za: "710",
  egypt: "818",
  eg: "818",
  poland: "616",
  pl: "616",
  switzerland: "756",
  ch: "756",
  bangladesh: "050",
  bd: "050",
  "sri lanka": "144",
  lk: "144",
  pakistan: "586",
  pk: "586",
  philippines: "608",
  ph: "608",
  nigeria: "566",
  ng: "566",
  kenya: "404",
  ke: "404",
  argentina: "032",
  ar: "032",
  chile: "152",
  cl: "152",
  colombia: "170",
  co: "170",
  peru: "604",
  pe: "604",
  belgium: "056",
  be: "056",
  austria: "040",
  at: "040",
  sweden: "752",
  se: "752",
  norway: "578",
  no: "578",
  denmark: "208",
  dk: "208",
  portugal: "620",
  pt: "620",
  greece: "300",
  gr: "300",
  qatar: "634",
  qa: "634",
  kuwait: "414",
  kw: "414",
  oman: "512",
  om: "512",
};

/**
 * Launch Chromium with persistent profile directory
 */
export async function getPersistentContext(headless: boolean = true): Promise<BrowserContext> {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless,
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
    ],
  });

  return context;
}

/**
 * Interactive one-time login launcher
 * Opens a visible browser so the user can sign into TradeMap
 */
export async function launchInteractiveLogin(): Promise<void> {
  console.log("Launching TradeMap Interactive Login session...");
  console.log(`Persistent session will be stored in: ${SESSION_DIR}`);
  const context = await getPersistentContext(false);
  const page = await context.newPage();

  await page.goto("https://www.trademap.org/", { waitUntil: "domcontentloaded" });
  console.log("Browser opened. Please log in to TradeMap in the window.");
  console.log("When finished logging in, simply close the browser window.");

  // Keep alive until browser is closed
  await new Promise<void>((resolve) => {
    page.on("close", () => {
      console.log("Login window closed. Session saved successfully.");
      resolve();
    });
  });

  await context.close().catch(() => {});
}

interface RawCompanyItem {
  id?: string;
  sourceId?: number;
  name?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  website?: string;
  activities?: string;
  annualTurnover?: string;
  numberOfEmployees?: string;
  updateDate?: string;
  tradeFlow?: string;
  phone?: string;
  contactName?: string;
  contactRole?: string;
  address?: string;
  sourceUrl?: string;
}

async function extractAuthToken(page: any): Promise<string | null> {
  return page.evaluate(() => {
    let token = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try {
        const val = JSON.parse(localStorage.getItem(k || "") || "");
        if (val?.authnResult?.access_token) { token = val.authnResult.access_token; break; }
        if (val?.access_token) { token = val.access_token; break; }
      } catch {}
      const raw = localStorage.getItem(k || "");
      if (typeof raw === "string" && raw.startsWith("eyJ")) { token = raw; break; }
    }
    return token;
  }).catch(() => null);
}

/**
 * Scrape TradeMap using Playwright with persistent session & API response interception
 */
export async function scrapeTradeMapWithPlaywright(params: PlaywrightScrapeParams) {
  const targetVolume = params.limit || 25;
  const countryName = (params.country || "India").trim();
  const countryKey = countryName.toLowerCase();
  const resolvedCountryCode = params.countryCode || COUNTRY_CODES[countryKey] || "699";
  const tradeFlow = params.tradeFlow === "imports" ? "imports" : "exports";

  // Resolve HS Code using AI knowledge base if commodity name or non-numeric string is provided
  const rawCommodity = params.hsCode || params.productCategory || "";
  const resolved = resolveCommodity(rawCommodity);
  const activeHsCode = resolved.hsCode || (params.hsCode && /^[0-9]+$/.test(params.hsCode) ? params.hsCode : "");
  const activeCategory = resolved.category || params.productCategory || (activeHsCode ? `HS ${activeHsCode}` : "All Commodities");

  // Create Job in DB
  const job = await prisma.scrapeJob.create({
    data: {
      status: "RUNNING",
      source: "trademap.org (Playwright Engine)",
      target: `${countryName} | ${activeCategory || activeHsCode || "All Goods"}`,
      logs: `Playwright Scraper initialized for ${countryName} (code: ${resolvedCountryCode}). Target: ${targetVolume} companies.`,
    },
  });

  const logMessages: string[] = [
    `Playwright Engine started. Persistent Session: ${SESSION_DIR}`,
    `Target: ${countryName} [${resolvedCountryCode}] | Flow: ${tradeFlow} | HS: ${activeHsCode || "ALL"}`,
  ];

  let context: BrowserContext | null = null;
  const capturedRecords: RawCompanyItem[] = [];
  let totalMarketAvailable = 0;

  try {
    context = await getPersistentContext(true);
    const page = await context.newPage();

    // 1. Navigate to TradeMap Goods Companies
    const targetUrl = `https://www.trademap.org/en/goods/companies/c/${resolvedCountryCode}/${tradeFlow}/p/${activeHsCode || "5208"}`;
    logMessages.push(`Navigating to ${targetUrl}...`);

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(3000);

    // 2. Extract Bearer token from localStorage
    const authToken = await extractAuthToken(page);
    if (authToken) {
      logMessages.push("🔑 Authenticated TradeMap session verified. Launching JSON API extraction engine...");
    } else {
      logMessages.push("ℹ️ Proceeding with authenticated browser session cookies...");
    }

    // 3. Phase 1: High-Speed Direct JSON API Extraction Loop
    const tradeFlowCode = tradeFlow === "imports" ? "I" : "E";
    let currentPage = 1;
    let totalNbPages = 1;

    while (capturedRecords.length < targetVolume && currentPage <= totalNbPages) {
      logMessages.push(`[Phase 1 API] Querying page ${currentPage}/${totalNbPages}...`);

      const apiResult = await page.evaluate(async ({ flow, product, country, pageNum, token }) => {
        const url = `https://www.trademap.org/api/companies?tradeFlow=${flow}&product=${encodeURIComponent(product)}&productType=p&country=${country}&page=${pageNum}&size=100&sortBy=companyName&sortDir=asc`;
        const headers: Record<string, string> = {
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
        };
        if (token) {
          headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
        }
        try {
          const res = await fetch(url, { credentials: "include", headers });
          if (!res.ok) return { ok: false, status: res.status };
          const data = await res.json();
          return { ok: true, data };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }, {
        flow: tradeFlowCode,
        product: activeHsCode || "5208",
        country: resolvedCountryCode,
        pageNum: currentPage,
        token: authToken,
      }).catch((e) => ({ ok: false, error: e.message }));

      const anyResult = apiResult as any;
      if (!anyResult || !anyResult.ok || !anyResult.data) {
        logMessages.push(`[Phase 1 API] Page ${currentPage} request did not return data. Ending pagination.`);
        break;
      }

      const data = anyResult.data;
      if (typeof data.nbPages === "number" && data.nbPages > 0) totalNbPages = data.nbPages;
      if (typeof data.nbRecords === "number") totalMarketAvailable = data.nbRecords;

      const records = Array.isArray(data.records) ? data.records : [];
      logMessages.push(`[Phase 1 API] Page ${currentPage}: Received ${records.length} companies.`);

      if (records.length === 0) break;

      for (const rec of records) {
        if (rec.name && !capturedRecords.some((c) => (c.id && c.id === rec.id) || c.name === rec.name)) {
          let activitiesStr: string | undefined = undefined;
          if (Array.isArray(rec.activities) && rec.activities.length > 0) {
            activitiesStr = rec.activities.join(", ");
          }
          capturedRecords.push({
            id: rec.id ? String(rec.id) : undefined,
            sourceId: rec.sourceId || 1,
            name: rec.name,
            city: rec.city,
            country: countryName,
            countryCode: rec.countryCd ? String(rec.countryCd) : resolvedCountryCode,
            website: rec.website,
            activities: activitiesStr,
            annualTurnover: rec.annualTurnover ? String(rec.annualTurnover) : undefined,
            numberOfEmployees: rec.numberOfEmployees ? String(rec.numberOfEmployees) : undefined,
            updateDate: rec.updateDate ? String(rec.updateDate) : undefined,
            tradeFlow: tradeFlowCode === "I" ? "Importer" : "Exporter",
            sourceUrl: rec.id ? `https://www.trademap.org/companies/${rec.id}` : targetUrl,
          });
        }
      }

      if (capturedRecords.length >= targetVolume) break;
      currentPage++;
      await page.waitForTimeout(1000);
    }

    // 4. Clean, Sanitize & Upsert into Prisma PostgreSQL (Phase 1) with fast concurrency
    let savedCount = 0;
    const sanitizedBatch = capturedRecords.slice(0, targetVolume);
    const savedCompanyIds: string[] = [];

    const batchSize = 5;
    for (let i = 0; i < sanitizedBatch.length; i += batchSize) {
      const chunk = sanitizedBatch.slice(i, i + batchSize);
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const cleanName = item.name?.trim().replace(/\s+/g, " ") || "";
          if (!cleanName) return null;

          let cleanWebsite = item.website?.trim() || "";
          if (cleanWebsite && !cleanWebsite.startsWith("http://") && !cleanWebsite.startsWith("https://")) {
            cleanWebsite = `https://${cleanWebsite}`;
          }

          const externalIdValue = item.id ? `${item.id}|${item.sourceId || 1}` : null;
          const trademapIdValue = item.id || null;

          try {
            const company = await prisma.company.upsert({
              where: {
                name_country: {
                  name: cleanName,
                  country: countryName,
                },
              },
              create: {
                name: cleanName,
                country: countryName,
                countryCode: item.countryCode || resolvedCountryCode,
                city: item.city?.trim() || null,
                address: item.address?.trim() || (item.city ? `${item.city}, ${countryName}` : countryName),
                phone: item.phone?.trim() || null,
                contactName: item.contactName?.trim() || null,
                contactRole: item.contactRole?.trim() || null,
                website: cleanWebsite || null,
                sourceUrl: item.sourceUrl || targetUrl,
                externalId: externalIdValue,
                trademapId: trademapIdValue,
                sourceId: item.sourceId || 1,
                activities: item.activities || null,
                annualTurnover: item.annualTurnover || null,
                numberOfEmployees: item.numberOfEmployees || null,
                updateDate: item.updateDate || null,
                tradeFlow: item.tradeFlow || (tradeFlowCode === "I" ? "Importer" : "Exporter"),
              },
              update: {
                city: item.city?.trim() || undefined,
                website: cleanWebsite || undefined,
                externalId: externalIdValue || undefined,
                trademapId: trademapIdValue || undefined,
                sourceId: item.sourceId || undefined,
                activities: item.activities || undefined,
              },
            });

            // Attach Product relation
            if (activeCategory || activeHsCode) {
              const existingProduct = await prisma.companyProduct.findFirst({
                where: {
                  companyId: company.id,
                  hsCode: activeHsCode || null,
                  productCategory: activeCategory || null,
                },
              });

              if (!existingProduct) {
                await prisma.companyProduct.create({
                  data: {
                    companyId: company.id,
                    productCategory: activeCategory || "Traded Goods",
                    hsCode: activeHsCode || null,
                    tradeType: tradeFlow === "imports" ? "Importer" : "Exporter",
                  },
                }).catch(() => {});
              }
            }

            return company.id;
          } catch {
            return null;
          }
        })
      );

      for (const id of chunkResults) {
        if (id) {
          savedCompanyIds.push(id);
          savedCount++;
        }
      }
    }

    const infoMsg = totalMarketAvailable > 0
      ? `Phase 1 Complete: Extracted ${savedCount} profiles (out of ${totalMarketAvailable.toLocaleString()} total in TradeMap). Ready for Phase 2 enrichment.`
      : `Phase 1 Complete: Extracted ${savedCount} profiles from TradeMap. Ready for Phase 2 enrichment.`;

    logMessages.push(infoMsg);

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        recordsFound: savedCount,
        completedAt: new Date(),
        logs: logMessages.join("\n"),
      },
    }).catch(() => {});

    return {
      success: true,
      jobId: job.id,
      phase: 1,
      canEnrich: savedCount > 0,
      savedCompanyIds,
      recordsFound: savedCount,
      marketTotal: totalMarketAvailable,
      source: "trademap.org (Playwright)",
      message: infoMsg,
      companies: sanitizedBatch,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Playwright scraping error";
    logMessages.push(`Error: ${errorMsg}`);

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        logs: logMessages.join("\n"),
      },
    }).catch(() => {});

    return {
      success: false,
      jobId: job.id,
      error: errorMsg,
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

export interface PlaywrightEnrichParams {
  companyIds?: string[];
  limit?: number;
  country?: string;
}

/**
 * Phase 2: Contact Enrichment (Phone, Director/MD Name & Role)
 * Uses the authenticated TradeMap session to query the official Contact API.
 */
export async function enrichTradeMapCompaniesWithPlaywright(params: PlaywrightEnrichParams = {}) {
  const maxLimit = params.limit || 50;

  // 1. Query companies that have an externalId and are missing contact details
  const whereConditions: Prisma.CompanyWhereInput = {
    externalId: { not: null },
    OR: [
      { contactName: null },
      { contactName: "" },
      { phone: null },
      { phone: "" },
    ],
  };

  if (params.companyIds && params.companyIds.length > 0) {
    whereConditions.id = { in: params.companyIds };
  } else if (params.country) {
    whereConditions.country = params.country;
  }

  const companiesToEnrich = await prisma.company.findMany({
    where: whereConditions,
    take: maxLimit,
    orderBy: { updatedAt: "desc" },
  });

  if (companiesToEnrich.length === 0) {
    return {
      success: true,
      enrichedCount: 0,
      totalAttempted: 0,
      message: "No unenriched companies found in database.",
    };
  }

  // 2. Create ScrapeJob for Phase 2 tracking
  const job = await prisma.scrapeJob.create({
    data: {
      status: "RUNNING",
      source: "trademap.org (Phase 2 Contact Enrichment)",
      target: `Phase 2: Contact Enrichment (${companiesToEnrich.length} companies)`,
      logs: `Starting Phase 2 Contact Enrichment for ${companiesToEnrich.length} companies...`,
    },
  });

  let context: BrowserContext | null = null;
  let enrichedCount = 0;
  const logMessages: string[] = [
    `Phase 2 Enrichment started for ${companiesToEnrich.length} companies.`,
  ];

  try {
    context = await getPersistentContext(true);
    const page = await context.newPage();

    // Navigate to TradeMap to hydrate session & token
    await page.goto("https://www.trademap.org/en/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    }).catch(() => {});
    await page.waitForTimeout(2000);

    // Extract Bearer token from localStorage
    const authToken = await extractAuthToken(page);

    if (!authToken) {
      throw new Error("Could not retrieve active authentication token from TradeMap session. Please ensure your TradeMap login is active.");
    }

    logMessages.push("TradeMap authorization token verified. Querying contact records...");

    for (let i = 0; i < companiesToEnrich.length; i++) {
      const comp = companiesToEnrich[i];
      if (!comp.externalId) continue;

      const [extId, extSourceId] = comp.externalId.split("|");
      const sourceId = extSourceId || "1";

      const contactUrl = `https://www.trademap.org/api/companies/contact?companyId=${encodeURIComponent(extId)}&sourceId=${sourceId}`;

      try {
        const contactData = await page.evaluate(async ({ url, token }) => {
          try {
            const resp = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (resp.ok) {
              return await resp.json();
            }
          } catch {}
          return null;
        }, { url: contactUrl, token: authToken });

        if (contactData && typeof contactData === "object") {
          const rawName = contactData.name?.trim() || "";
          const rawRole = contactData.role?.trim() || "";
          let rawPhone = contactData.phone?.trim() || "";

          // Format international phone numbers for readability
          if (rawPhone && /^\d{10,15}$/.test(rawPhone)) {
            if (rawPhone.startsWith("91") && rawPhone.length === 12) {
              rawPhone = `+91 ${rawPhone.slice(2, 6)} ${rawPhone.slice(6)}`;
            } else {
              rawPhone = `+${rawPhone}`;
            }
          }

          if (rawName || rawRole || rawPhone) {
            await prisma.company.update({
              where: { id: comp.id },
              data: {
                contactName: rawName || undefined,
                contactRole: rawRole || undefined,
                phone: rawPhone || undefined,
                address: contactData.address?.trim() || undefined,
              },
            });
            enrichedCount++;
            logMessages.push(`[${i + 1}/${companiesToEnrich.length}] ✓ Enriched: ${comp.name} (${rawRole ? rawRole + ": " : ""}${rawName || "Phone: " + rawPhone})`);
          } else {
            logMessages.push(`[${i + 1}/${companiesToEnrich.length}] - No contact details reported for: ${comp.name}`);
          }
        }

        // Brief delay between calls to be gentle to TradeMap
        if ((i + 1) % 10 === 0) {
          await page.waitForTimeout(300);
          await prisma.scrapeJob.update({
            where: { id: job.id },
            data: {
              recordsFound: enrichedCount,
              logs: logMessages.slice(-20).join("\n"),
            },
          }).catch(() => {});
        }
      } catch (itemErr) {
        logMessages.push(`[${i + 1}/${companiesToEnrich.length}] ✗ Error for ${comp.name}: ${itemErr instanceof Error ? itemErr.message : "failed"}`);
      }
    }

    const finalMsg = `Phase 2 Complete: Enriched ${enrichedCount}/${companiesToEnrich.length} companies with direct contact details.`;
    logMessages.push(finalMsg);

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        recordsFound: enrichedCount,
        completedAt: new Date(),
        logs: logMessages.join("\n"),
      },
    }).catch(() => {});

    return {
      success: true,
      jobId: job.id,
      phase: 2,
      enrichedCount,
      totalAttempted: companiesToEnrich.length,
      message: finalMsg,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Phase 2 enrichment error";
    logMessages.push(`Error: ${errorMsg}`);

    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        logs: logMessages.join("\n"),
      },
    }).catch(() => {});

    return {
      success: false,
      jobId: job.id,
      error: errorMsg,
    };
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}
