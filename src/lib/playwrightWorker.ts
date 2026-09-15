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
  website?: string;
  phone?: string;
  contactName?: string;
  contactRole?: string;
  address?: string;
  sourceUrl?: string;
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

    // 1. Intercept internal JSON network responses
    page.on("response", async (response) => {
      try {
        const url = response.url();
        if (url.includes("/companies") && response.status() === 200) {
          const contentType = response.headers()["content-type"] || "";
          if (contentType.includes("application/json")) {
            const data = await response.json();
            if (data && Array.isArray(data.records)) {
              if (typeof data.nbRecords === "number" && data.nbRecords > 0) {
                totalMarketAvailable = data.nbRecords;
              }
              for (const rec of data.records) {
                if (rec.name && !capturedRecords.some((c) => c.name === rec.name)) {
                  capturedRecords.push({
                    id: rec.id,
                    sourceId: rec.sourceId,
                    name: rec.name,
                    city: rec.city,
                    country: countryName,
                    website: rec.website,
                    sourceUrl: url,
                  });
                }
              }
            }
          }
        }
      } catch {
        // ignore JSON parse errors for non-JSON responses
      }
    });

    // 2. Navigate to TradeMap Goods Companies
    const targetUrl = `https://www.trademap.org/en/goods/companies/c/${resolvedCountryCode}/${tradeFlow}/p/${activeHsCode || "ALL"}`;
    logMessages.push(`Navigating to ${targetUrl}...`);

    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 }).catch(async () => {
      await page.waitForLoadState("domcontentloaded");
    });

    // Wait for TradeMap Angular SPA to load and stream the initial companies API response
    logMessages.push("Waiting for TradeMap initial data stream...");
    if (capturedRecords.length === 0) {
      try {
        await page.waitForResponse(
          (res) => res.url().includes("/companies") && res.status() === 200,
          { timeout: 15000 }
        );
        await page.waitForTimeout(1500);
      } catch {
        await page.waitForTimeout(3000);
      }
    }

    logMessages.push(`Page loaded. Intercepted ${capturedRecords.length} companies from initial network stream.`);

    // 3. Fallback: Scan rendered DOM cards only if network didn't intercept enough
    if (capturedRecords.length < targetVolume) {
      const domCompanies = await page.evaluate(() => {
        const results: { name: string; city?: string; website?: string }[] = [];
        const titles = document.querySelectorAll(".company-name, h3.company-title, a[href*='/companies/']");
        const IGNORE_WORDS = ["companies", "company", "exporting companies", "importing companies", "trademap", "home", "back", "next", "previous", "view", "contact"];
        titles.forEach((el) => {
          const raw = el.textContent?.trim() || "";
          const firstLine = raw.split("\n")[0].trim();
          if (
            firstLine &&
            firstLine.length > 2 &&
            firstLine.length < 80 &&
            !IGNORE_WORDS.includes(firstLine.toLowerCase())
          ) {
            results.push({ name: firstLine });
          }
        });
        return results;
      });

      for (const d of domCompanies) {
        if (!capturedRecords.some((c) => c.name && c.name.toLowerCase() === d.name.toLowerCase())) {
          capturedRecords.push({
            name: d.name,
            country: countryName,
          });
        }
      }
    }

    // 4. Handle Multi-Page Auto-Pagination
    let currentPage = 1;
    const totalPages = totalMarketAvailable > 0 ? Math.ceil(totalMarketAvailable / 10) : 100;
    const maxPages = Math.min(Math.ceil(targetVolume / 10), totalPages, 200);
    let consecutiveFailures = 0;

    while (capturedRecords.length < targetVolume && currentPage < maxPages) {
      if (totalMarketAvailable > 0 && capturedRecords.length >= totalMarketAvailable) {
        logMessages.push(`[Pagination] Extracted all ${capturedRecords.length} companies available in this TradeMap market.`);
        break;
      }

      currentPage++;
      const prevCount = capturedRecords.length;
      logMessages.push(`[Pagination] Loading Page ${currentPage}...`);

      // Ensure paginator is scrolled into view
      await page.evaluate(() => {
        const paginator = document.querySelector('.paginator, .pages, [class*="paginat"], nav[aria-label*="page"]');
        if (paginator) paginator.scrollIntoView({ behavior: 'instant', block: 'end' });
      }).catch(() => {});
      await page.waitForTimeout(500);

      let clicked = false;

      // Strategy 1: Click the "Next" (>) button — most reliable for sequential pagination
      if (!clicked) {
        try {
          clicked = await page.evaluate(() => {
            // Look for common "next page" button patterns
            const allBtns = Array.from(document.querySelectorAll('button, a.page-link, [class*="page"] button, [class*="page"] a'));
            const nextBtn = allBtns.find((b) => {
              const txt = (b.textContent || '').trim();
              const title = (b.getAttribute('title') || '').toLowerCase();
              const aria = (b.getAttribute('aria-label') || '').toLowerCase();
              return (
                txt === '>' || txt === '›' || txt === '»' || txt === '>>' ||
                txt.toLowerCase() === 'next' ||
                title.includes('next') || aria.includes('next') ||
                b.classList.contains('next') ||
                b.querySelector('span.next, i.next, .fa-chevron-right, .fa-angle-right') !== null
              );
            });
            if (nextBtn && nextBtn instanceof HTMLElement && !nextBtn.hasAttribute('disabled')) {
              nextBtn.click();
              return true;
            }
            return false;
          });
        } catch {
          clicked = false;
        }
      }

      // Strategy 2: Click the sibling button right after the currently active one
      if (!clicked) {
        try {
          clicked = await page.evaluate(() => {
            const active = document.querySelector('.pages button.active, [class*="page"] button.active, button[aria-current="page"]');
            if (active) {
              let next = active.nextElementSibling;
              // Skip over dots/ellipsis elements to find the next real page button
              while (next && (next.textContent?.trim() === '...' || next.textContent?.trim() === '…')) {
                next = next.nextElementSibling;
              }
              if (next && next instanceof HTMLElement && !next.hasAttribute('disabled')) {
                next.click();
                return true;
              }
            }
            return false;
          });
        } catch {
          clicked = false;
        }
      }

      // Strategy 3: Try finding exact page number button in the DOM
      if (!clicked) {
        try {
          clicked = await page.evaluate((targetPage) => {
            const btns = Array.from(document.querySelectorAll('.pages button, [class*="page"] button, button'));
            const targetBtn = btns.find((b) => {
              const txt = b.textContent?.trim();
              return txt === String(targetPage) && !b.hasAttribute('disabled');
            });
            if (targetBtn && targetBtn instanceof HTMLElement) {
              targetBtn.click();
              return true;
            }
            return false;
          }, currentPage);
        } catch {
          clicked = false;
        }
      }

      // Strategy 4: Click "..." (dots/ellipsis) button to expand more pages, then click the target number
      if (!clicked) {
        try {
          const dotsClicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const dots = btns.find((b) => {
              const t = b.textContent?.trim();
              return t === '...' || t === '…';
            });
            if (dots && dots instanceof HTMLElement) {
              dots.click();
              return true;
            }
            return false;
          });
          if (dotsClicked) {
            await page.waitForTimeout(1000);
            // Now try the exact page number again after dots expanded
            clicked = await page.evaluate((targetPage) => {
              const btns = Array.from(document.querySelectorAll('.pages button, [class*="page"] button, button'));
              const targetBtn = btns.find((b) => b.textContent?.trim() === String(targetPage));
              if (targetBtn && targetBtn instanceof HTMLElement) {
                targetBtn.click();
                return true;
              }
              // If specific number still not found, click next after active
              const active = document.querySelector('.pages button.active, button.active');
              const next = active?.nextElementSibling;
              if (next && next instanceof HTMLElement && next.textContent?.trim() !== '...' && next.textContent?.trim() !== '…') {
                next.click();
                return true;
              }
              return false;
            }, currentPage);
          }
        } catch {
          clicked = false;
        }
      }

      if (clicked) {
        // Wait for api/companies network response (the interceptor will capture data automatically)
        try {
          await page.waitForResponse(
            (res) => res.url().includes("api/companies") && res.status() === 200,
            { timeout: 12000 }
          );
          // Grace period for data hydration
          await page.waitForTimeout(1000);
        } catch {
          // If no network response captured, fall back to generous timeout
          await page.waitForTimeout(4000);
        }

        const newCount = capturedRecords.length;
        logMessages.push(`[Pagination] Page ${currentPage} loaded. Total captured so far: ${newCount}`);

        // Track if we're not getting new data
        if (newCount === prevCount) {
          consecutiveFailures++;
          logMessages.push(`[Pagination] Warning: No new records on page ${currentPage} (attempt ${consecutiveFailures}/5).`);
          if (consecutiveFailures >= 5) {
            logMessages.push(`[Pagination] Stopping after 5 consecutive empty pages.`);
            break;
          }
        } else {
          consecutiveFailures = 0;
        }
      } else {
        logMessages.push(`[Pagination] Page control for ${currentPage} not reachable. Stopping at ${capturedRecords.length} records.`);
        break;
      }
    }

    // 5. Clean, Sanitize & Upsert into Prisma PostgreSQL (Phase 1)
    let savedCount = 0;
    const sanitizedBatch = capturedRecords.slice(0, targetVolume);
    const savedCompanyIds: string[] = [];

    for (const item of sanitizedBatch) {
      const cleanName = item.name?.trim().replace(/\s+/g, " ") || "";
      if (!cleanName) continue;

      let cleanWebsite = item.website?.trim() || "";
      if (cleanWebsite && !cleanWebsite.startsWith("http://") && !cleanWebsite.startsWith("https://")) {
        cleanWebsite = `https://${cleanWebsite}`;
      }

      const externalIdValue = item.id ? `${item.id}|${item.sourceId || 1}` : null;

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
          city: item.city?.trim() || null,
          address: item.address?.trim() || null,
          phone: item.phone?.trim() || null,
          contactName: item.contactName?.trim() || null,
          contactRole: item.contactRole?.trim() || null,
          website: cleanWebsite || null,
          sourceUrl: item.sourceUrl || targetUrl,
          externalId: externalIdValue,
        },
        update: {
          city: item.city?.trim() || undefined,
          address: item.address?.trim() || undefined,
          phone: item.phone?.trim() || undefined,
          contactName: item.contactName?.trim() || undefined,
          contactRole: item.contactRole?.trim() || undefined,
          website: cleanWebsite || undefined,
          externalId: externalIdValue || undefined,
        },
      });

      savedCompanyIds.push(company.id);

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
          });
        }
      }

      savedCount++;
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
    const authToken = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem("0-TradeMap");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.authnResult?.access_token || parsed.authzData || null;
      } catch {
        return null;
      }
    });

    if (!authToken) {
      throw new Error("Could not retrieve active authentication token from TradeMap session. Please run login.");
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
