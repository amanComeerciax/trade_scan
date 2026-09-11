import { NextResponse } from "next/server";
import { parsePromptWithAI } from "@/lib/aiParser";
import { executeScrapeJob } from "@/lib/tradeMapClient";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const prompt = body.prompt?.trim() || "";

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required for AI scraper" }, { status: 400 });
    }

    // 1. AI parses natural language query into TradeMap parameters
    const parsed = parsePromptWithAI(prompt);

    // 2. Trigger scraper engine with AI-resolved parameters
    const scrapeResult = await executeScrapeJob({
      country: parsed.country,
      hsCode: parsed.hsCode,
      productCategory: parsed.productCategory,
      tradeFlow: parsed.tradeFlow,
      limit: body.limit || 15,
    });

    return NextResponse.json({
      success: true,
      aiAnalysis: {
        prompt,
        resolvedCountry: parsed.country,
        resolvedHsCode: parsed.hsCode || "All",
        resolvedCategory: parsed.productCategory || "All Categories",
        resolvedTradeFlow: parsed.tradeFlow,
        explanation: parsed.explanation,
      },
      scrapeResult,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "AI Scraper failed";
    console.error("AI Scraper error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
