import { NextResponse } from "next/server";

export async function POST() {
  try {
    (global as any).cancelEnrichPhase2 = true;
    (global as any).cancelScrapePhase1 = true;
    return NextResponse.json({ success: true, message: "Scraping processes marked for cancellation." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
