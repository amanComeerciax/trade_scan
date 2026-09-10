import { NextResponse } from "next/server";
import { executeScrapeJob } from "@/lib/tradeMapClient";

// Predefined high-volume commodities for automatic scheduled refresh
const SCHEDULED_TARGETS = [
  { country: "India", hsCode: "0901", productCategory: "Coffee, tea and spices", flow: "exports" as const },
  { country: "Germany", hsCode: "7208", productCategory: "Steel and iron products", flow: "exports" as const },
  { country: "Vietnam", hsCode: "0401", productCategory: "Dairy products", flow: "exports" as const },
  { country: "United States", hsCode: "1201", productCategory: "Agricultural grains", flow: "exports" as const },
];

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Verify bearer token if CRON_SECRET is configured
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
    }

    const results = [];
    for (const target of SCHEDULED_TARGETS) {
      try {
        const result = await executeScrapeJob({
          country: target.country,
          hsCode: target.hsCode,
          productCategory: target.productCategory,
          tradeFlow: target.flow,
          limit: 15,
        });
        results.push({ target: `${target.country} - ${target.hsCode}`, status: result.status, records: result.recordsFound });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error";
        results.push({ target: `${target.country} - ${target.hsCode}`, status: "FAILED", error: message });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tasksExecuted: results.length,
      details: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cron execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
