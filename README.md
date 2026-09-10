# TradeScan (Trade Data Scraping & Exporter Directory)

An automated global TradeMap extraction system and modern SaaS intelligence dashboard built with Next.js 16 (App Router), Prisma ORM, and XLSX export.

---

## ✨ Features

- **Live TradeMap Extraction**: Direct API integration targeting global exporters and importers by Country, HS Code, and Commodity sector.
- **Relational Schema (Prisma)**: Normalized `Company` and `CompanyProduct` entities with duplicate prevention.
- **Rich SaaS Dashboard**: Ultra-clean, modern light UI with 5 real-time metric cards, slide-over detail drawer, and responsive tables.
- **Full Contact Extraction**: Extracts Company Name, City, Country, Activities, Website, Key Contact Person / Director Name, and Phone number.
- **1-Click Export**: Instant Excel (`.xlsx`) and `.csv` formatted downloads with auto-fitted column widths.
- **Automated Cron Jobs**: `/api/cron` background scheduler for hands-free periodic updates.
- **Anti-Bot & Proxy Ready**: Built-in User-Agent rotation pool, country code resolver, and proxy support.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Frontend**: React 19, Vanilla CSS, Lucide Icons
- **Database**: SQLite (local development) / PostgreSQL (production) via Prisma Client v6
- **Extraction**: Axios, Cheerio, TradeMap Internal REST APIs
- **Export**: SheetJS (`xlsx`)

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment & Database
```bash
cp .env.example .env
npx prisma db push
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or port 3001) in your browser.

---

## 📡 API Endpoints

- `GET /api/companies` — Search, filter, and paginated exporters directory.
- `POST /api/scrape` — Trigger real-time TradeMap extraction jobs.
- `GET /api/scrape` — Fetch live overview metrics and job history.
- `GET /api/export?format=xlsx` — Download filtered records as Excel spreadsheet.
- `GET /api/export?format=csv` — Download filtered records as CSV.
- `GET /api/cron` — Automated background sync (secured with `CRON_SECRET`).
