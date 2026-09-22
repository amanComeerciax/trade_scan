"use client";

import { useEffect, useState, useRef } from "react";
import { resolveCommodity } from "@/lib/aiParser";
import { ALL_COUNTRIES } from "@/lib/countries";
import { TradeScanLogo, TradeScanMark } from "@/components/TradeScanLogo";
import {
  Globe,
  Download,
  Search,
  RefreshCw,
  ExternalLink,
  Building2,
  CheckCircle,
  Clock,
  SlidersHorizontal,
  ChevronDown,
  Command,
  Send,
  Compass,
  Play,
  ArrowUpRight,
  ShieldCheck,
  BarChart3,
  GitBranch,
  Settings,
  HelpCircle,
  Sun,
  Bell,
  Radio,
  FileSpreadsheet,
  X,
  Layers,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  Copy,
  Check,
  Package,
  MapPin,
  CheckCircle2,
  Trash2,
  Sparkles,
  Plus,
  Terminal,
} from "lucide-react";

interface CompanyProduct {
  id: string;
  hsCode: string | null;
  productCategory: string | null;
  tradeType: string | null;
}

interface Company {
  id: string;
  name: string;
  country: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  contactRole: string | null;
  website: string | null;
  sourceUrl: string | null;
  createdAt: string;
  products: CompanyProduct[];
}

interface StatsData {
  totalCompanies: number;
  totalProducts: number;
  totalCountries: number;
  countriesList: { country: string; count: number }[];
  hsList?: { hsCode: string; count: number }[];
}

export function getHsCommodityInfo(hsCode?: string | null) {
  if (!hsCode) {
    return { icon: "🌐", name: "All Commodities", category: "Global Trade Directory" };
  }
  const clean = hsCode.trim();
  if (clean.startsWith("01")) {
    return { icon: "🐎", name: "Live Animals", category: "Live horses, bovine, swine, sheep, goats & poultry" };
  }
  if (clean.startsWith("02")) {
    return { icon: "🥩", name: "Meat & Edible Offal", category: "Fresh, chilled or frozen meat" };
  }
  if (clean.startsWith("03")) {
    return { icon: "🐟", name: "Fish & Seafood", category: "Fish, crustaceans, molluscs & aquatic invertebrates" };
  }
  if (clean.startsWith("07")) {
    return { icon: "🥦", name: "Edible Vegetables", category: "Fresh, chilled or preserved vegetables & roots" };
  }
  if (clean.startsWith("08")) {
    return { icon: "🍎", name: "Edible Fruits & Nuts", category: "Fresh or dried citrus, melons, apples & edible fruits" };
  }
  if (clean.startsWith("0910")) {
    return { icon: "🌶️", name: "Spices & Turmeric", category: "Ginger, saffron, turmeric, thyme, bay leaves, curry & spices" };
  }
  if (clean.startsWith("0902")) {
    return { icon: "🍵", name: "Tea & Mate", category: "Black tea, green tea, mate & tea extracts" };
  }
  if (clean.startsWith("0901")) {
    return { icon: "☕", name: "Coffee & Substitutes", category: "Coffee beans, roasted, decaffeinated & coffee husks" };
  }
  if (clean.startsWith("1006") || clean === "10") {
    return { icon: "🌾", name: "Rice & Cereals", category: "Basmati, non-basmati rice, wheat & cereals" };
  }
  if (clean.startsWith("5208") || clean.startsWith("5209") || clean.startsWith("5205") || clean === "52") {
    return { icon: "🧵", name: "Cotton & Textiles", category: "Woven fabrics of cotton, yarn & textiles" };
  }
  if (clean.startsWith("3004") || clean.startsWith("3003") || clean === "30") {
    return { icon: "💊", name: "Pharma & Medicaments", category: "Formulations & therapeutic healthcare products" };
  }
  if (clean.startsWith("7113") || clean === "71") {
    return { icon: "💎", name: "Jewellery & Gems", category: "Articles of jewellery, precious stones & metals" };
  }
  if (clean.startsWith("3102") || clean === "31") {
    return { icon: "🌱", name: "Fertilizers & Urea", category: "Urea & nitrogenous mineral fertilizers" };
  }
  if (clean.startsWith("84")) {
    return { icon: "⚙️", name: "Nuclear Reactors, Boilers & Machinery", category: "Mechanical appliances & parts thereof" };
  }
  if (clean.startsWith("85")) {
    return { icon: "⚡", name: "Electrical Machinery & Electronics", category: "Electronics, sound recorders & television parts" };
  }
  if (clean.startsWith("87")) {
    return { icon: "🚗", name: "Vehicles & Automotive", category: "Vehicles other than railway or tramway" };
  }
  return { icon: "📦", name: `HS Code ${clean}`, category: `HS ${clean} Merchandise Goods` };
}

