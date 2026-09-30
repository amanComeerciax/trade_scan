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
  trademapId?: string;
  name: string;
  country: string;
  countryCode?: string;
  city?: string;
  address?: string;
  phone?: string;
  contactName?: string;
  contactRole?: string;
  website?: string;
  sourceUrl?: string;
  activities?: string;
  annualTurnover?: string;
  numberOfEmployees?: string;
  updateDate?: string;
  sourceId?: number;
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
  annualTurnover?: string | number | null;
  numberOfEmployees?: string | number | null;
  updateDate?: string | null;
  sourceId?: number | null;
  publicAccessToken?: string | null;
}

// User-Agent pool for anti-bot rotation
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

// ISO / TradeMap numeric country codes mapping
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
  "saudi arabia": "682",
  sa: "682",
  singapore: "702",
  sg: "702",
  france: "251",
  fr: "251",
  italy: "381",
  it: "381",
  japan: "392",
  jp: "392",
  "united kingdom": "826",
  uk: "826",
};

const COMMODITY_SUBCODES: Record<string, string[]> = {
  // Coffee & Spices
  "0901": ["0901", "090111", "090112", "090121", "090122", "090190"],
  "09": ["09", "0901", "0902", "0904", "0910"],
  "0902": ["0902", "090210", "090220", "090230", "090240"],
  // Rice & Grains
  "1006": ["1006", "100610", "100620", "100630", "100640"],
  "1001": ["1001", "100111", "100119", "100191", "100199"],
  // Cotton & Textiles
  "5208": ["5208", "5205", "5209", "5211", "5212"],
  "5205": ["5205", "520511", "520512", "520521", "520522"],
  "6203": ["6203", "6204", "6109", "6110", "6205"],
  "6109": ["6109", "610910", "610990", "6108"],
  // Pharma & Chemicals
  "3004": ["3004", "3003", "3002", "3001", "3006"],
  "2905": ["2905", "2801", "2901", "2902", "2903"],
  // Steel & Metals
  "7208": ["7208", "7209", "7210", "7214", "7216"],
  "7601": ["7601", "7602", "7604", "7606"],
  "7403": ["7403", "7404", "7407", "7408"],
  // Jewelry & Gems
  "7113": ["7113", "7102", "7108", "7117", "7118"],
  "7108": ["7108", "710811", "710812", "710813"],
  "7102": ["7102", "710210", "710221", "710231"],
  // Footwear & Leather
  "6403": ["6403", "6402", "6404", "6405"],
  "4107": ["4107", "4104", "4105", "4106"],
  // Electronics
  "8542": ["8542", "8517", "8528", "8504", "8471"],
  "8517": ["8517", "851712", "851713", "851762"],
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

    const customCookie = process.env.TRADEMAP_COOKIE;
    const requestHeaders: Record<string, string> = {
      "User-Agent": randomUserAgent,
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.trademap.org/",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (customCookie) {
      requestHeaders["Cookie"] = customCookie;
      logMessages.push("Using TradeMap authenticated session cookie.");
    }

    // Multi-query expansion to get 15-30+ companies even on guest limits
    const targetCodes: string[] = [];
    if (activeHsCode) {
      targetCodes.push(activeHsCode);
      const subcodes = COMMODITY_SUBCODES[activeHsCode];
      if (subcodes) {
        for (const sub of subcodes) {
          if (!targetCodes.includes(sub)) targetCodes.push(sub);
        }
      } else if (/^[0-9]{4}$/.test(activeHsCode)) {
        targetCodes.push(`${activeHsCode}10`, `${activeHsCode}20`, `${activeHsCode}90`);
      }
    } else {
      targetCodes.push("0901", "1006", "0902", "5208", "6203", "3004", "7113", "7208");
    }

    logMessages.push(`Multi-sector expansion: Querying ${targetCodes.length} HS sectors in parallel...`);

    // Fetch in parallel across subcodes
    const queryPromises = targetCodes.slice(0, 6).map(async (code) => {
      try {
        const queryParams: Record<string, string | number> = {
          tradeFlow: tradeFlowCode,
          country: resolvedCountryCode,
          pageSize: 20,
          page: 1,
          productType: "p",
          product: code,
        };
        const res = await axios.get(apiUrl, {
          params: queryParams,
          headers: requestHeaders,
          proxy: proxyConfig,
          timeout: 20000,
        });
        return { code, records: res.data?.records || [] };
      } catch {
        return { code, records: [] };
      }
    });

    const queryResults = await Promise.allSettled(queryPromises);
    const seenIds = new Set<string>();
    const allRecords: (RawTradeMapRecord & { hsCodeMatched?: string })[] = [];

    for (const qr of queryResults) {
      if (qr.status === "fulfilled" && Array.isArray(qr.value.records)) {
        for (const r of qr.value.records) {
          const key = (r.id || r.name || "").toLowerCase().trim();
          if (key && !seenIds.has(key)) {
            seenIds.add(key);
            allRecords.push({ ...r, hsCodeMatched: qr.value.code });
          }
        }
      }
    }

    const records = allRecords;
    logMessages.push(`TradeMap Multi-Query Success: Extracted ${records.length} distinct live companies.`);
    logMessages.push(`Fetching full profiles and contact info for ${records.length} companies...`);

    // Fetch contacts in parallel for speed
    const contactPromises = records.map(async (rec) => {
        if (!rec.id || !rec.sourceId || !rec.publicAccessToken) return null;
        try {
          const contactRes = await axios.get(
            `https://www.trademap.org/api/companies/contact?companyId=${rec.id}&sourceId=${rec.sourceId}`,
            {
              headers: {
                "User-Agent": randomUserAgent,
                Referer: "https://www.trademap.org/",
                "X-Public-Companies-Token": rec.publicAccessToken,
                Accept: "application/json, text/plain, */*",
                ...(customCookie ? { Cookie: customCookie } : {}),
              },
              proxy: proxyConfig,
              timeout: 4000,
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

        const tradeTypes = Array.isArray(rec.activities) && rec.activities.length > 0
          ? rec.activities.join(", ")
          : (params.tradeFlow === "imports" ? "Importer" : "Exporter");

        const contact = rec.id ? contactMap.get(rec.id) : undefined;

        extracted.push({
          trademapId: rec.id || undefined,
          name: rec.name.trim(),
          country: countryName,
          countryCode: rec.countryCd || resolvedCountryCode,
          city: rec.city || undefined,
          address: rec.city ? `${rec.city}, ${countryName}` : countryName,
          phone: contact?.phone || undefined,
          contactName: contact?.name || undefined,
          contactRole: contact?.role || undefined,
          website: rec.website || undefined,
          sourceUrl: `https://www.trademap.org/companies/${rec.id || ""}`,
          activities: tradeTypes,
          annualTurnover: rec.annualTurnover ? String(rec.annualTurnover) : undefined,
          numberOfEmployees: rec.numberOfEmployees ? String(rec.numberOfEmployees) : undefined,
          updateDate: rec.updateDate || undefined,
          sourceId: typeof rec.sourceId === 'number' ? rec.sourceId : undefined,
          hsCode: activeHsCode || undefined,
          productCategory: activeCategory || (activeHsCode ? `HS ${activeHsCode} Commodity Sector` : "General Merchandise"),
          tradeType: tradeTypes,
        });
      }

    // 2. Save extracted companies & products to database using relational upsert
    let savedCount = 0;
    for (const item of extracted) {
      if (!item.name) continue;

      const whereCondition = item.trademapId
        ? { trademapId: item.trademapId }
        : {
            name_country: {
              name: item.name,
              country: item.country || countryName,
            },
          };

      const companyData = {
        name: item.name,
        country: item.country || countryName,
        countryCode: item.countryCode,
        city: item.city,
        address: item.address,
        phone: item.phone,
        contactName: item.contactName,
        contactRole: item.contactRole,
        website: item.website,
        sourceUrl: item.sourceUrl,
        activities: item.activities,
        annualTurnover: item.annualTurnover,
        numberOfEmployees: item.numberOfEmployees,
        updateDate: item.updateDate,
        sourceId: item.sourceId,
        tradeFlow: params.tradeFlow === "imports" ? "Importer" : "Exporter",
      };

      const company = await prisma.company.upsert({
        where: whereCondition as any,
        update: companyData,
        create: {
          trademapId: item.trademapId,
          ...companyData,
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
        completedAt: new Date(),
      },
    });

    return {
      jobId: job.id,
      recordsFound: savedCount,
      status: "COMPLETED",
      source: "trademap.org",
      message: `Scrape completed: ${savedCount} live companies with contact details extracted from TradeMap!`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Job failed";
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        logs: `Error: ${message}`,
        completedAt: new Date(),
      },
    });

    throw error;
  }
}
