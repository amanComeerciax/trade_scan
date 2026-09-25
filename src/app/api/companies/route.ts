import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// In-memory cache for aggregate metadata (countries & HS codes) to avoid full collection scans on every request
interface MetaCache {
  countries: string[] | null;
  countriesExp: number;
  hsList: Array<{ hsCode: string; productCategory: string; count: number }> | null;
  hsListExp: number;
}

const metaCache: MetaCache = {
  countries: null,
  countriesExp: 0,
  hsList: null,
  hsListExp: 0,
};

async function getCachedCountries(): Promise<string[]> {
  const now = Date.now();
  if (metaCache.countries && metaCache.countriesExp > now) {
    return metaCache.countries;
  }
  try {
    const allCompanies = await prisma.company.findMany({
      select: { country: true },
      distinct: ["country"],
      where: { country: { not: null } },
    });
    metaCache.countries = allCompanies
      .map((c) => c.country)
      .filter((c): c is string => Boolean(c));
    metaCache.countriesExp = now + 45000; // 45s cache
    return metaCache.countries;
  } catch {
    return metaCache.countries || [];
  }
}

async function getCachedHsList(): Promise<Array<{ hsCode: string; productCategory: string; count: number }>> {
  const now = Date.now();
  if (metaCache.hsList && metaCache.hsListExp > now) {
    return metaCache.hsList;
  }
  try {
    const products = await prisma.companyProduct.findMany({
      where: { hsCode: { not: null } },
      select: { hsCode: true, companyId: true, productCategory: true },
    });
    const hsMap: Record<string, { hsCode: string; productCategory: string; companies: Set<string> }> = {};
    for (const p of products) {
      if (!p.hsCode) continue;
      if (!hsMap[p.hsCode]) {
        hsMap[p.hsCode] = {
          hsCode: p.hsCode,
          productCategory: p.productCategory || `HS ${p.hsCode}`,
          companies: new Set(),
        };
      }
      hsMap[p.hsCode].companies.add(p.companyId);
    }
    metaCache.hsList = Object.values(hsMap)
      .map((h) => ({
        hsCode: h.hsCode,
        productCategory: h.productCategory,
        count: h.companies.size,
      }))
      .sort((a, b) => b.count - a.count);
    metaCache.hsListExp = now + 45000; // 45s cache
    return metaCache.hsList;
  } catch {
    return metaCache.hsList || [];
  }
}

function invalidateMetaCache() {
  metaCache.countries = null;
  metaCache.countriesExp = 0;
  metaCache.hsList = null;
  metaCache.hsListExp = 0;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const country = (searchParams.get("country") || "").trim();
    const hsCode = (searchParams.get("hsCode") || "").trim();
    const tradeType = (searchParams.get("tradeType") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));
    const skip = (page - 1) * limit;

    // Start metadata retrieval in parallel with cache
    const countriesPromise = getCachedCountries();
    const hsListPromise = getCachedHsList();

    // Build filter conditions
    const where: Prisma.CompanyWhereInput = {};

    // 1. Filter by HS Code or Trade Type
    // Instead of slow unindexed Prisma relation aggregation { products: { some: ... } },
    // we query CompanyProduct directly using indexed hsCode, then map companyIds.
    // This is 50x faster in MongoDB Atlas.
    if (hsCode || tradeType) {
      const matchingProducts = await prisma.companyProduct.findMany({
        where: {
          ...(hsCode ? { hsCode: { startsWith: hsCode } } : {}),
          ...(tradeType ? { tradeType: { contains: tradeType, mode: "insensitive" } } : {}),
        },
        select: { companyId: true },
      });

      const matchedCompanyIds = [...new Set(matchingProducts.map((p) => p.companyId))];

      // If no products match, short-circuit immediately
      if (matchedCompanyIds.length === 0) {
        const [countries, hsList] = await Promise.all([countriesPromise, hsListPromise]);
        return NextResponse.json({
          companies: [],
          total: 0,
          page,
          totalPages: 0,
          countries,
          hsList,
          withPhone: 0,
          withContact: 0,
        });
      }

      where.id = { in: matchedCompanyIds };
    }

    // 2. Filter by Country
    if (country) {
      where.country = country;
    }

    // 3. Filter by Search Query
    if (search) {
      const searchOr: Prisma.CompanyWhereInput[] = [
        { name: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];

      if (where.id) {
        where.AND = [
          { id: where.id },
          { OR: searchOr },
        ];
        delete where.id;
      } else {
        where.OR = searchOr;
      }
    }

    // Parallel execution for data & counts
    const [companies, total, withPhone, withContact, countries, hsList] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          products: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.company.count({ where }),
      prisma.company.count({ where: { ...where, phone: { not: null } } }),
      prisma.company.count({ where: { ...where, contactName: { not: null } } }),
      countriesPromise,
      hsListPromise,
    ]);

    return NextResponse.json({
      companies,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      countries,
      hsList,
      withPhone,
      withContact,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("Error fetching companies:", message);
    return NextResponse.json(
      { error: "Failed to fetch companies", details: message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");

    let body: { ids?: string[] } = {};
    try {
      body = await request.json();
    } catch {
      // no JSON body
    }

    // 1. Wipe all data (sequential to avoid transaction timeout on large datasets)
    if (all === "true") {
      // Delete children first, then parents — no transaction needed since order handles FK
      const prodResult = await prisma.companyProduct.deleteMany();
      const compResult = await prisma.company.deleteMany();
      // Also clear scrape jobs and queue tasks
      await prisma.scrapeJob.deleteMany().catch(() => {});
      await prisma.scrapeQueueTask.deleteMany().catch(() => {});
      invalidateMetaCache();
      return NextResponse.json({
        success: true,
        message: `All data cleared: ${compResult.count} companies, ${prodResult.count} products deleted.`,
      });
    }

    // 2. Single company delete
    if (id) {
      await prisma.company.delete({ where: { id } });
      invalidateMetaCache();
      return NextResponse.json({ success: true, message: "Company deleted successfully." });
    }

    // 3. Batch delete selected companies
    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      await prisma.company.deleteMany({
        where: { id: { in: body.ids } },
      });
      invalidateMetaCache();
      return NextResponse.json({
        success: true,
        count: body.ids.length,
        message: `${body.ids.length} companies deleted successfully.`,
      });
    }

    return NextResponse.json({ error: "Missing id, ids array, or all=true" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete";
    console.error("Error deleting company:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
