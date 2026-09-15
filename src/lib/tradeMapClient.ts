import axios, { AxiosProxyConfig } from "axios";
import { prisma } from "./prisma";
import { resolveCommodity } from "./aiParser";

export interface ScrapeParams {
  country?: string;
  countryCode?: string;
  hsCode?: string;
  productCategory?: string;
  tradeFlow?: "exports" | "imports" | "both";
  limit?: number;
}

export interface ExtractedCompany {
  name: string;
  country: string;
  city?: string;
  address?: string;
  phone?: string;
  contactName?: string;
  contactRole?: string;
  website?: string;
  sourceUrl?: string;
  hsCode?: string;
  productCategory?: string;
  tradeType?: string;
}

interface RawTradeMapRecord {
  id?: string;
  name?: string;
  city?: string;
  countryCd?: string;
  activities?: string[];
  website?: string;
  sourceId?: number;
  publicAccessToken?: string;
}

// User-Agent pool for anti-bot rotation
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

// ISO / TradeMap numeric country codes mapping (UN M49)
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

function getProxyConfig(): AxiosProxyConfig | false {
  if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
    return {
      host: process.env.PROXY_HOST,
      port: parseInt(process.env.PROXY_PORT, 10),
      auth:
        process.env.PROXY_USER && process.env.PROXY_PASSWORD
          ? {
              username: process.env.PROXY_USER,
              password: process.env.PROXY_PASSWORD,
            }
          : undefined,
    };
  }
  return false;
}

