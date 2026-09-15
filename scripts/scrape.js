const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const SESSION_DIR = path.join(__dirname, "..", ".session-cache", "trademap-profile");

async function main() {
  const country = process.argv[2] || "699"; // default India
  const flow = process.argv[3] || "exports";
  const hsCode = process.argv[4] || "ALL";

  console.log("==================================================");
  console.log("🚀 Starting Playwright TradeMap Scraper");
  console.log(`Target: Country=${country} | Flow=${flow} | HS=${hsCode}`);
  console.log("Session Profile:", SESSION_DIR);
  console.log("==================================================");

  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await context.newPage();
  const capturedCompanies = [];

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/companies") && res.status() === 200) {
      const contentType = res.headers()["content-type"] || "";
      if (contentType.includes("application/json")) {
        try {
          const json = await res.json();
          if (json && Array.isArray(json.records)) {
            console.log(`📡 [Network Intercept] Captured ${json.records.length} companies from: ${url}`);
            capturedCompanies.push(...json.records);
          }
        } catch (_) {}
      }
    }
  });

  const targetUrl = `https://www.trademap.org/en/goods/companies/c/${country}/${flow}/p/${hsCode}`;
  console.log(`🌐 Navigating to ${targetUrl}...`);

  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 }).catch(async () => {
    await page.waitForLoadState("domcontentloaded");
  });

  console.log(`\n✅ Page loaded!`);
  console.log(`Total companies captured via network stream: ${capturedCompanies.length}`);

  if (capturedCompanies.length > 0) {
    console.log("\nSample captured records:");
    capturedCompanies.slice(0, 5).forEach((c, idx) => {
      console.log(` [${idx + 1}] ${c.name} | City: ${c.city || "N/A"} | Site: ${c.website || "N/A"}`);
    });
  }

  await context.close().catch(() => {});
  console.log("\nScrape job completed successfully.");
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
