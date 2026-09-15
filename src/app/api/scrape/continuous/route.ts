import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeScrapeJob } from "@/lib/tradeMapClient";

// 12 High-volume global trade targets for continuous auto-pilot cycle
const CONTINUOUS_TARGETS = [
  { country: "India", hsCode: "0901", category: "Coffee, Tea and Spices", flow: "exports" as const },
  { country: "Vietnam", hsCode: "1006", category: "Rice & Grains", flow: "exports" as const },
  { country: "Germany", hsCode: "7208", category: "Flat-rolled Iron & Steel", flow: "exports" as const },
  { country: "United States", hsCode: "8471", category: "Computers & Electronics", flow: "exports" as const },
  { country: "United Arab Emirates", hsCode: "7113", category: "Articles of Jewellery", flow: "exports" as const },
  { country: "India", hsCode: "5208", category: "Woven Cotton Fabrics", flow: "exports" as const },
  { country: "China", hsCode: "8517", category: "Smartphones & Telephones", flow: "exports" as const },
  { country: "Brazil", hsCode: "1701", category: "Cane or Beet Sugar", flow: "exports" as const },
  { country: "Singapore", hsCode: "2710", category: "Petroleum Fuels & Oils", flow: "exports" as const },
  { country: "United Kingdom", hsCode: "3004", category: "Pharmaceutical Medicaments", flow: "exports" as const },
  { country: "Germany", hsCode: "8703", category: "Motor Cars & Vehicles", flow: "exports" as const },
  { country: "India", hsCode: "6403", category: "Footwear & Leather Goods", flow: "exports" as const },
];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const cycleIndex = typeof body.cycleIndex === "number" ? body.cycleIndex : 0;
    const target = CONTINUOUS_TARGETS[cycleIndex % CONTINUOUS_TARGETS.length];
    const targetLimit = body.limit || 20;

    const result = await executeScrapeJob({
      country: target.country,
      hsCode: target.hsCode,
      productCategory: target.category,
      tradeFlow: target.flow,
      limit: targetLimit,
    });

    const nextIndex = (cycleIndex + 1) % CONTINUOUS_TARGETS.length;
    const nextTarget = CONTINUOUS_TARGETS[nextIndex];

    return NextResponse.json({
      success: true,
      cycleIndex,
      executedTarget: target,
      nextTarget,
      data: result,
      stats: {
        recordsSaved: result.recordsFound,
        jobId: result.jobId,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Continuous job execution error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  const totalJobs = await prisma.scrapeJob.count();
  const recentJobs = await prisma.scrapeJob.findMany({
    orderBy: { startedAt: "desc" },
    take: 6,
  });

  return NextResponse.json({
    activeTargetsCount: CONTINUOUS_TARGETS.length,
    targetsList: CONTINUOUS_TARGETS,
    totalJobsRun: totalJobs,
    recentJobs,
  });
}
