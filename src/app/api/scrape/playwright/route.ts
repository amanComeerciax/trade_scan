import { NextResponse } from "next/server";
import { scrapeTradeMapWithPlaywright } from "@/lib/playwrightWorker";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { country, hsCode, productCategory, tradeFlow, limit } = body;

    const result = await scrapeTradeMapWithPlaywright({
      country: country?.trim() || "India",
      hsCode: hsCode?.trim() || undefined,
      productCategory: productCategory?.trim() || undefined,
      tradeFlow: tradeFlow || "exports",
      limit: limit ? parseInt(limit, 10) : 25,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Playwright scrape job failed";
    console.error("Playwright job error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
