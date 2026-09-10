import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeScrapeJob } from "@/lib/tradeMapClient";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { country, hsCode, productCategory, tradeFlow, limit } = body;

    const result = await executeScrapeJob({
      country: country?.trim() || undefined,
      hsCode: hsCode?.trim() || undefined,
      productCategory: productCategory?.trim() || undefined,
      tradeFlow: tradeFlow || "exports",
      limit: limit ? parseInt(limit, 10) : 20,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Scrape job failed";
    console.error("Scrape job error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const [recentJobs, totalCompanies, totalProducts, countryCounts] =
      await Promise.all([
        prisma.scrapeJob.findMany({
          orderBy: { startedAt: "desc" },
          take: 5,
        }),
        prisma.company.count(),
        prisma.companyProduct.count(),
        prisma.company.groupBy({
          by: ["country"],
          _count: { id: true },
          where: { country: { not: null } },
        }),
      ]);

    return NextResponse.json({
      recentJobs,
      stats: {
        totalCompanies,
        totalProducts,
        totalCountries: countryCounts.length,
        countriesList: countryCounts.map((c) => ({
          country: c.country,
          count: c._count.id,
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Stats fetch failed";
    console.error("Error fetching scrape stats:", message);
    return NextResponse.json(
      { error: "Failed to fetch stats", details: message },
      { status: 500 }
    );
  }
}