export async function executeScrapeJob(params: ScrapeParams): Promise<{
  jobId: string;
  recordsFound: number;
  marketTotal?: number;
  status: string;
  source: string;
  message: string;
}> {
  const countryName = params.country?.trim() || "India";
  const resolvedCommodity = resolveCommodity(params.hsCode);
  const activeHsCode = resolvedCommodity.hsCode || (params.hsCode && /^[0-9]+$/.test(params.hsCode) ? params.hsCode : undefined);
  const activeCategory = resolvedCommodity.category || params.productCategory || (activeHsCode ? `HS ${activeHsCode} Sector` : "General Merchandise");

  const targetLabel = `${countryName} | HS:${activeHsCode || "All"} | ${params.tradeFlow || "exports"}`;

  // 1. Create a ScrapeJob entry in DB
  const job = await prisma.scrapeJob.create({
    data: {
      status: "RUNNING",
      source: "trademap.org",
      target: targetLabel,
      recordsFound: 0,
      logs: `Starting scrape task for ${targetLabel}...\nConnecting to TradeMap live API...`,
    },
  });

  try {
    const extracted: ExtractedCompany[] = [];
    const logMessages: string[] = [`Job ${job.id} initialized.`];

    // Determine TradeMap country code (default to 699 - India if not found)
    const countryKey = countryName.toLowerCase();
    const resolvedCountryCode = params.countryCode || COUNTRY_CODES[countryKey] || "699";

    // Random User Agent
    const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const proxyConfig = getProxyConfig();

    if (proxyConfig) {
      logMessages.push(`Using configured proxy: ${proxyConfig.host}:${proxyConfig.port}`);
    }

    // TradeFlow in TradeMap API: 'E' for exports, 'I' for imports
    const tradeFlowCode = params.tradeFlow === "imports" ? "I" : "E";
    const apiUrl = "https://www.trademap.org/api/companies";

    // Multi-Page Auto-Pagination Engine
    const targetTotalRecords = params.limit || 20;
    const PAGE_SIZE = Math.min(targetTotalRecords, 25);
    const maxPagesToFetch = Math.max(1, Math.ceil(targetTotalRecords / PAGE_SIZE));

    logMessages.push(`Target volume: ${targetTotalRecords} companies across up to ${maxPagesToFetch} page(s).`);

    let totalAvailableInTradeMap = 0;

    for (let currentPage = 1; currentPage <= maxPagesToFetch; currentPage++) {
      if (extracted.length >= targetTotalRecords) break;

      // Rate limit protection: safe human jitter delay between pages
      if (currentPage > 1) {
        const jitter = 1400 + Math.floor(Math.random() * 800);
        logMessages.push(`[Pacing] Pausing ${jitter}ms before Page ${currentPage} to protect TradeMap session...`);
        await new Promise((resolve) => setTimeout(resolve, jitter));
      }

      // Build query params matching TradeMap requirements
      const queryParams: Record<string, string | number> = {
        tradeFlow: tradeFlowCode,
        country: resolvedCountryCode,
        pageSize: PAGE_SIZE,
        page: currentPage,
      };

      if (activeHsCode) {
        queryParams.productType = "p";
        queryParams.product = activeHsCode;
      }

      logMessages.push(`[Page ${currentPage}/${maxPagesToFetch}] Calling TradeMap API (country=${resolvedCountryCode}, flow=${tradeFlowCode}, hs=${activeHsCode || "All"})...`);

      let response;
      try {
        const headers: Record<string, string> = {
          "User-Agent": randomUserAgent,
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.trademap.org/",
          "Accept-Language": "en-US,en;q=0.9",
        };

        if (process.env.TRADEMAP_COOKIE) {
          headers["Cookie"] = process.env.TRADEMAP_COOKIE;
        }

        response = await axios.get(apiUrl, {
          params: queryParams,
          headers,
          proxy: proxyConfig,
          timeout: 35000,
        });
      } catch (pageErr: unknown) {
        const errMsg = pageErr instanceof Error ? pageErr.message : "Page request error";
        logMessages.push(`[Page ${currentPage}] Warning: ${errMsg}. Continuing with extracted records.`);
        break;
      }

      if (response && response.data && Array.isArray(response.data.records)) {
        const records: RawTradeMapRecord[] = response.data.records;
        totalAvailableInTradeMap = response.data.nbRecords || records.length;

        if (records.length === 0) {
          logMessages.push(`[Page ${currentPage}] No more records returned. Pagination complete.`);
          break;
        }

        logMessages.push(`[Page ${currentPage}] Received ${records.length} companies (Total in market: ${totalAvailableInTradeMap}).`);

        // Fetch contacts in parallel for speed
        const contactPromises = records.map(async (rec) => {
          if (!rec.id || !rec.sourceId || !rec.publicAccessToken) return null;
          try {
            const contactHeaders: Record<string, string> = {
              "User-Agent": randomUserAgent,
              Referer: "https://www.trademap.org/",
              "X-Public-Companies-Token": rec.publicAccessToken,
              Accept: "application/json, text/plain, */*",
            };
            if (process.env.TRADEMAP_COOKIE) {
              contactHeaders["Cookie"] = process.env.TRADEMAP_COOKIE;
            }

            const contactRes = await axios.get(
              `https://www.trademap.org/api/companies/contact?companyId=${rec.id}&sourceId=${rec.sourceId}`,
              {
                headers: contactHeaders,
                proxy: proxyConfig,
                timeout: 4500,
              }
            );
            return { id: rec.id, data: contactRes.data };
          } catch {
            return null;
          }
        });

        const contactResults = await Promise.allSettled(contactPromises);
        const contactMap = new Map<string, { name?: string; role?: string; phone?: string }>();
        for (const res of contactResults) {
          if (res.status === "fulfilled" && res.value && res.value.data) {
            contactMap.set(res.value.id, res.value.data);
          }
        }

        for (const rec of records) {
          if (!rec.name) continue;
          if (extracted.length >= targetTotalRecords) break;

          const tradeTypes = Array.isArray(rec.activities) && rec.activities.length > 0
            ? rec.activities.join(", ")
            : (params.tradeFlow === "imports" ? "Importer" : "Exporter");

          const contact = rec.id ? contactMap.get(rec.id) : undefined;

          // Data Normalization (Divy Layer)
          let cleanWebsite = rec.website?.trim() || undefined;
          if (cleanWebsite && !cleanWebsite.startsWith("http://") && !cleanWebsite.startsWith("https://")) {
            cleanWebsite = `https://${cleanWebsite}`;
          }

          const cleanPhone = contact?.phone?.trim() || undefined;
          const cleanName = rec.name.trim().replace(/\s+/g, " ");

          extracted.push({
            name: cleanName,
            country: countryName,
            city: rec.city ? rec.city.trim() : undefined,
            address: rec.city ? `${rec.city.trim()}, ${countryName}` : countryName,
            phone: cleanPhone,
            contactName: contact?.name ? contact.name.trim() : undefined,
            contactRole: contact?.role ? contact.role.trim() : undefined,
            website: cleanWebsite,
            sourceUrl: `https://www.trademap.org/companies/${rec.id || ""}`,
            hsCode: activeHsCode || undefined,
            productCategory: activeCategory || (activeHsCode ? `HS ${activeHsCode} Commodity Sector` : "General Merchandise"),
            tradeType: tradeTypes,
          });
        }

        // Incremental checkpoint log to Prisma
        await prisma.scrapeJob.update({
          where: { id: job.id },
          data: {
            recordsFound: extracted.length,
            logs: logMessages.slice(-15).join("\n"),
          },
        }).catch(() => {});
      } else {
        logMessages.push(`[Page ${currentPage}] Response did not contain records.`);
        break;
      }
    }

    // 2. Save extracted companies & products to database using relational upsert
    let savedCount = 0;
    for (const item of extracted) {
      if (!item.name) continue;

      const company = await prisma.company.upsert({
        where: {
          name_country: {
            name: item.name,
            country: item.country || countryName,
          },
        },
        update: {
          city: item.city,
          address: item.address,
          phone: item.phone,
          contactName: item.contactName,
          contactRole: item.contactRole,
          website: item.website,
          sourceUrl: item.sourceUrl,
        },
        create: {
          name: item.name,
          country: item.country || countryName,
          city: item.city,
          address: item.address,
          phone: item.phone,
          contactName: item.contactName,
          contactRole: item.contactRole,
          website: item.website,
          sourceUrl: item.sourceUrl,
        },
      });

      // Link product and HS Code
      if (item.hsCode || item.productCategory) {
        const existingProduct = await prisma.companyProduct.findFirst({
          where: {
            companyId: company.id,
            hsCode: item.hsCode || null,
          },
        });

        if (!existingProduct) {
          await prisma.companyProduct.create({
            data: {
              companyId: company.id,
              hsCode: item.hsCode,
              productCategory: item.productCategory,
              tradeType: item.tradeType || "Exporter",
            },
          });
        }
      }

      savedCount++;
    }

    logMessages.push(`Successfully saved ${savedCount} live companies with contact details.`);

    // 3. Update ScrapeJob status
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        recordsFound: savedCount,
        logs: logMessages.join("\n"),
      },
    }).catch(() => {});

    return {
      jobId: job.id,
      recordsFound: savedCount,
      marketTotal: totalAvailableInTradeMap,
      status: "COMPLETED",
      source: "trademap.org",
      message: totalAvailableInTradeMap > 0
        ? `Saved ${savedCount} profiles (out of ${totalAvailableInTradeMap.toLocaleString()} total companies available in TradeMap for this market).`
        : `Scrape completed: ${savedCount} live companies extracted from TradeMap!`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Job failed";
    if (job && job.id) {
      await prisma.scrapeJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          logs: `Error: ${message}`,
        },
      }).catch(() => {});
    }

    throw error;
  }
}
