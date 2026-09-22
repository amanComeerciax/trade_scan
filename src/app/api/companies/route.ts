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
        { contactName: { contains: search } },
        { phone: { contains: search } },
        {
          products: {
            some: {
              OR: [
                { productCategory: { contains: search } },
                { hsCode: { contains: search } },
              ],
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

    const [companies, total, withPhone, withContact] = await Promise.all([
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

    // Dynamic HS Code list with counts
    const hsCodesGroup = await prisma.companyProduct.groupBy({
      by: ["hsCode", "productCategory"],
      _count: { id: true },
      where: { hsCode: { not: null } },
      orderBy: { _count: { id: "desc" } },
    });

    const hsList = hsCodesGroup.map((h) => ({
      hsCode: h.hsCode as string,
      productCategory: h.productCategory || `HS ${h.hsCode}`,
      count: h._count.id,
    }));

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

    // 1. Wipe all data
    if (all === "true") {
      const deleteProducts = prisma.companyProduct.deleteMany();
      const deleteCompanies = prisma.company.deleteMany();
      await prisma.$transaction([deleteProducts, deleteCompanies]);
      return NextResponse.json({ success: true, message: "All company data cleared successfully." });
    }

    // 2. Single company delete
    if (id) {
      await prisma.company.delete({ where: { id } });
      return NextResponse.json({ success: true, message: "Company deleted successfully." });
    }

    // 3. Batch delete selected companies
    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      await prisma.company.deleteMany({
        where: { id: { in: body.ids } },
      });
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
