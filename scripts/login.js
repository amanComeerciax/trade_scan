const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const SESSION_DIR = path.join(__dirname, "..", ".session-cache", "trademap-profile");

async function main() {
  console.log("==================================================");
  console.log("🚀 TradeMap Interactive Login Session");
  console.log("Persistent Session Profile:", SESSION_DIR);
  console.log("==================================================");

  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const page = await context.newPage();
  console.log("🌐 Navigating to https://www.trademap.org/ ...");
  await page.goto("https://www.trademap.org/", { waitUntil: "domcontentloaded" });

  console.log("\n✅ BROWSER OPENED!");
  console.log("👉 Please log into TradeMap in the open browser window.");
  console.log("👉 When you are logged in, simply CLOSE the browser window.");
  console.log("⏳ Waiting for you to finish...\n");

  await new Promise((resolve) => {
    page.on("close", () => {
      console.log("\n🎉 Window closed! Session and cookies saved to .session-cache/trademap-profile");
      resolve();
    });
  });

  await context.close().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error("Error launching login session:", err);
  process.exit(1);
});