export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [availableHsCodes, setAvailableHsCodes] = useState<{ hsCode: string; productCategory: string; count: number }[]>([]);
  const [withPhoneCount, setWithPhoneCount] = useState(0);
  const [withContactCount, setWithContactCount] = useState(0);
  const [stats, setStats] = useState<StatsData>({
    totalCompanies: 0,
    totalProducts: 0,
    totalCountries: 0,
    countriesList: [],
  });

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedTradeType, setSelectedTradeType] = useState("");
  const [selectedHsCode, setSelectedHsCode] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Modals & Panels
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isScraperModalOpen, setIsScraperModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("Find top cotton fabric exporters in India");
  const [aiResultText, setAiResultText] = useState("");
  const [isAIRunning, setIsAIRunning] = useState(false);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scraper Controller State
  const [scrapeCountry, setScrapeCountry] = useState("World");
  const [scrapeCountryCode, setScrapeCountryCode] = useState("000");
  const [scrapeHsCode, setScrapeHsCode] = useState("310210");
  const [customHsInput, setCustomHsInput] = useState("310210");
  const [scrapeTradeFlow, setScrapeTradeFlow] = useState<"exports" | "imports">("imports");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeLogs, setScrapeLogs] = useState<string>("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobRecords, setActiveJobRecords] = useState<number>(0);
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);

  // Batch Scraper State (Multi-Account Parallel Runner)
  const [scraperTab, setScraperTab] = useState<"single" | "batch">("single");
  const [batchHsInput, setBatchHsInput] = useState("0101\n0910\n1006\n5208\n3004");
  const [batchWorkerCount, setBatchWorkerCount] = useState<number>(4);
  const [batchStatus, setBatchStatus] = useState<any>(null);
  const [isStartingBatch, setIsStartingBatch] = useState(false);
  const [isStoppingBatch, setIsStoppingBatch] = useState(false);
  const [openingWorkerId, setOpeningWorkerId] = useState<number | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 🔔 Floating Toast Notification State ("Data Aa Gaya")
  const [notification, setNotification] = useState<{
    id: string;
    title: string;
    message: string;
    type?: "success" | "info" | "warning";
    hsCode?: string | null;
  } | null>(null);

  const wasBatchRunningRef = useRef(false);

  // 🎵 Soft audio chime on data arrival
  const playSuccessChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  };

  // Poll batch scraper status with fast frequency during active scraping
  useEffect(() => {
    let active = true;
    const checkBatch = async () => {
      try {
        const res = await fetch("/api/scraper/batch");
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setBatchStatus(data);
          if (data.isRunning) {
            wasBatchRunningRef.current = true;
            fetchData(page);
            fetchStats();
          } else if (wasBatchRunningRef.current) {
            // 🎉 Batch just finished!
            wasBatchRunningRef.current = false;
            playSuccessChime();
            const lastCompleted = data.completed?.[data.completed.length - 1];
            const hsText = lastCompleted?.hsCode ? `HS ${lastCompleted.hsCode}` : "Batch";
            setNotification({
              id: Date.now().toString(),
              title: `🎉 ${hsText} Data Extracted Successfully!`,
              message: `Live 4x batch extraction completed! Total ${data.totalExtracted || 0} verified profiles added to your database.`,
              type: "success",
              hsCode: lastCompleted?.hsCode || null,
            });
            fetchData(1);
            fetchStats();
          }
        }
      } catch {}
    };

    checkBatch();
    const pollInterval = batchStatus?.isRunning ? 1200 : 3000;
    const interval = setInterval(checkBatch, pollInterval);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [page, batchStatus?.isRunning]);

  // Auto-scroll activity terminal to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [batchStatus?.logs]);

  const handleStartBatch = async () => {
    setIsStartingBatch(true);
    try {
      const codes = batchHsInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (codes.length === 0) {
        alert("Please enter at least one valid HS code.");
        return;
      }
      const res = await fetch("/api/scraper/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hsCodes: codes,
          workerCount: batchWorkerCount,
          countryCode: scrapeCountryCode,
          tradeFlow: scrapeTradeFlow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to start batch scrape.");
      } else {
        const statusRes = await fetch("/api/scraper/batch");
        const statusData = await statusRes.json();
        setBatchStatus(statusData);
      }
    } catch (err: any) {
      alert("Network error: " + err.message);
    } finally {
      setIsStartingBatch(false);
    }
  };

  const handleStopBatch = async () => {
    if (!confirm("Are you sure you want to stop the live batch scrape?")) return;
    setIsStoppingBatch(true);
    try {
      await fetch("/api/scraper/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const statusRes = await fetch("/api/scraper/batch");
      const statusData = await statusRes.json();
      setBatchStatus(statusData);
    } catch (err: any) {
      alert("Error stopping batch: " + err.message);
    } finally {
      setIsStoppingBatch(false);
    }
  };

  const handleSetupWorkerAccount = async (wId: number) => {
    setOpeningWorkerId(wId);
    try {
      await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open-browser", workerId: wId }),
      });
    } catch {}
    setTimeout(() => setOpeningWorkerId(null), 3000);
  };

  // Selection & Deletion State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleSelectAll = () => {
    if (selectedIds.length === companies.length && companies.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(companies.map((c) => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteCompany = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/companies?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
        setSelectedIds((prev) => prev.filter((item) => item !== id));
        if (activeCompany?.id === id) setActiveCompany(null);
        fetchData();
        fetchStats();
      }
    } catch (err) {
      console.error("Error deleting company:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected companies?`)) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/companies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds([]);
        fetchData();
        fetchStats();
      }
    } catch (err) {
      console.error("Error deleting selected companies:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAllData = async () => {
    if (!confirm("Are you sure you want to clear ALL scraped companies from the database?")) return;
    try {
      setIsDeleting(true);
      const res = await fetch("/api/companies?all=true", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setSelectedIds([]);
        setActiveCompany(null);
        fetchData(1);
        fetchStats();
      }
    } catch (err) {
      console.error("Error clearing all data:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Manual fetch for pagination and refresh
  const fetchData = async (pageNum = page) => {
    try {
      setIsLoadingData(true);
      const query = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
        search: debouncedSearch,
        country: selectedCountry,
        hsCode: selectedHsCode,
        tradeType: selectedTradeType,
      });

      const res = await fetch(`/api/companies?${query.toString()}`);
      const data = await res.json();
      if (data.companies) {
        setCompanies(data.companies);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (data.countries) setAvailableCountries(data.countries);
        if (data.hsList) setAvailableHsCodes(data.hsList);
        if (data.withPhone !== undefined) setWithPhoneCount(data.withPhone);
        if (data.withContact !== undefined) setWithContactCount(data.withContact);
      }
    } catch (err) {
      console.error("Error loading companies:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/scrape");
      const data = await res.json();
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  };

  // Load global database stats once on mount
  useEffect(() => {
    fetchStats();
  }, []);

  // React instantly to filter changes with high speed
  useEffect(() => {
    let ignore = false;
    setIsLoadingData(true);

    async function loadData() {
      try {
        const query = new URLSearchParams({
          page: "1",
          limit: "10",
          search: debouncedSearch,
          country: selectedCountry,
          hsCode: selectedHsCode,
          tradeType: selectedTradeType,
        });

        const compRes = await fetch(`/api/companies?${query.toString()}`);
        const compData = await compRes.json();

        if (!ignore) {
          if (compData.companies) {
            setCompanies(compData.companies);
            setTotal(compData.total);
            setTotalPages(compData.totalPages);
            if (compData.countries) setAvailableCountries(compData.countries);
            if (compData.hsList) setAvailableHsCodes(compData.hsList);
            if (compData.withPhone !== undefined) setWithPhoneCount(compData.withPhone);
            if (compData.withContact !== undefined) setWithContactCount(compData.withContact);
          }
        }
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        if (!ignore) setIsLoadingData(false);
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [debouncedSearch, selectedCountry, selectedHsCode, selectedTradeType]);

  // Handle Scraper Trigger
  const handleTriggerScrape = async () => {
    setIsScraping(true);
    const finalHs = customHsInput.trim() || resolveCommodity(scrapeHsCode).hsCode || scrapeHsCode || "310210";
    const finalFlow = scrapeTradeFlow === "imports" ? "I" : "E";

    setScrapeLogs(`[${new Date().toLocaleTimeString()}] 🚀 Launching Universal Background Engine on MongoDB Atlas...\nTarget: ${scrapeCountry} (${scrapeCountryCode}) | HS: ${finalHs} | Flow: ${scrapeTradeFlow.toUpperCase()}\nInitializing Playwright authenticated session...`);

    try {
      const res = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: scrapeCountryCode,
          countryName: scrapeCountry,
          hsCode: finalHs,
          tradeFlow: finalFlow,
        }),
      });

      const json = await res.json();
      if (json.success && json.jobId) {
        setActiveJobId(json.jobId);
        setScrapeLogs((prev) => `${prev}\n✓ Background Engine Active (Job: ${json.jobId})\nStreaming live progress from MongoDB Atlas...`);

        // Start real-time polling
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/scraper?jobId=${json.jobId}`);
            const statusData = await statusRes.json();
            if (statusData.job) {
              if (statusData.job.logs) setScrapeLogs(statusData.job.logs);
              if (statusData.job.recordsFound !== undefined) setActiveJobRecords(statusData.job.recordsFound);

              fetchData(page);
              fetchStats();

              if (statusData.job.status === "COMPLETED" || statusData.job.status === "FAILED" || statusData.job.status === "CANCELLED") {
                clearInterval(pollInterval);
                setIsScraping(false);
                fetchData(1);
                fetchStats();
                if (statusData.job.status === "COMPLETED") {
                  playSuccessChime();
                  setNotification({
                    id: Date.now().toString(),
                    title: `🎉 HS ${finalHs} Data Extracted Successfully!`,
                    message: `Extraction completed! ${statusData.job.recordsFound || ""} verified records have been loaded into your dashboard.`,
                    type: "success",
                    hsCode: finalHs,
                  });
                }
              }
            }
          } catch {}
        }, 2500);
      } else {
        setScrapeLogs((prev) => `${prev}\n\n✗ FAILED: ${json.error || "Could not launch job"}`);
        setIsScraping(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      setScrapeLogs((prev) => `${prev}\n\n✗ Network Error: ${message}`);
      setIsScraping(false);
    }
  };

  const handleStopScrape = async () => {
    if (!confirm("Are you sure you want to stop the background scraper job?")) return;
    try {
      const res = await fetch("/api/scraper", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setIsScraping(false);
        setScrapeLogs((prev) => `${prev}\n\n🛑 Scraper job stopped safely by user.`);
      }
    } catch (err) {
      console.error("Error stopping scraper:", err);
    }
  };

  const handleOpenBrowserLogin = async () => {
    setIsOpeningBrowser(true);
    try {
      const res = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open-browser" }),
      });
      const data = await res.json();
      if (data.success) {
        setScrapeLogs((prev) => `${prev}\n[${new Date().toLocaleTimeString()}] 🌐 Chrome opened on desktop. Check login status and close when done.`);
      }
    } catch (err) {
      console.error("Error opening browser:", err);
    } finally {
      setIsOpeningBrowser(false);
    }
  };

  // Handle AI-powered Natural Language Scraper
  const handleAIScrape = async () => {
    if (!aiPrompt.trim()) return;
    setIsAIRunning(true);
    setAiResultText("🤖 AI Agent is parsing intent and searching TradeMap global directories...");

    try {
      const res = await fetch("/api/ai-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, limit: 10 }),
      });
      const data = await res.json();

      if (data.success) {
        const analysis = data.aiAnalysis;
        setAiResultText(
          `✓ ${analysis.explanation}\nExtracted ${data.scrapeResult.recordsFound} live companies into your directory.`
        );
        fetchData(1);
        fetchStats();
      } else {
        setAiResultText(`✗ AI Scraper Error: ${data.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setAiResultText(`✗ Network Error: ${message}`);
    } finally {
      setIsAIRunning(false);
    }
  };

  // Keyboard shortcut (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsAIModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Export handlers
  const handleExport = (format: "xlsx" | "csv", overrideHsCode?: string, overrideCountry?: string) => {
    const hs = overrideHsCode !== undefined ? overrideHsCode : selectedHsCode;
    const cntry = overrideCountry !== undefined ? overrideCountry : selectedCountry;
    const query = new URLSearchParams({
      format,
      search,
      country: cntry,
      hsCode: hs,
      tradeType: selectedTradeType,
    });
    const downloadUrl = `/api/export?${query.toString()}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute(
      "download",
      `TradeScan_${hs ? `HS_${hs}_` : ""}${cntry && cntry !== "World" ? `${cntry}_` : ""}Exporters.${format}`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Format nice time & date
  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return { time, date };
  };

  return (
    <div className="app-shell">
      {/* 1. Left Sidebar */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-header">
          <TradeScanLogo size={30} showText={true} showBadge={true} />
          <button className="collapse-btn" title="Collapse sidebar">
            <PanelLeftClose size={14} />
          </button>
        </div>

        {/* MongoDB Atlas Cloud Connection Status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            marginBottom: "20px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px rgba(16, 185, 129, 0.7)" }} />
            <div>
              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "12px", lineHeight: 1.2 }}>MongoDB Atlas</div>
              <div style={{ fontSize: "10px", color: "#64748b" }}>Cluster0 • tradescan</div>
            </div>
          </div>
          <span style={{ fontSize: "10px", fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "2px 7px", borderRadius: "10px" }}>
            Active
          </span>
        </div>

        {/* Navigation Sections */}
        <div className="nav-section">
          <div className="nav-section-title">Engine Tools</div>
          <div
            onClick={() => setIsScraperModalOpen(true)}
            className="nav-item"
            style={{
              cursor: "pointer",
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              color: "#ffffff",
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.2)",
              marginBottom: "6px",
            }}
          >
            <Play size={14} fill="currentColor" />
            <span>🚀 Run Live Scraper</span>
          </div>
          <div
            onClick={() => setIsAIModalOpen(true)}
            className="nav-item"
            style={{ cursor: "pointer" }}
          >
            <Sparkles size={14} style={{ color: "#8b5cf6" }} />
            <span>Ask AI Intelligence</span>
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "#94a3b8", background: "#f1f5f9", padding: "1px 5px", borderRadius: "4px" }}>Ctrl+K</span>
          </div>
        </div>

        <div className="nav-section" style={{ flex: 1 }}>
          <div className="nav-section-title">Commodity Directories</div>
          <div
            onClick={() => { setSelectedHsCode(""); setPage(1); }}
            className={`nav-item ${selectedHsCode === "" ? "active" : ""}`}
            style={{ cursor: "pointer", justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🌐</span>
              <span>All Commodities</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 700, background: selectedHsCode === "" ? "#dbeafe" : "#f1f5f9", color: selectedHsCode === "" ? "#1e40af" : "#64748b", padding: "1px 7px", borderRadius: "10px" }}>
              {stats.totalCompanies || total}
            </span>
          </div>

          {availableHsCodes.map((h) => {
            const info = getHsCommodityInfo(h.hsCode);
            const isAct = selectedHsCode === h.hsCode;
            return (
              <div
                key={h.hsCode}
                onClick={() => { setSelectedHsCode(h.hsCode); setPage(1); }}
                className={`nav-item ${isAct ? "active" : ""}`}
                style={{ cursor: "pointer", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                  <span>{info.icon}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }} title={`HS ${h.hsCode} — ${info.name}`}>
                    HS {h.hsCode} — {info.name}
                  </span>
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, background: isAct ? "#dcfce7" : "#f1f5f9", color: isAct ? "#15803d" : "#64748b", padding: "1px 7px", borderRadius: "10px" }}>
                  {h.count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer Live DB Card */}
        <div className="sidebar-footer">
          <div
            style={{
              padding: "14px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>Live Database</span>
              <span style={{ fontSize: "10px", fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: "8px" }}>🟢 Atlas Cloud</span>
            </div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
              {total.toLocaleString()} <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>Profiles</span>
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
              {withContactCount.toLocaleString()} Contacts • {withPhoneCount.toLocaleString()} Phones
            </div>
            <button
              onClick={() => setIsScraperModalOpen(true)}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "8px 0",
                fontSize: "12px",
                fontWeight: 700,
                color: "#ffffff",
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.15)",
              }}
            >
              <Plus size={13} />
              Extract New HS Code
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="main-wrapper">
        {/* Top Header */}
        <div className="top-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "14px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1 className="page-title" style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.02em" }}>
                {selectedHsCode ? `HS ${selectedHsCode} — ${getHsCommodityInfo(selectedHsCode).name}` : "TradeScan Intelligence Hub"}
              </h1>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "20px",
                  background: selectedHsCode ? "#dcfce7" : "#eff6ff",
                  color: selectedHsCode ? "#15803d" : "#1d4ed8",
                  border: selectedHsCode ? "1px solid #86efac" : "1px solid #bfdbfe",
                }}
              >
                {selectedHsCode ? `${total} Exporters` : `${total.toLocaleString()} Verified Profiles`}
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", marginTop: "3px" }}>
              {selectedHsCode
                ? `Direct director contacts, verified phones, official websites, and trade flows for HS ${selectedHsCode}`
                : "Real-time global trade intelligence directory with verified key decision makers & phone lines"}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setIsScraperModalOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                height: "40px",
                padding: "0 18px",
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "13px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(15, 23, 42, 0.25)",
              }}
            >
              <Play size={13} fill="currentColor" />
              🚀 Run Live Scraper
            </button>

            <button
              onClick={() => handleExport("xlsx")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                height: "40px",
                padding: "0 16px",
                background: selectedHsCode ? "#16a34a" : "#ffffff",
                color: selectedHsCode ? "#ffffff" : "#0f172a",
                fontWeight: 700,
                fontSize: "13px",
                borderRadius: "10px",
                border: selectedHsCode ? "none" : "1px solid #cbd5e1",
                cursor: "pointer",
                boxShadow: selectedHsCode ? "0 4px 12px rgba(22, 163, 74, 0.25)" : "0 1px 2px rgba(0,0,0,0.05)",
              }}
              title={selectedHsCode ? `Export only HS ${selectedHsCode} companies (.xlsx)` : "Export all companies (.xlsx)"}
            >
              <FileSpreadsheet size={15} style={{ color: selectedHsCode ? "#ffffff" : "#16a34a" }} />
              {selectedHsCode ? `Export HS ${selectedHsCode} Excel` : "Export Excel"}
            </button>

            <button
              onClick={() => handleExport("csv")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                height: "40px",
                padding: "0 14px",
                background: "#ffffff",
                color: "#475569",
                fontWeight: 600,
                fontSize: "13px",
                borderRadius: "10px",
                border: "1px solid #cbd5e1",
                cursor: "pointer",
              }}
              title="Export CSV"
            >
              <Download size={14} />
              CSV
            </button>
          </div>
        </div>

        {/* Sub-header Bar */}
        <div className="sub-header-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              className="ask-pill"
              onClick={() => setIsAIModalOpen(true)}
              style={{ cursor: "pointer" }}
              title="Open Natural Language Trade Intelligence (Ctrl+K)"
            >
              <Command size={13} style={{ color: "#2563eb" }} />
              <span>Search Trade Intelligence</span>
              <span className="kbd-shortcut">Ctrl+K</span>
            </div>
            <div
              className="events-indicator"
              style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" }}
              title="Connected to MongoDB Atlas Cloud Cluster"
            >
              <Radio size={13} style={{ color: "#16a34a" }} />
              <span>MongoDB Atlas 🟢 Connected</span>
            </div>
          </div>

          {isScraping && (
            <div
              onClick={() => setIsScraperModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 14px",
                background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                borderRadius: "20px",
                color: "#38bdf8",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                border: "1px solid #334155",
              }}
            >
              <RefreshCw size={13} className="spin" style={{ color: "#38bdf8" }} />
              <span>⚡ Background Extraction Active: +{activeJobRecords} Added (Click to View Terminal)</span>
            </div>
          )}
        </div>

        {/* Dynamic HS Code Navigation Ribbon, Metrics, and Coverage Ribbon */}
        {(() => {
          const currentHsInfo = getHsCommodityInfo(selectedHsCode);
          const contactPct = total > 0 ? Math.round((withContactCount / total) * 100) : 100;
          const phonePct = total > 0 ? Math.round((withPhoneCount / total) * 100) : 0;

          return (
            <>
              {/* HS Code Filter Navigation Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 16px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "14px",
                  marginBottom: "16px",
                  overflowX: "auto",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap", marginRight: "4px" }}>
                  <Package size={15} style={{ color: "#2563eb" }} />
                  <span>HS Commodity View:</span>
                </div>

                <button
                  onClick={() => { setSelectedHsCode(""); setPage(1); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: selectedHsCode === "" ? "1.5px solid #2563eb" : "1px solid #e2e8f0",
                    background: selectedHsCode === "" ? "#eff6ff" : "#ffffff",
                    color: selectedHsCode === "" ? "#1d4ed8" : "#475569",
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>🌐</span>
                  <span>All Commodities</span>
                  <span style={{ fontSize: "11px", fontWeight: 700, background: selectedHsCode === "" ? "#dbeafe" : "#f1f5f9", padding: "1px 7px", borderRadius: "10px", color: selectedHsCode === "" ? "#1e40af" : "#64748b" }}>
                    {stats.totalCompanies || total}
                  </span>
                </button>

                {availableHsCodes.map((h) => {
                  const info = getHsCommodityInfo(h.hsCode);
                  const isAct = selectedHsCode === h.hsCode;
                  return (
                    <button
                      key={h.hsCode}
                      onClick={() => { setSelectedHsCode(h.hsCode); setPage(1); }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "7px",
                        padding: "6px 14px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: isAct ? "1.5px solid #16a34a" : "1px solid #e2e8f0",
                        background: isAct ? "#f0fdf4" : "#ffffff",
                        color: isAct ? "#15803d" : "#334155",
                        boxShadow: isAct ? "0 2px 6px rgba(22, 163, 74, 0.15)" : "none",
                        transition: "all 0.15s ease",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span>{info.icon}</span>
                      <span>HS {h.hsCode} — {info.name}</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, background: isAct ? "#dcfce7" : "#f1f5f9", padding: "1px 7px", borderRadius: "10px", color: isAct ? "#166534" : "#64748b" }}>
                        {h.count}
                      </span>
                      {isAct && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setSelectedHsCode(""); setPage(1); }}
                          style={{ marginLeft: "4px", color: "#15803d", fontWeight: 700, fontSize: "14px" }}
                          title="Clear HS filter"
                        >
                          ×
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 5 Dynamic Metric Cards */}
              <div className="metrics-row">
                <div className="metric-card">
                  <div className="metric-left">
                    <span className="metric-title">
                      {selectedHsCode ? `HS ${selectedHsCode} Exporters` : "Total Exporters"}
                    </span>
                    <div className="metric-value-row">
                      <span className="metric-val">{total}</span>
                      <span
                        className="metric-change"
                        style={{
                          background: selectedHsCode ? "#dcfce7" : "#eff6ff",
                          color: selectedHsCode ? "#15803d" : "#1d4ed8",
                          fontWeight: 700,
                        }}
                      >
                        {selectedHsCode ? `HS ${selectedHsCode}` : "Total Active"}
                      </span>
                    </div>
                    <span className="metric-sub">
                      {selectedHsCode ? currentHsInfo.name : "Verified company profiles"}
                    </span>
                  </div>
                  <div className="metric-circle-icon">
                    <Building2 size={16} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-left">
                    <span className="metric-title">Key Decision Makers</span>
                    <div className="metric-value-row">
                      <span className="metric-val">{withContactCount}</span>
                      <span className="metric-change" style={{ background: "#dcfce7", color: "#15803d", fontWeight: 700 }}>
                        {contactPct}% Coverage
                      </span>
                    </div>
                    <span className="metric-sub">MDs, CEOs, Proprietors</span>
                  </div>
                  <div className="metric-circle-icon">
                    <ShieldCheck size={16} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-left">
                    <span className="metric-title">Direct Phone Numbers</span>
                    <div className="metric-value-row">
                      <span className="metric-val" style={{ color: "#2563eb" }}>{withPhoneCount}</span>
                      <span className="metric-change" style={{ background: "#eff6ff", color: "#1d4ed8", fontWeight: 700 }}>
                        {phonePct}% Available
                      </span>
                    </div>
                    <span className="metric-sub">Direct contact phone lines</span>
                  </div>
                  <div className="metric-circle-icon">
                    <CheckCircle size={16} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-left">
                    <span className="metric-title">Origin Country</span>
                    <div className="metric-value-row">
                      <span className="metric-val" style={{ fontSize: "20px" }}>India</span>
                      <span className="metric-change">ISO 699</span>
                    </div>
                    <span className="metric-sub">TradeMap Official Exporters</span>
                  </div>
                  <div className="metric-circle-icon">
                    <Globe size={16} />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-left">
                    <span className="metric-title">Active Sector</span>
                    <div className="metric-value-row">
                      <span className="metric-val" style={{ color: "#059669", fontSize: "19px" }}>
                        {selectedHsCode ? `HS ${selectedHsCode}` : "All Goods"}
                      </span>
                      <span className="metric-change" style={{ background: "#ecfdf5", color: "#059669", fontWeight: 700 }}>
                        Live DB
                      </span>
                    </div>
                    <span className="metric-sub">{currentHsInfo.name}</span>
                  </div>
                  <div className="metric-circle-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
                    <Package size={16} />
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* 3. Main Data Table Card */}
        <div className="table-card">
          {/* Card Toolbar */}
          <div className="card-toolbar" style={{ flexWrap: "wrap", gap: "12px", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "280px" }}>
              <div className="search-input-wrapper" style={{ flex: 1, maxWidth: "380px" }}>
                <Search size={15} className="search-icon-inside" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by company, city, director, or phone..."
                  className="card-search-input"
                />
              </div>

              {/* Quick Country Dropdown */}
              <select
                value={selectedCountry}
                onChange={(e) => { setSelectedCountry(e.target.value); setPage(1); }}
                style={{
                  height: "36px",
                  padding: "0 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  color: "#334155",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <option value="">🌍 All Markets</option>
                {availableCountries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Trade Type Filter */}
              <select
                value={selectedTradeType}
                onChange={(e) => { setSelectedTradeType(e.target.value); setPage(1); }}
                style={{
                  height: "36px",
                  padding: "0 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  color: "#334155",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                <option value="">All Flows</option>
                <option value="Exporter">Exporters</option>
                <option value="Importer">Importers</option>
              </select>

              {(search || selectedCountry || selectedTradeType) && (
                <button
                  onClick={() => { setSearch(""); setSelectedCountry(""); setSelectedTradeType(""); setPage(1); }}
                  style={{
                    height: "36px",
                    padding: "0 10px",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Reset search & dropdown filters"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="toolbar-actions">
              {selectedIds.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="action-btn"
                  style={{
                    borderColor: "#fca5a5",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontWeight: 600,
                  }}
                  title="Delete selected companies"
                >
                  <Trash2 size={14} />
                  <span>Delete ({selectedIds.length})</span>
                </button>
              )}

              <button
                onClick={() => setIsFilterModalOpen(true)}
                className="action-btn"
              >
                <SlidersHorizontal size={14} />
                <span>Filter</span>
              </button>

              <button
                onClick={() => setIsScraperModalOpen(true)}
                className="action-btn primary"
              >
                <Play size={13} fill="currentColor" />
                <span>Run Scraper</span>
              </button>

              <button
                onClick={() => handleExport("xlsx")}
                className="action-btn"
                title={selectedHsCode ? `Export only HS ${selectedHsCode} (${selectedCountry || 'All markets'})` : "Export all stored companies"}
                style={{
                  border: selectedHsCode ? "1.5px solid #16a34a" : undefined,
                  background: selectedHsCode ? "#f0fdf4" : undefined,
                  color: selectedHsCode ? "#15803d" : undefined,
                  fontWeight: selectedHsCode ? 700 : undefined,
                }}
              >
                <FileSpreadsheet size={14} style={{ color: "#16a34a" }} />
                <span>{selectedHsCode ? `Export HS ${selectedHsCode} Excel` : "Export Excel"}</span>
              </button>

              <button
                onClick={() => handleExport("csv")}
                className="action-btn"
                title={selectedHsCode ? `Export only HS ${selectedHsCode} as CSV` : "Export CSV"}
              >
                <Download size={14} />
                <span>{selectedHsCode ? `HS ${selectedHsCode} CSV` : "CSV"}</span>
              </button>

              {companies.length > 0 && (
                <button
                  onClick={handleClearAllData}
                  disabled={isDeleting}
                  className="action-btn"
                  style={{ color: "#ef4444", borderColor: "#fecaca" }}
                  title="Clear all stored companies from database"
                >
                  <Trash2 size={14} />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {/* Loading line indicator */}
          {isLoadingData && (
            <div style={{
              height: "2px",
              width: "100%",
              background: "linear-gradient(90deg, #2563eb 0%, #10b981 50%, #2563eb 100%)",
              backgroundSize: "200% 100%",
              animation: "loadingSlide 1s linear infinite",
            }} />
          )}

          {/* Table */}
          <table className="vocalyn-table">
            <thead>
              <tr>
                <th style={{ width: "3%" }}>
                  <input
                    type="checkbox"
                    style={{ cursor: "pointer" }}
                    checked={companies.length > 0 && selectedIds.length === companies.length}
                    onChange={toggleSelectAll}
                    title="Select all"
                  />
                </th>
                <th style={{ width: "22%" }}>Company Name ↕</th>
                <th style={{ width: "13%" }}>HS Code & Sector ↕</th>
                <th style={{ width: "18%" }}>Contact Person & Role ↕</th>
                <th style={{ width: "14%" }}>Phone Number ↕</th>
                <th style={{ width: "10%" }}>Trade Flow ↕</th>
                <th style={{ width: "11%" }}>Location ↕</th>
                <th style={{ width: "9%", textAlign: "right" }}>Actions ↕</th>
              </tr>
            </thead>
            <tbody style={{ opacity: isLoadingData ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "48px 0" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
                      <Layers size={32} style={{ opacity: 0.4 }} />
                      <p style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>No companies found</p>
                      <p style={{ fontSize: "12px" }}>Click &quot;Run Scraper&quot; above to fetch fresh trade records from TradeMap.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  const primaryProduct = company.products[0];
                  const hsInfo = getHsCommodityInfo(primaryProduct?.hsCode);
                  const isExporter = primaryProduct?.tradeType !== "Importer";
                  const isSelected = selectedIds.includes(company.id);

                  return (
                    <tr key={company.id} style={{ background: isSelected ? "#f8fafc" : undefined }}>
                      <td>
                        <input
                          type="checkbox"
                          style={{ cursor: "pointer" }}
                          checked={isSelected}
                          onChange={() => toggleSelect(company.id)}
                        />
                      </td>
                      <td>
                        <div className="cell-type">
                          <Building2 size={15} className="type-icon" style={{ color: "#2563eb", flexShrink: 0 }} />
                          <div>
                            <span style={{ fontWeight: 600, display: "block" }}>{company.name}</span>
                            {company.city && (
                              <span style={{ fontSize: "11px", color: "#64748b" }}>{company.city}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {primaryProduct?.hsCode ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span
                              onClick={() => { setSelectedHsCode(primaryProduct.hsCode || ""); setPage(1); }}
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: "#eff6ff",
                                border: "1px solid #bfdbfe",
                                padding: "2px 7px",
                                borderRadius: "6px",
                                color: "#1d4ed8",
                                cursor: "pointer",
                                width: "fit-content",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title={`Filter by HS ${primaryProduct.hsCode}`}
                            >
                              <span>{hsInfo.icon}</span> HS {primaryProduct.hsCode}
                            </span>
                            <span style={{ fontSize: "11px", color: "#64748b", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {primaryProduct.productCategory?.replace(`HS ${primaryProduct.hsCode}`, '').trim() || hsInfo.name}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td>
                        {company.contactName ? (
                          <div>
                            <span style={{ fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "5px", fontSize: "12.5px" }}>
                              <span style={{ fontSize: "13px" }}>👤</span> {company.contactName}
                            </span>
                            {company.contactRole && (
                              <span style={{ fontSize: "11px", color: "#059669", background: "#ecfdf5", padding: "1px 6px", borderRadius: "4px", fontWeight: 500, display: "inline-block", marginTop: "2px" }}>
                                {company.contactRole}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>Not listed</span>
                        )}
                      </td>
                      <td>
                        {company.phone ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <a
                              href={`tel:${company.phone}`}
                              style={{
                                color: "#2563eb",
                                fontWeight: 600,
                                fontSize: "12px",
                                textDecoration: "none",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              📞 {company.phone}
                            </a>
                            <button
                              onClick={() => copyToClipboard(company.phone || "", `phone-${company.id}`)}
                              className="mini-icon-btn"
                              style={{ padding: "2px", width: "20px", height: "20px" }}
                              title="Copy phone"
                            >
                              {copiedId === `phone-${company.id}` ? (
                                <Check size={12} style={{ color: "#16a34a" }} />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge-outcome ${
                            isExporter ? "exporter" : "importer"
                          }`}
                        >
                          {isExporter ? "Exporter" : "Importer"}
                        </span>
                      </td>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#475569", fontSize: "12px" }}>
                          <MapPin size={13} style={{ color: "#94a3b8", flexShrink: 0 }} />
                          <span style={{ maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {company.city ? `${company.city}, ` : ""}{company.country || "India"}
                          </span>
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {company.website ? (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                              className="mini-icon-btn"
                              title="Visit official website"
                            >
                              <ExternalLink size={14} />
                            </a>
                          ) : null}
                          <button
                            onClick={() => setActiveCompany(company)}
                            className="mini-icon-btn"
                            title="View full trade details"
                          >
                            <SlidersHorizontal size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteCompany(company.id, company.name)}
                            className="mini-icon-btn"
                            title="Delete this company"
                            style={{ color: "#ef4444" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Table Footer Pagination */}
          <div className="card-footer">
            <span>
              Showing {companies.length > 0 ? (page - 1) * 10 + 1 : 0} to {Math.min(page * 10, total)} of {total} Exporters
            </span>

            <div className="pagination-group">
              <button
                onClick={() => {
                  const prev = Math.max(1, page - 1);
                  setPage(prev);
                  fetchData(prev);
                }}
                disabled={page <= 1}
                className="page-num-btn"
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPage(p);
                    fetchData(p);
                  }}
                  className={`page-num-btn ${page === p ? "active" : ""}`}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => {
                  const next = Math.min(totalPages, page + 1);
                  setPage(next);
                  fetchData(next);
                }}
                disabled={page >= totalPages}
                className="page-num-btn"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* 4. Filter Modal */}
      {isFilterModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsFilterModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Filter Exporters</h3>
              <button onClick={() => setIsFilterModalOpen(false)} className="mini-icon-btn">
                <X size={16} />
              </button>
            </div>

            <div className="modal-form-group">
              <label className="modal-label">Commodity / HS Code</label>
              <select
                value={selectedHsCode}
                onChange={(e) => setSelectedHsCode(e.target.value)}
                className="modal-select"
              >
                <option value="">All HS Codes / Commodities</option>
                {availableHsCodes.map((h) => {
                  const info = getHsCommodityInfo(h.hsCode);
                  return (
                    <option key={h.hsCode} value={h.hsCode}>
                      {info.icon} HS {h.hsCode} — {info.name} ({h.count} companies)
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="modal-form-group">
              <label className="modal-label">Country Filter</label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="modal-select"
              >
                <option value="">All Countries</option>
                {availableCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-form-group">
              <label className="modal-label">Trade Flow</label>
              <select
                value={selectedTradeType}
                onChange={(e) => setSelectedTradeType(e.target.value)}
                className="modal-select"
              >
                <option value="">All Trade Types</option>
                <option value="Exporter">Exporters / Suppliers</option>
                <option value="Importer">Importers / Buyers</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={() => {
                  setSelectedCountry("");
                  setSelectedTradeType("");
                  setSelectedHsCode("");
                  setIsFilterModalOpen(false);
                }}
                className="action-btn"
                style={{ flex: 1 }}
              >
                Reset
              </button>
              <button
                onClick={() => {
                  setIsFilterModalOpen(false);
                  fetchData(1);
                }}
                className="action-btn primary"
                style={{ flex: 1 }}
              >
                Apply Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. AI Scraper Prompt Modal */}
      {isAIModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAIModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <TradeScanMark size={30} />
                <div>
                  <h3 className="modal-title" style={{ fontSize: "16px", margin: 0 }}>Natural Language Trade Query</h3>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Instant AI Resolution & TradeMap Extraction</span>
                </div>
              </div>
              <button onClick={() => setIsAIModalOpen(false)} className="mini-icon-btn">
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "14px", lineHeight: "1.4" }}>
              Type any trade inquiry in plain English. The AI agent will automatically resolve the country, international HS code, and trade flow, then extract verified companies directly from TradeMap.org.
            </p>

            <div className="modal-form-group">
              <label className="modal-label">Your Inquiry / Prompt</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Find cotton fabric exporters in India, or Top coffee buyers in Germany"
                className="modal-input"
                style={{ height: "65px", paddingTop: "8px", resize: "none" }}
              />
            </div>

            {/* Quick Prompt Suggestions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
              {[
                "Rice exporters in India",
                "Spices exporters in India",
                "Tea exporters in India",
                "Cotton fabric exporters in India",
                "Leather exporters in India",
                "Coffee buyers in Germany",
                "Pharma exporters in India",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setAiPrompt(suggestion)}
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: "14px",
                    cursor: "pointer",
                    color: "#475569",
                  }}
                >
                  ⚡ {suggestion}
                </button>
              ))}
            </div>

            {aiResultText && (
              <div
                style={{
                  background: "#0f172a",
                  color: "#93c5fd",
                  borderRadius: "8px",
                  padding: "12px",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  marginBottom: "16px",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.5",
                }}
              >
                {aiResultText}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setIsAIModalOpen(false)}
                className="action-btn"
                style={{ flex: 1 }}
              >
                Close
              </button>
              <button
                onClick={handleAIScrape}
                disabled={isAIRunning}
                className="action-btn primary"
                style={{ flex: 1.5, justifyContent: "center" }}
              >
                {isAIRunning ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    AI Extracting...
                  </>
                ) : (
                  <>
                    <ArrowUpRight size={15} />
                    Execute Query
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Scraper Extraction Modal */}
      {isScraperModalOpen && (() => {
        const currentCommodityInfo = resolveCommodity(scrapeHsCode);
        return (
          <div className="modal-backdrop" onClick={() => setIsScraperModalOpen(false)}>
            <div
              className="modal-dialog"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: scraperTab === "batch" ? "min(640px, calc(100vw - 32px))" : "min(520px, calc(100vw - 32px))",
                maxHeight: "calc(100dvh - 32px)",
                display: "flex",
                flexDirection: "column",
                padding: 0,
                borderRadius: "18px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
                overflow: "hidden",
              }}
            >
              {/* Pinned Header */}
              <div
                className="modal-dialog-header"
                style={{
                  padding: "18px 22px 12px 22px",
                  borderBottom: "1px solid #f1f5f9",
                  background: "#ffffff",
                  flexShrink: 0,
                }}
              >
                <div className="modal-header" style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <TradeScanMark size={36} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <h3 className="modal-title" style={{ fontSize: "16px", margin: 0 }}>
                          TradeMap Live Scraper
                        </h3>
                        <span
                          style={{
                            fontSize: "10.5px",
                            fontWeight: 600,
                            padding: "2px 7px",
                            borderRadius: "12px",
                            background: "#ecfdf5",
                            color: "#059669",
                            border: "1px solid #a7f3d0",
                          }}
                        >
                          Direct API
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                        Extract verified exporter directories with director names & phone contacts
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsScraperModalOpen(false)}
                    className="mini-icon-btn"
                    style={{ borderRadius: "8px", width: "30px", height: "30px" }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Mode Selector Tabs: Single HS Code vs Batch Mode */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "6px",
                    background: "#f1f5f9",
                    padding: "4px",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setScraperTab("single")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "7px",
                      border: "none",
                      background: scraperTab === "single" ? "#ffffff" : "transparent",
                      color: scraperTab === "single" ? "#0f172a" : "#64748b",
                      fontWeight: 600,
                      fontSize: "12.5px",
                      cursor: "pointer",
                      boxShadow: scraperTab === "single" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    🎯 Single HS Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setScraperTab("batch")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "7px",
                      border: "none",
                      background: scraperTab === "batch" ? "#ffffff" : "transparent",
                      color: scraperTab === "batch" ? "#2563eb" : "#64748b",
                      fontWeight: 600,
                      fontSize: "12.5px",
                      cursor: "pointer",
                      boxShadow: scraperTab === "batch" ? "0 1px 3px rgba(37,99,235,0.12)" : "none",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <span>⚡ Batch Mode</span>
                    <span
                      style={{
                        fontSize: "10px",
                        background: scraperTab === "batch" ? "#eff6ff" : "#e2e8f0",
                        color: scraperTab === "batch" ? "#1d4ed8" : "#475569",
                        padding: "1px 6px",
                        borderRadius: "10px",
                      }}
                    >
                      3x Parallel
                    </span>
                  </button>
                </div>
              </div>

              {/* Scrollable Body Container */}
              <div
                className="modal-dialog-body"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  padding: "16px 22px",
                }}
              >
                {scraperTab === "single" ? (
                <>
                  {/* 1. Target Country Dropdown */}
                  <div className="modal-form-group" style={{ marginBottom: "16px" }}>
                    <label className="modal-label">Target Country / Market</label>
                    <div className="input-with-icon-wrapper">
                      <Globe size={15} className="input-icon-left" />
                      <select
                        value={scrapeCountryCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          const found = ALL_COUNTRIES.find((c) => c.code === code);
                          setScrapeCountryCode(code);
                          setScrapeCountry(found ? found.name : "World");
                        }}
                        className="modal-select"
                      >
                        {ALL_COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.name} {c.code === "000" ? "(All Global Markets - 000)" : `(ISO ${c.code})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Quick Country Pills */}
                    <div className="quick-pill-container">
                      {[
                        { label: "🌍 World", val: "World", code: "000" },
                        { label: "🇮🇳 India", val: "India", code: "699" },
                        { label: "🇩🇪 Germany", val: "Germany", code: "276" },
                        { label: "🇻🇳 Vietnam", val: "Vietnam", code: "704" },
                        { label: "🇺🇸 USA", val: "United States", code: "842" },
                        { label: "🇦🇪 UAE", val: "United Arab Emirates", code: "784" },
                        { label: "🇨🇳 China", val: "China", code: "156" },
                      ].map((c) => (
                        <button
                          key={c.val}
                          type="button"
                          onClick={() => {
                            setScrapeCountry(c.val);
                            setScrapeCountryCode(c.code);
                          }}
                          className={`quick-pill ${scrapeCountry.toLowerCase() === c.val.toLowerCase() ? "active" : ""}`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Custom HS Code Input & Commodities */}
                  <div className="modal-form-group" style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label className="modal-label" style={{ margin: 0 }}>HS Code & Commodity Sector</label>
                      <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                        <CheckCircle2 size={12} style={{ color: "#16a34a" }} /> Zero-Blank Guarantees
                      </span>
                    </div>

                    <div style={{ marginBottom: "8px" }}>
                      <input
                        type="text"
                        placeholder="Type ANY 4 or 6 digit HS Code (e.g. 310210, 5208, 0902)..."
                        value={customHsInput}
                        onChange={(e) => {
                          setCustomHsInput(e.target.value);
                          setScrapeHsCode(e.target.value);
                        }}
                        className="modal-select"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "#0f172a",
                          background: "#f8fafc",
                          borderColor: "#93c5fd",
                        }}
                      />
                    </div>

                    {/* Quick Commodity Pills */}
                    <div className="quick-pill-container" style={{ marginTop: "6px" }}>
                      {[
                        { label: "🌱 Urea (310210)", hs: "310210" },
                        { label: "🧵 Cotton (5208)", hs: "5208" },
                        { label: "🫖 Tea (0902)", hs: "0902" },
                        { label: "🌶️ Spices (0910)", hs: "0910" },
                        { label: "🌾 Rice (1006)", hs: "1006" },
                        { label: "☕ Coffee (0901)", hs: "0901" },
                        { label: "💊 Pharma (3004)", hs: "3004" },
                        { label: "🏗️ Steel (7208)", hs: "7208" },
                      ].map((g) => {
                        const isAct = customHsInput.trim() === g.hs;
                        return (
                          <button
                            key={g.hs}
                            type="button"
                            onClick={() => {
                              setCustomHsInput(g.hs);
                              setScrapeHsCode(g.hs);
                            }}
                            className={`quick-pill ${isAct ? "active" : ""}`}
                          >
                            {g.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Trade Flow Dropdown */}
                  <div className="modal-form-group" style={{ marginBottom: "16px" }}>
                    <label className="modal-label">Trade Flow</label>
                    <select
                      value={scrapeTradeFlow}
                      onChange={(e) => setScrapeTradeFlow(e.target.value as "exports" | "imports")}
                      className="modal-select"
                      style={{ fontWeight: 600 }}
                    >
                      <option value="imports">↙ Importers / Buyers (Code I)</option>
                      <option value="exports">↗ Exporters / Suppliers (Code E)</option>
                    </select>
                  </div>

                  {/* 3b. TradeMap Session Status & One-Click Browser Verification */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "10px 14px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      marginBottom: "14px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Globe size={15} style={{ color: "#2563eb" }} />
                      <div style={{ fontSize: "12px", color: "#1e293b", fontWeight: 500 }}>
                        <strong>TradeMap Profile:</strong> Persistent Session
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenBrowserLogin}
                      disabled={isOpeningBrowser}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "5px 12px",
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        border: "1px solid #bfdbfe",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                      title="Opens TradeMap in Chrome to verify login or sign in"
                    >
                      <ExternalLink size={12} />
                      {isOpeningBrowser ? "Opening Chrome..." : "Verify / Open Login"}
                    </button>
                  </div>

                  {/* 4. MongoDB Atlas Database Banner */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "10px 14px",
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "10px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <ShieldCheck size={16} style={{ color: "#16a34a" }} />
                      <span style={{ fontSize: "12px", color: "#166534", fontWeight: 600 }}>
                        Target Database: MongoDB Atlas Cloud (tradescan)
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", background: "#dcfce7", color: "#15803d", padding: "2px 8px", borderRadius: "12px", fontWeight: 700 }}>
                      Active 🟢
                    </span>
                  </div>

                  {/* 5. Live Logs Console */}
                  {scrapeLogs && (
                    <div
                      style={{
                        background: "#020617",
                        color: "#38bdf8",
                        borderRadius: "10px",
                        padding: "14px",
                        fontSize: "11.5px",
                        fontFamily: "var(--font-mono)",
                        maxHeight: "150px",
                        overflowY: "auto",
                        marginBottom: "16px",
                        whiteSpace: "pre-wrap",
                        border: "1px solid #1e293b",
                        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)",
                        lineHeight: "1.5",
                      }}
                    >
                      {scrapeLogs}
                    </div>
                  )}

                  {/* Direct Excel Download for this Specific Scrape */}
                  {scrapeLogs && (scrapeLogs.includes("JOB COMPLETE") || scrapeLogs.includes("Done]")) && (
                    <div
                      style={{
                        marginBottom: "16px",
                        padding: "14px 16px",
                        background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                        borderRadius: "12px",
                        border: "1.5px solid #22c55e",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: "#15803d", fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>📊</span>
                          <span>Separate Excel Ready (No Mixing)!</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#166534", marginTop: "2px" }}>
                          Download only this commodity (HS {customHsInput.trim() || resolveCommodity(scrapeHsCode).hsCode || scrapeHsCode}) without mixing with other databases.
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => {
                            const finalHs = customHsInput.trim() || resolveCommodity(scrapeHsCode).hsCode || scrapeHsCode || "310210";
                            handleExport("xlsx", finalHs, scrapeCountry);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            background: "#16a34a",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "13px",
                            padding: "8px 16px",
                            borderRadius: "8px",
                            border: "none",
                            cursor: "pointer",
                            boxShadow: "0 2px 8px rgba(22, 163, 74, 0.3)",
                          }}
                        >
                          <FileSpreadsheet size={15} />
                          Download HS {customHsInput.trim() || resolveCommodity(scrapeHsCode).hsCode || scrapeHsCode} Excel
                        </button>
                        <button
                          onClick={() => {
                            const finalHs = customHsInput.trim() || resolveCommodity(scrapeHsCode).hsCode || scrapeHsCode || "310210";
                            handleExport("csv", finalHs, scrapeCountry);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            background: "#ffffff",
                            color: "#15803d",
                            fontWeight: 700,
                            fontSize: "13px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid #86efac",
                            cursor: "pointer",
                          }}
                        >
                          <Download size={14} />
                          CSV
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : batchStatus?.isRunning ? (
                /* ========================================================== */
                /* 🟢 LIVE PARALLEL EXTRACTION ENGINE RUNNER HUD             */
                /* ========================================================== */
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      {/* 1. Live Active Banner & Beacon */}
                      <div
                        style={{
                          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                          borderRadius: "14px",
                          padding: "12px 16px",
                          color: "#ffffff",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          border: "1px solid #334155",
                          boxShadow: "0 4px 20px rgba(15, 23, 42, 0.15)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span
                              style={{
                                width: "12px",
                                height: "12px",
                                borderRadius: "50%",
                                background: "#22c55e",
                                boxShadow: "0 0 10px #22c55e",
                                display: "inline-block",
                              }}
                            />
                          </div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "13.5px", fontWeight: 800, letterSpacing: "0.3px" }}>
                                LIVE {batchStatus.workerCount || 4}x PARALLEL PIPELINE ACTIVE
                              </span>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  background: "#22c55e",
                                  color: "#052e16",
                                  padding: "1px 6px",
                                  borderRadius: "10px",
                                }}
                              >
                                STREAMING
                              </span>
                            </div>
                            <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>
                              Tasks: {batchStatus.completedTasks || 0}/{batchStatus.totalTasks || 0} ({batchStatus.progressPercent || 0}%) • MongoDB Atlas Connected
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "10.5px", color: "#94a3b8" }}>Elapsed Time</div>
                          <div style={{ fontSize: "13.5px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#38bdf8" }}>
                            {Math.floor((batchStatus.elapsedSeconds || 0) / 60)}m {(batchStatus.elapsedSeconds || 0) % 60}s
                          </div>
                        </div>
                      </div>

                      {/* 2. Key Metrics Grid (4 Cards: Progress, ETA, Extracted, Workers) */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                        {/* Progress Card */}
                        <div
                          style={{
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                            Overall Progress
                          </span>
                          <div style={{ fontSize: "18px", fontWeight: 800, color: "#1d4ed8" }}>
                            {batchStatus.progressPercent || 0}%
                          </div>
                          <div style={{ width: "100%", height: "5px", background: "#e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${Math.max(batchStatus.progressPercent || 0, 5)}%`,
                                height: "100%",
                                background: "linear-gradient(90deg, #2563eb, #38bdf8)",
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: "10px", color: "#64748b" }}>
                            {batchStatus.completedTasks || 0} of {batchStatus.totalTasks || 0} pages
                          </span>
                        </div>

                        {/* ETA Card - "Kitni der me hoga" */}
                        <div
                          style={{
                            background: "#f0fdf4",
                            border: "1px solid #bbf7d0",
                            borderRadius: "10px",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>
                            Est. Time (ETA)
                          </span>
                          <div style={{ fontSize: "16.5px", fontWeight: 800, color: "#15803d" }}>
                            {batchStatus.etaSeconds
                              ? `~${Math.floor(batchStatus.etaSeconds / 60)}m ${batchStatus.etaSeconds % 60}s`
                              : batchStatus.completedTasks === 0
                              ? "Estimating..."
                              : "< 30s"}
                          </div>
                          <span style={{ fontSize: "10px", color: "#166534" }}>
                            Speed: {batchStatus.speedRecordsPerMin || "~320"}/min
                          </span>
                        </div>

                        {/* Profiles Saved - "Kahan tak pahucha" */}
                        <div
                          style={{
                            background: "#eff6ff",
                            border: "1px solid #bfdbfe",
                            borderRadius: "10px",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#1e40af", textTransform: "uppercase" }}>
                            Profiles Saved
                          </span>
                          <div style={{ fontSize: "18px", fontWeight: 800, color: "#1d4ed8" }}>
                            {(batchStatus.totalExtracted || 0).toLocaleString()}
                          </div>
                          <span style={{ fontSize: "10px", color: "#1e40af" }}>
                            Live in Mongo Atlas
                          </span>
                        </div>

                        {/* Active Pipeline */}
                        <div
                          style={{
                            background: "#faf5ff",
                            border: "1px solid #e9d5ff",
                            borderRadius: "10px",
                            padding: "10px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#6b21a8", textTransform: "uppercase" }}>
                            Pipeline
                          </span>
                          <div style={{ fontSize: "18px", fontWeight: 800, color: "#7e22ce" }}>
                            {batchStatus.workerCount || 4}x Parallel
                          </div>
                          <span style={{ fontSize: "10px", color: "#6b21a8" }}>
                            STS Direct OAuth2
                          </span>
                        </div>
                      </div>

                      {/* 3. 4 Parallel Worker Telemetry Cards Grid */}
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <RefreshCw size={13} className="spin" style={{ color: "#2563eb" }} />
                          <span>Live Telemetry per Worker Account:</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {(batchStatus.active && batchStatus.active.length > 0
                            ? batchStatus.active
                            : [1, 2, 3, 4].map((id: number) => ({
                                workerId: id,
                                email: `Worker #${id}`,
                                displayAccount: `Account #${id}`,
                                status: "IDLE",
                                currentCompany: "Connecting...",
                              }))
                          ).map((w: any) => {
                            const isFetching = w.status === "FETCHING";
                            const isEnriching = w.status === "ENRICHING";
                            const isDone = w.status === "TASK_DONE";
                            const badgeColor = isFetching
                              ? { bg: "#fef3c7", text: "#b45309", border: "#fde68a", label: `⚡ Page ${w.page || 1}/${w.totalPages || 1}` }
                              : isEnriching
                              ? { bg: "#dbeafe", text: "#1d4ed8", border: "#bfdbfe", label: `🔍 Enriching (${w.currentRecord || 0}/${w.totalOnPage || 100})` }
                              : isDone
                              ? { bg: "#dcfce7", text: "#15803d", border: "#bbf7d0", label: "✅ Page Saved" }
                              : { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0", label: "⏳ Idle / Waiting" };

                            return (
                              <div
                                key={w.workerId}
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "10px",
                                  padding: "9px 12px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "5px",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontWeight: 800, fontSize: "12px", color: "#0f172a" }}>
                                      Worker #{w.workerId}
                                    </span>
                                    <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                                      ({w.displayAccount || w.email?.split("@")[0] || `Acc ${w.workerId}`})
                                    </span>
                                  </div>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      padding: "2px 7px",
                                      borderRadius: "8px",
                                      background: badgeColor.bg,
                                      color: badgeColor.text,
                                      border: `1px solid ${badgeColor.border}`,
                                    }}
                                  >
                                    {badgeColor.label}
                                  </span>
                                </div>

                                <div style={{ fontSize: "11px", color: "#1e293b", fontWeight: 600 }}>
                                  {w.hsCode ? (
                                    <>
                                      <span style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: "6px" }}>
                                        HS {w.hsCode}
                                      </span>{" "}
                                      • {w.countryName || "India"} ({w.tradeFlow || "exports"})
                                    </>
                                  ) : (
                                    <span style={{ color: "#94a3b8" }}>Standby / Ready</span>
                                  )}
                                </div>

                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#475569",
                                    background: "#f8fafc",
                                    padding: "4px 8px",
                                    borderRadius: "6px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={w.currentCompany}
                                >
                                  🏢 {w.currentCompany || "Processing task..."}
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10px", color: "#64748b" }}>
                                  <span>Task: <strong>{w.extractedThisTask || 0}</strong></span>
                                  <span>Total Saved: <strong>{w.totalExtracted || 0}</strong></span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 4. Live Activity Stream / Console ("Kya hua") */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                            <Terminal size={13} style={{ color: "#2563eb" }} />
                            <span>Real-time Live Activity Console ("Kya Hua"):</span>
                          </div>
                          <span style={{ fontSize: "10.5px", color: "#64748b" }}>
                            Live Event Stream ({batchStatus.logs?.length || 0} events)
                          </span>
                        </div>
                        <div
                          ref={logContainerRef}
                          style={{
                            background: "#090d16",
                            borderRadius: "10px",
                            border: "1px solid #1e293b",
                            padding: "10px 12px",
                            height: "135px",
                            overflowY: "auto",
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            lineHeight: "1.6",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          {batchStatus.logs && batchStatus.logs.length > 0 ? (
                            batchStatus.logs.map((log: string, idx: number) => {
                              const isDone = log.includes("COMPLETED") || log.includes("Saved") || log.includes("FINISHED");
                              const isError = log.includes("Error") || log.includes("FAILED") || log.includes("❌");
                              const color = isDone ? "#4ade80" : isError ? "#f87171" : "#93c5fd";
                              return (
                                <div key={idx} style={{ color }}>
                                  {log}
                                </div>
                              );
                            })
                          ) : (
                            <div style={{ color: "#64748b" }}>Initializing distributed queue and authenticated sessions...</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ========================================================== */
                    /* BATCH CONFIGURATION FORM (IDLE / READY TO RUN)             */
                    /* ========================================================== */
                    <>
                      {/* Completed HS Codes & Downloads from previous batch */}
                      {batchStatus?.completed && batchStatus.completed.length > 0 && (
                        <div
                          style={{
                            background: "#f0fdf4",
                            border: "1px solid #86efac",
                            borderRadius: "12px",
                            padding: "12px 14px",
                            marginBottom: "16px",
                          }}
                        >
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#15803d", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <CheckCircle size={14} style={{ color: "#16a34a" }} />
                            <span>Recently Completed Extractions ({batchStatus.completed.length} HS Codes Ready):</span>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {batchStatus.completed.map((c: any) => (
                              <button
                                key={c.hsCode}
                                type="button"
                                onClick={() => handleExport("xlsx", c.hsCode, c.countryName || scrapeCountry)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "6px 12px",
                                  background: "#ffffff",
                                  border: "1px solid #86efac",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#166534",
                                  cursor: "pointer",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                }}
                                title={`Download dedicated Excel for HS ${c.hsCode}`}
                              >
                                <FileSpreadsheet size={14} style={{ color: "#16a34a" }} />
                                <span>Download HS {c.hsCode} ({c.count} records)</span>
                              </button>
                            ))}
                          </div>
                        </div>
                  )}

                </>
              )}
              </div>

              {/* Pinned Footer Action Buttons - ALWAYS PINNED AT BOTTOM */}
              <div
                className="modal-dialog-footer"
                style={{
                  padding: "14px 22px 18px 22px",
                  borderTop: "1px solid #f1f5f9",
                  background: "#ffffff",
                  flexShrink: 0,
                  display: "flex",
                  gap: "10px",
                }}
              >
                {scraperTab === "single" ? (
                  isScraping ? (
                    <>
                      <button
                        onClick={handleStopScrape}
                        className="action-btn"
                        style={{
                          flex: 1,
                          height: "44px",
                          background: "#fee2e2",
                          color: "#991b1b",
                          border: "1px solid #fecaca",
                          fontWeight: 700,
                          borderRadius: "10px",
                        }}
                      >
                        🛑 Stop Extraction
                      </button>
                      <button
                        disabled
                        className="action-btn primary"
                        style={{
                          flex: 1.6,
                          height: "44px",
                          justifyContent: "center",
                          borderRadius: "10px",
                          fontWeight: 600,
                          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                        }}
                      >
                        <RefreshCw size={15} className="spin" />
                        Running... (+{activeJobRecords} Added)
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setIsScraperModalOpen(false)}
                        className="action-btn"
                        style={{
                          flex: 1,
                          height: "44px",
                          justifyContent: "center",
                          borderRadius: "10px",
                          fontWeight: 600,
                        }}
                      >
                        Close
                      </button>
                      <button
                        onClick={handleTriggerScrape}
                        className="action-btn primary"
                        style={{
                          flex: 1.6,
                          height: "44px",
                          justifyContent: "center",
                          borderRadius: "10px",
                          fontWeight: 700,
                          background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                          boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                        }}
                      >
                        <Play size={14} fill="currentColor" />
                        <span>Start Live Scraping</span>
                      </button>
                    </>
                  )
                ) : batchStatus?.isRunning ? (
                  <>
                    <button
                      type="button"
                      onClick={handleStopBatch}
                      disabled={isStoppingBatch}
                      className="action-btn"
                      style={{
                        flex: 1,
                        height: "44px",
                        justifyContent: "center",
                        borderRadius: "10px",
                        fontWeight: 700,
                        background: "#fee2e2",
                        color: "#991b1b",
                        border: "1px solid #fecaca",
                        cursor: isStoppingBatch ? "not-allowed" : "pointer",
                      }}
                    >
                      {isStoppingBatch ? (
                        <>
                          <RefreshCw size={14} className="spin" />
                          <span>Stopping Pipeline...</span>
                        </>
                      ) : (
                        <span>🛑 Stop Batch Scrape</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsScraperModalOpen(false)}
                      className="action-btn primary"
                      style={{
                        flex: 1.6,
                        height: "44px",
                        justifyContent: "center",
                        borderRadius: "10px",
                        fontWeight: 700,
                        background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                        boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                        cursor: "pointer",
                      }}
                    >
                      <span>Run in Background (Minimize)</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsScraperModalOpen(false)}
                      className="action-btn"
                      style={{
                        flex: 1,
                        height: "44px",
                        justifyContent: "center",
                        borderRadius: "10px",
                        fontWeight: 600,
                      }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleStartBatch}
                      disabled={isStartingBatch}
                      className="action-btn primary"
                      style={{
                        flex: 1.6,
                        height: "44px",
                        justifyContent: "center",
                        borderRadius: "10px",
                        fontWeight: 700,
                        background: isStartingBatch
                          ? "#334155"
                          : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                        boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                        cursor: isStartingBatch ? "not-allowed" : "pointer",
                      }}
                    >
                      {isStartingBatch ? (
                        <>
                          <RefreshCw size={14} className="spin" />
                          <span>Starting 4x Parallel Workers...</span>
                        </>
                      ) : (
                        <>
                          <Play size={14} fill="currentColor" />
                          <span>Start {batchWorkerCount}x Parallel Batch Scrape</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6. Slide-Over Detail Drawer */}
      {activeCompany && (
        <div className="drawer-backdrop" onClick={() => setActiveCompany(null)}>
          <div className="drawer-pane" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {activeCompany.name}
                </h3>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {activeCompany.country} • {activeCompany.city || "Headquarters"}
                </span>
              </div>
              <button onClick={() => setActiveCompany(null)} className="mini-icon-btn">
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Registered Address
              </span>
              <p style={{ fontSize: "13px", color: "var(--text-primary)", marginTop: "4px" }}>
                {activeCompany.address || "Address not publicly listed"}
              </p>
            </div>

            {(activeCompany.contactName || activeCompany.phone) && (
              <div style={{ marginBottom: "18px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Key Contact Details
                </span>
                {activeCompany.contactName && (
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {activeCompany.contactName} {activeCompany.contactRole && <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>({activeCompany.contactRole})</span>}
                  </p>
                )}
                {activeCompany.phone && (
                  <p style={{ fontSize: "13px", color: "#2563eb", marginTop: "2px", fontWeight: 500 }}>
                    📞 {activeCompany.phone}
                  </p>
                )}
              </div>
            )}

            <div style={{ marginBottom: "20px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                Online Links
              </span>
              <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                {activeCompany.website && (
                  <a
                    href={activeCompany.website}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "13px", color: "#2563eb", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
                  >
                    <ExternalLink size={13} /> Official Website
                  </a>
                )}
                {activeCompany.sourceUrl && (
                  <a
                    href={activeCompany.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "13px", color: "#059669", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
                  >
                    <Globe size={13} /> TradeMap Profile
                  </a>
                )}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "10px" }}>
                Products & Commodities ({activeCompany.products.length})
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {activeCompany.products.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: "10px 12px",
                      background: "#f8fafc",
                      border: "1px solid var(--border-light)",
                      borderRadius: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                        HS {p.hsCode || "General"}
                      </span>
                      <span className="badge-outcome exporter">
                        {p.tradeType || "Exporter"}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {p.productCategory || "Merchandise goods"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "auto", paddingTop: "20px", display: "flex", gap: "10px" }}>
              <button
                onClick={() => handleExport("xlsx")}
                className="action-btn primary"
                style={{ flex: 1.5, justifyContent: "center" }}
              >
                <FileSpreadsheet size={15} />
                Export to Excel
              </button>
              <button
                onClick={() => handleDeleteCompany(activeCompany.id, activeCompany.name)}
                className="action-btn"
                style={{
                  flex: 1,
                  justifyContent: "center",
                  borderColor: "#fca5a5",
                  background: "#fef2f2",
                  color: "#dc2626",
                  fontWeight: 600,
                }}
                title="Delete this company profile"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 🔔 Floating Completion Toast Notification ("Data Aa Gaya") */}
      {notification && (
        <div
          style={{
            position: "fixed",
            bottom: "28px",
            right: "28px",
            zIndex: 999999,
            maxWidth: "420px",
            background: "#ffffff",
            border: "1.5px solid #22c55e",
            borderRadius: "16px",
            boxShadow: "0 20px 45px -10px rgba(34, 197, 94, 0.35), 0 10px 20px -5px rgba(0, 0, 0, 0.08)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            animation: "slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "11px",
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "#16a34a",
              }}
            >
              <CheckCircle size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                  {notification.title}
                </h4>
                <button
                  onClick={() => setNotification(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    borderRadius: "4px",
                  }}
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#475569", lineHeight: 1.5 }}>
                {notification.message}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "2px", paddingLeft: "50px" }}>
            {notification.hsCode && (
              <button
                onClick={() => {
                  setSelectedHsCode(notification.hsCode || "");
                  setNotification(null);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: "#22c55e",
                  color: "#ffffff",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span>View HS {notification.hsCode}</span>
                <span>→</span>
              </button>
            )}
            <button
              onClick={() => {
                handleExport("xlsx", notification.hsCode || undefined);
                setNotification(null);
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                background: "#f0fdf4",
                color: "#166534",
                border: "1px solid #bbf7d0",
                fontSize: "11.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <FileSpreadsheet size={13} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      )}

      {/* 🚀 Floating Minimized Batch Progress Widget (Visible when scraping runs in background) */}
      {batchStatus?.isRunning && !isScraperModalOpen && (
        <div
          onClick={() => {
            setIsScraperModalOpen(true);
            setScraperTab("batch");
          }}
          style={{
            position: "fixed",
            bottom: "28px",
            right: "28px",
            zIndex: 99999,
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            border: "1px solid #38bdf8",
            borderRadius: "14px",
            boxShadow: "0 12px 35px rgba(15, 23, 42, 0.4), 0 0 15px rgba(56, 189, 248, 0.25)",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            cursor: "pointer",
            color: "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 10px #22c55e",
                display: "inline-block",
              }}
            />
            <span style={{ fontWeight: 800, fontSize: "12.5px", letterSpacing: "0.3px" }}>
              4x Scraper Active
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "#cbd5e1" }}>
            <span style={{ color: "#38bdf8", fontWeight: 700 }}>
              {batchStatus.progressPercent || 0}% ({batchStatus.completedTasks || 0}/{batchStatus.totalTasks || 0})
            </span>
            <span>•</span>
            <span>{(batchStatus.totalExtracted || 0).toLocaleString()} records</span>
            <span>•</span>
            <span style={{ color: "#4ade80", fontWeight: 600 }}>
              ETA: {batchStatus.etaSeconds ? `~${Math.floor(batchStatus.etaSeconds / 60)}m ${batchStatus.etaSeconds % 60}s` : "Calculating..."}
            </span>
          </div>

          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
              color: "#ffffff",
              padding: "4px 10px",
              borderRadius: "8px",
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>Live HUD</span>
            <span>⚡</span>
          </div>
        </div>
      )}
    </div>
  );
}
