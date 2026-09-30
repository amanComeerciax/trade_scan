import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

// Global process tracking across requests in Node server
const globalForScraper = globalThis as unknown as {
  activeScraperProcess?: ChildProcess;
  activeJobId?: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId") || globalForScraper.activeJobId;

    if (jobId) {
      const job = await prisma.scrapeJob.findUnique({
        where: { id: jobId },
      });
      return NextResponse.json({
        isRunning: Boolean(globalForScraper.activeScraperProcess && !globalForScraper.activeScraperProcess.killed),
        activeJobId: globalForScraper.activeJobId,
        job,
      });
    }

    // Return most recent job
    const recentJob = await prisma.scrapeJob.findFirst({
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json({
      isRunning: Boolean(globalForScraper.activeScraperProcess && !globalForScraper.activeScraperProcess.killed),
      activeJobId: globalForScraper.activeJobId,
      job: recentJob,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch scraper status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Action: Open visible Chrome with Scraper Profile for manual login check
    if (body.action === "open-browser") {
      const workerId = body.workerId;
      const profileDir = workerId
        ? path.join(process.env.LOCALAPPDATA || "", `TradeScan-Profile-Worker-${workerId}`)
        : path.join(process.env.LOCALAPPDATA || "", "TradeScan-Scraper-Profile");
      const targetUrl = "https://www.trademap.org/en/goods/companies";

      const candidatePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
      ];
      const chromePath = candidatePaths.find((p) => fs.existsSync(p)) || "chrome.exe";

      spawn(
        chromePath,
        [
          `--user-data-dir=${profileDir}`,
          "--new-window",
          "--no-first-run",
          "--no-default-browser-check",
          targetUrl,
        ],
        {
          detached: true,
          shell: false,
          stdio: "ignore",
        }
      ).unref();

      return NextResponse.json({
        success: true,
        message: `Chrome browser opened for Worker ${workerId || 'Default'}.`,
      });
    }

    const hsCode = (body.hsCode || "310210").trim();
    const countryCode = (body.countryCode || "000").trim();
    const countryName = (body.countryName || "World").trim();
    const tradeFlow = (body.tradeFlow || "I").trim().toUpperCase().startsWith("E") ? "E" : "I";

    // If an existing job is already running, prevent duplicate conflict
    if (globalForScraper.activeScraperProcess && !globalForScraper.activeScraperProcess.killed) {
      return NextResponse.json(
        {
          error: "Another extraction job is already actively running. Please wait or stop the existing job first.",
          activeJobId: globalForScraper.activeJobId,
        },
        { status: 400 }
      );
    }

    // 1. Create a ScrapeJob in MongoDB Atlas
    const targetLabel = `${countryName} (${countryCode}) | HS:${hsCode} | Flow:${tradeFlow === "I" ? "Imports" : "Exports"}`;
    const job = await prisma.scrapeJob.create({
      data: {
        status: "RUNNING",
        source: "trademap.org",
        target: targetLabel,
        recordsFound: 0,
        logs: `[${new Date().toLocaleTimeString()}] Initialized extraction for ${targetLabel} on MongoDB Atlas.\nStarting Playwright worker...`,
      },
    });

    globalForScraper.activeJobId = job.id;

    // 2. Spawn universal scraper worker
    const scriptPath = path.join(process.cwd(), "scripts", "universalScraperWorker.js");
    const child = spawn("node", [
      scriptPath,
      "--hsCode", hsCode,
      "--countryCode", countryCode,
      "--countryName", countryName,
      "--tradeFlow", tradeFlow,
      "--jobId", job.id,
    ], {
      cwd: process.cwd(),
      stdio: "inherit", // Pipe logs to terminal
      detached: false,
    });

    globalForScraper.activeScraperProcess = child;

    child.on("exit", (code) => {
      console.log(`[Scraper Worker] Exited with code ${code}`);
      if (globalForScraper.activeJobId === job.id) {
        globalForScraper.activeScraperProcess = undefined;
      }
    });

    return NextResponse.json({
      success: true,
      message: `Extraction started for HS ${hsCode} (${countryName})`,
      jobId: job.id,
      target: targetLabel,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to start extraction job";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    if (globalForScraper.activeScraperProcess && !globalForScraper.activeScraperProcess.killed) {
      globalForScraper.activeScraperProcess.kill("SIGINT");
      const stoppedJobId = globalForScraper.activeJobId;
      globalForScraper.activeScraperProcess = undefined;
      globalForScraper.activeJobId = undefined;

      if (stoppedJobId) {
        await prisma.scrapeJob.update({
          where: { id: stoppedJobId },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
          },
        }).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        message: "Active scraper process stopped successfully.",
      });
    }

    return NextResponse.json({
      success: false,
      message: "No scraper process is currently running.",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to stop scraper";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
