# 🚀 TradeScan Pro — Production Deployment & Handover Guide
**Project:** Universal Multi-Account Parallel Chrome Scraper Pipeline  
**Target Platform:** TradeMap (ITC Geneva)  
**Target Environment:** Microsoft Azure Central India (24/7 Cloud Production)  
**Live Production URL:** [https://tradescan-fee811.centralindia.cloudapp.azure.com/batch](https://tradescan-fee811.centralindia.cloudapp.azure.com/batch)  
**Date:** September 2026  

---

## 📌 Executive Summary
TradeScan ko successfully **Microsoft Azure Cloud** par deploy kar diya gaya hai. Yeh system 24/7 background me chalta hai bina kisi laptop par dependency ke. Isme **4-Worker Parallel Chrome Grid** ke sath **Multi-Country Proxy Architecture** integrate kiya gaya hai taaki TradeMap ka datacenter IP block aur rate-limit bypass ho sake.

Team members ab kahin se bhi live HTTPS URL ke through extraction start, monitor, aur stop kar sakte hain.

---

## 🌐 1. Live Environment & Access Details

| Component | Production Configuration |
| :--- | :--- |
| **Live Dashboard URL** | `https://tradescan-fee811.centralindia.cloudapp.azure.com/batch` |
| **Cloud Provider** | Microsoft Azure (Central India Datacenter) |
| **Virtual Machine Spec** | `Standard_B2as_v2` (2 vCPU, 8 GB RAM, SSD) |
| **Operating System** | Windows Server 2022 Datacenter |
| **Static IP Address** | `20.204.3.246` (Allowlisted in MongoDB Atlas) |
| **SSL / HTTPS Security** | Caddy Reverse Proxy (Auto-renewing Let's Encrypt SSL, Port 443 → Internal Port 3000) |
| **Process Daemon** | NSSM (Non-Sucking Service Manager) running as Windows `SYSTEM` Service |
| **Database** | MongoDB Atlas (`cluster0` - AWS Mumbai `ap-south-1`) |

---

## 🏗️ 2. Kya-Kya Setup & Deploy Kiya Gaya (Step-by-Step)

### A. Azure VM Provisioning & Security
1. **VM Provisioning:** Azure Central India region me `Standard_B2as_v2` instance setup kiya gaya.
2. **Network Security Group (NSG) Rules:**
   - **Port 443 (HTTPS) & Port 80 (HTTP):** Public web access ke liye open kiya gaya.
   - **Port 3389 (RDP):** Security ke liye restricted rakha gaya.
   - **Port 3000 (Next.js Internal):** Security ke liye bahar se block rakha gaya; sirf local Caddy reverse proxy se accessible hai.
3. **Windows Defender Firewall:** `Allow-Web-HTTPS` rule banakar ports 80 aur 443 inbound enable kiye gaye.

### B. Environment & Dependencies Setup
1. **Runtime:** Node.js v20.18 LTS portable runtime `C:\nodejs` me configure kiya gaya.
2. **Browsers:** Google Chrome aur Playwright Chromium dependencies install kiye gaye.
3. **Database Connectivity:** VM ke static IP `20.204.3.246` ko MongoDB Atlas ke network access IP Access List me add kiya gaya.
4. **Git Repository:** `feature/trademap-scraper-pipeline` branch ko Azure VM par clone kiya gaya.

### C. 24/7 Background Services (Auto-Boot on VM Restart)
Do critical Windows Services create ki gayi hain jo VM boot hote hi bina interactive RDP login ke automatically start ho jaati hain:
1. **`TradeScan` Service:**
   - Command: `C:\nodejs\node.exe node_modules\next\dist\bin\next start`
   - Working Directory: `C:\Users\divy\trade_scan`
   - Runs the optimized Webpack production build of Next.js.
2. **`Caddy` Service:**
   - Command: `C:\nodejs\caddy.exe run --config C:\nodejs\Caddyfile`
   - Handles public HTTPS domain certificates, SSL handshake, and proxying to port 3000.

---

## 🛡️ 3. Anti-Ban & Multi-Proxy Scraper Architecture

TradeMap (UN/ITC) cloud datacenters (Azure, AWS) ke direct IP ranges ko 404/Cloudflare se block karta hai. Isko bypass karne ke liye **310210/5208 Proven Architecture** ke sath **Proxy Network** lagaya gaya hai:

```
[ Web Dashboard /batch ]
          │
          ▼
   [ Batch Engine ]
          │
  ┌───────┼───────┬───────┐
  ▼       ▼       ▼       ▼
Worker1 Worker2 Worker3 Worker4
(Acc #1)(Acc #2)(Acc #3)(Acc #4)
  │       │       │       │
  ▼       ▼       ▼       ▼
Proxy:  Proxy:  Proxy:  Proxy:
UK      Spain   USA     Germany
  │       │       │       │
  └───────┴───────┴───────┘
          │ (450ms Pacing + Atomic Mutex Claims)
          ▼
 [ TradeMap.org & STS ] ──▶ [ MongoDB Atlas ]
```

1. **Multi-Country IP Rotation:**
   - Har ek worker ke paas alag dedicated proxy IP hai (United Kingdom, Spain, United States, Germany) through Webshare.
   - TradeMap ko 4 alag-alag deshon ke natural human users lagte hain.
2. **1-by-1 Contact Pacing (450ms):**
   - Sequential contact details (Director Name, Designation, Phone number) bina burst ke extract hote hain.
3. **Atomic Page Locking (Mutex):**
   - No two workers ever touch or claim the same page. Zero record collisions.
4. **ISO 240+ Country Mapping:**
   - Raw numeric trade country codes automatically full country names (India, USA, Germany, etc.) me resolve hote hain.
5. **Auto-Cooldown Protection:**
   - 403 trigger hone par worker drop nahi karta; 35-60 seconds ka cooldown lekar safe retry karta hai.

---

## 📋 4. Teammates ke Liye SOP (System Kaise Use Karein)

### Step 1: Dashboard Kholein
Kisi bhi browser me URL kholein:  
👉 **`https://tradescan-fee811.centralindia.cloudapp.azure.com/batch`**

### Step 2: Extraction Parameters Set Karein
1. **HS Code Input:** 
   > ⚠️ **Important:** HS Code hamesha **2, 4, ya 6 digits** ka hona chahiye:
   > - Sahi: `0101`, `020130`, `5208`, `8517`, `1001`
   > - Galat: `101` (3-digit code TradeMap 400 reject karta hai, aage 0 lagana mandatory hai).
2. **Trade Flow:** `Exports` ya `Imports` select karein.
3. **Country:** `World (000)` ya specific country select karein.

### Step 3: Scraper Start Karein
- **"⚡ START 4-WORKER EXTRACTION"** button click karein.
- Terminal Telemetry widget me live real-time status dikhega:
  - `Worker #1 CLAIMED: Page 1`
  - `Worker #2 CLAIMED: Page 2`
  - Records count dynamically live badhta dikhega.

### Step 4: Extraction Stop Karna
- Agar beech me rokna ho, to **"⏹ STOP SCRAPER"** button dabayein.

---

## ⚙️ 5. DevOps & Maintenance Cheat Sheet (Azure VM)

Agar kabhi VM par maintenance karni ho, to VM ke PowerShell me ye commands use hoti hain:

### Service Status Check Karna:
```powershell
Get-Service TradeScan, Caddy
```

### Services Restart Karna:
```powershell
Start-Process -FilePath "C:\nodejs\nssm.exe" -ArgumentList "restart TradeScan" -Verb RunAs
Start-Process -FilePath "C:\nodejs\nssm.exe" -ArgumentList "restart Caddy" -Verb RunAs
```

### Code Update (Git Pull & Rebuild):
```powershell
cd C:\Users\divy\trade_scan
git pull
$env:Path = "C:\nodejs;$env:Path"
npm run build
Start-Process -FilePath "C:\nodejs\nssm.exe" -ArgumentList "restart TradeScan" -Verb RunAs
```

### Scraper Log Files:
- Scraper Output Log: `C:\Users\divy\trade_scan\scripts\batch_scraper.log`
- Live State File: `C:\Users\divy\trade_scan\scripts\.batch_state.json`

---

## 🔒 6. Critical Golden Rules
1. **Trial Period Limit:** B2as_v2 VM (2 vCPU) par CPU burst credits bachaane ke liye strictly **4 workers** hi chalayein.
2. **No Build During Run:** Jab extraction chal rahi ho, us time `npm run build` na chalayein.
3. **Credentials Security:** `.env` file ko sirf Azure VM par hi rakhein, kabhi bhi public git repo par commit na karein.
