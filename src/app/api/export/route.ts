import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "xlsx";
    const search = searchParams.get("search") || "";
    const country = searchParams.get("country") || "";
    const hsCode = searchParams.get("hsCode") || "";
    const tradeType = searchParams.get("tradeType") || "";

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

    const companies = await prisma.company.findMany({
      where,
      include: {
        products: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Flatten data for spreadsheet export
    const rows = companies.map((c, index) => {
      const hsCodes = c.products.map((p) => p.hsCode).filter(Boolean).join(", ");
      const categories = c.products
        .map((p) => p.productCategory)
        .filter(Boolean)
        .join("; ");
      const tradeTypes = Array.from(
        new Set(c.products.map((p) => p.tradeType).filter(Boolean))
      ).join(", ");

      return {
        "#": index + 1,
        "Company Name": c.name,
        Country: c.country || "N/A",
        City: c.city || "N/A",
        Address: c.address || "N/A",
        "Contact Person": c.contactName || "N/A",
        Role: c.contactRole || "N/A",
        Phone: c.phone || "N/A",
        "Trade Type": tradeTypes || "Exporter",
        "HS Code(s)": hsCodes || "N/A",
        "Product Categories": categories || "N/A",
        Website: c.website || "N/A",
        "Source URL": c.sourceUrl || "N/A",
        "Added Date": new Date(c.createdAt).toLocaleDateString(),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-fit column widths
    const columnWidths = [
      { wch: 5 },  // #
      { wch: 30 }, // Company Name
      { wch: 15 }, // Country
      { wch: 18 }, // City
      { wch: 30 }, // Address
      { wch: 22 }, // Contact Person
      { wch: 16 }, // Role
      { wch: 18 }, // Phone
      { wch: 15 }, // Trade Type
      { wch: 15 }, // HS Code(s)
      { wch: 35 }, // Product Categories
      { wch: 30 }, // Website
      { wch: 35 }, // Source URL
      { wch: 14 }, // Added Date
    ];
    worksheet["!cols"] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Exporters");

    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
      return new Response(csvOutput, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="trademap_exporters_${timestamp}.csv"`,
        },
      });
    } else {
      const xlsxBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      return new Response(xlsxBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="trademap_exporters_${timestamp}.xlsx"`,
        },
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Export failed";
    console.error("Export error:", message);
    return NextResponse.json(
      { error: "Failed to export data", details: message },
      { status: 500 }
    );
  }
}
