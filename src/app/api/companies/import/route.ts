import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const HS_NAMES: Record<string, string> = {
  "0901": "HS 0901 Coffee & Substitutes",
  "5208": "HS 5208 Woven Cotton Fabrics",
  "5201": "HS 5201 Raw Cotton",
  "1006": "HS 1006 Rice",
  "0902": "HS 0902 Tea & Mate",
  "0904": "HS 0904 Pepper & Spices",
  "6203": "HS 6203 Men's Garments",
  "6204": "HS 6204 Women's Garments",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { records, country = "India", hsCode = "0901", productCategory } = body;
    const categoryName = productCategory || HS_NAMES[hsCode] || `HS ${hsCode} Commodity Sector`;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "No records provided" },
        { status: 400, headers: corsHeaders }
      );
    }

    let saved = 0;
    for (const rec of records) {
      if (!rec.name) continue;
      try {
        const company = await prisma.company.upsert({
          where: {
            name_country: {
              name: rec.name.trim(),
              country: country,
            },
          },
          update: {
            city: rec.city || undefined,
            address: rec.city ? `${rec.city}, ${country}` : country,
            website: rec.website || undefined,
            sourceUrl: rec.sourceUrl || (rec.link ? (rec.link.startsWith('http') ? rec.link : `https://www.trademap.org${rec.link}`) : (rec.id ? `https://www.trademap.org/companies/${rec.id}` : undefined)),
          },
          create: {
            name: rec.name.trim(),
            country: country,
            city: rec.city || undefined,
            address: rec.city ? `${rec.city}, ${country}` : country,
            website: rec.website || undefined,
            sourceUrl: rec.sourceUrl || (rec.link ? (rec.link.startsWith('http') ? rec.link : `https://www.trademap.org${rec.link}`) : (rec.id ? `https://www.trademap.org/companies/${rec.id}` : undefined)),
          },
        });

        const tradeType = Array.isArray(rec.activities) && rec.activities.length > 0 
          ? rec.activities.join(", ") 
          : "Exporter";

        const existingProd = await prisma.companyProduct.findFirst({
          where: { companyId: company.id, hsCode },
        });

        if (!existingProd) {
          await prisma.companyProduct.create({
            data: {
              companyId: company.id,
              hsCode,
              productCategory: categoryName,
              tradeType,
            },
          });
        }
        saved++;
      } catch (e) {
        // Skip duplicate
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully imported ${saved} companies directly into TradeScan!`,
        savedCount: saved,
      },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
