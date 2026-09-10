import axios, { AxiosProxyConfig } from "axios";
import { prisma } from "./prisma";

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
  const targetLabel = `${countryName} | HS:${params.hsCode || "All"} | ${params.tradeFlow || "exports"}`;

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

    // Build query params matching TradeMap requirements
    const queryParams: Record<string, string | number> = {
      tradeFlow: tradeFlowCode,
      country: resolvedCountryCode,
      pageSize: params.limit || 20,
      page: 1,
    };

    if (params.hsCode && params.hsCode.trim()) {
      queryParams.productType = "p";
      queryParams.product = params.hsCode.trim();
    }

    logMessages.push(`Calling TradeMap live API: ${apiUrl}`);
    logMessages.push(`Params: country=${resolvedCountryCode} (${countryName}), flow=${tradeFlowCode}, hs=${params.hsCode || "All"}`);

    const response = await axios.get(apiUrl, {
      params: queryParams,
      headers: {
        "User-Agent": randomUserAgent,
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.trademap.org/",
        "Accept-Language": "en-US,en;q=0.9",
      },
      proxy: proxyConfig,
      timeout: 35000,
    });

    if (response.data && Array.isArray(response.data.records)) {
      const records: RawTradeMapRecord[] = response.data.records;
      const totalAvailable = response.data.nbRecords || records.length;
      logMessages.push(`TradeMap API Success: Found ${totalAvailable} total companies.`);
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
          name: rec.name.trim(),
          country: countryName,
          city: rec.city || undefined,
          address: rec.city ? `${rec.city}, ${countryName}` : countryName,
          phone: contact?.phone || undefined,
          contactName: contact?.name || undefined,
          contactRole: contact?.role || undefined,
          website: rec.website || undefined,
          sourceUrl: `https://www.trademap.org/companies/${rec.id || ""}`,
          hsCode: params.hsCode || undefined,
          productCategory: params.productCategory || (params.hsCode ? `HS ${params.hsCode} Commodity Sector` : "General Merchandise"),
          tradeType: tradeTypes,
        });
      }
    } else {
      logMessages.push("TradeMap response did not contain records array.");
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
        finishedAt: new Date(),
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
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}
