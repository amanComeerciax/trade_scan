import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrichTradeMapCompaniesWithPlaywright } from "@/lib/playwrightWorker";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { companyIds, limit, country } = body;

    const result = await enrichTradeMapCompaniesWithPlaywright({
      companyIds: Array.isArray(companyIds) && companyIds.length > 0 ? companyIds : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      country: country?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Phase 2 enrichment failed";
    console.error("Enrichment API error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const [totalCompanies, unenrichedCount] = await Promise.all([
      prisma.company.count(),
      prisma.company.count({
        where: {
          externalId: { not: null },
          OR: [
            { contactName: null },
            { contactName: "" },
            { phone: null },
            { phone: "" },
          ],
        },
      }),
    ]);

    return NextResponse.json({
      totalCompanies,
      unenrichedCount,
      enrichedCount: totalCompanies - unenrichedCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch enrichment status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
