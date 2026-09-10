import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const country = searchParams.get("country") || "";
    const hsCode = searchParams.get("hsCode") || "";
    const tradeType = searchParams.get("tradeType") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "15", 10);
    const skip = (page - 1) * limit;

    // Build filter conditions
    const where: Prisma.CompanyWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { city: { contains: search } },
        { address: { contains: search } },
        {
          products: {
            some: {
              productCategory: { contains: search },
            },
          },
        },
      ];
    }

    if (country) {
      where.country = country;
    }

    if (hsCode || tradeType) {
      where.products = {
        some: {
          ...(hsCode ? { hsCode: { startsWith: hsCode } } : {}),
          ...(tradeType ? { tradeType: { contains: tradeType } } : {}),
        },
      };
    }

    const [companies, total] = await Promise.all([
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
    ]);

    // Distinct countries for filtering dropdown
    const allCompanies = await prisma.company.findMany({
      select: { country: true },
      distinct: ["country"],
      where: { country: { not: null } },
    });
    const countries = allCompanies
      .map((c) => c.country)
      .filter((c): c is string => Boolean(c));

    return NextResponse.json({
      companies,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      countries,
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
