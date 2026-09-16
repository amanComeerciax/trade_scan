"use client";

import { useEffect, useRef, useState } from "react";
import { resolveCommodity } from "@/lib/aiParser";
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
  Moon,
  Bell,
  Radio,
  FileSpreadsheet,
  FileText,
  Zap,
  ArrowRight,
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
  AlertCircle,
  Pause,
  Square,
} from "lucide-react";

interface FloatingScrapeState {
  active: boolean;
  phase?: 1 | 2;
  status: "running" | "completed" | "failed";
  target: string;
  volume: number;
  message: string;
  records: number;
  marketTotal?: number;
  canEnrich?: boolean;
}

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
  unenrichedCount?: number;
  countriesList: { country: string; count: number }[];
}

export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsData>({
    totalCompanies: 0,
    totalProducts: 0,
    totalCountries: 0,
    unenrichedCount: 0,
    countriesList: [],
  });

  // Filters
  const [search, setSearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedTradeType, setSelectedTradeType] = useState("");

  // Modals & Panels
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isScraperModalOpen, setIsScraperModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("Find top cotton fabric exporters in India");
  const [aiResultText, setAiResultText] = useState("");
  const [isAIRunning, setIsAIRunning] = useState(false);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scraper Controller State (Phase 1 & Phase 2)
  const [scrapeCountry, setScrapeCountry] = useState("India");
  const [scrapeHsCode, setScrapeHsCode] = useState("Spices");
  const [scrapeTradeFlow, setScrapeTradeFlow] = useState<"exports" | "imports">("exports");
  const [scrapeLimit, setScrapeLimit] = useState<number>(20);
  const [isScraping, setIsScraping] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [phase1CompletedCount, setPhase1CompletedCount] = useState<number | null>(null);
  const [scrapeLogs, setScrapeLogs] = useState<string>("");
  const [floatingProgress, setFloatingProgress] = useState<FloatingScrapeState | null>(null);
  const enrichPollRef = useRef<NodeJS.Timeout | null>(null);

  // Continuous Auto-Pilot State (Sir's Requirement: "scraper rukna nahi chahiye")
  const [isAutoPilotActive, setIsAutoPilotActive] = useState(false);
  const [autoPilotStatus, setAutoPilotStatus] = useState("");
  const [autoPilotCycleIndex, setAutoPilotCycleIndex] = useState(0);
  const [autoPilotTarget, setAutoPilotTarget] = useState<{
    country: string;
    category: string;
    hsCode: string;
    cycleNum: number;
  } | null>(null);

  // Selection & Deletion State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dark Mode Theme State
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("tradescan_theme") as "light" | "dark" | null;
    const initialTheme =
      saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("tradescan_theme", next);
  };

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
      const query = new URLSearchParams({
        page: pageNum.toString(),
        limit: "10",
        search,
        country: selectedCountry,
        tradeType: selectedTradeType,
      });

      const res = await fetch(`/api/companies?${query.toString()}`);
      const data = await res.json();
      if (data.companies) {
        setCompanies(data.companies);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        if (data.countries) setAvailableCountries(data.countries);
      }
    } catch (err) {
      console.error("Error loading companies:", err);
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

  // Load initial data and react to filter changes
  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        const query = new URLSearchParams({
          page: "1",
          limit: "10",
          search,
          country: selectedCountry,
          tradeType: selectedTradeType,
        });

        const [compRes, statsRes] = await Promise.all([
          fetch(`/api/companies?${query.toString()}`),
          fetch("/api/scrape"),
        ]);

        const [compData, statsData] = await Promise.all([
          compRes.json(),
          statsRes.json(),
        ]);

        if (!ignore) {
          if (compData.companies) {
            setCompanies(compData.companies);
            setTotal(compData.total);
            setTotalPages(compData.totalPages);
            if (compData.countries) setAvailableCountries(compData.countries);
          }
          if (statsData.stats) {
            setStats(statsData.stats);
          }
        }
      } catch (err) {
        console.error("Error loading data:", err);
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [search, selectedCountry, selectedTradeType]);

  // Persistent live progress watcher: Reconnects floating progress bar on mount or when scraping/enriching
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const syncActiveJob = async () => {
      try {
        const res = await fetch("/api/scrape?lite=true");
        const data = await res.json();
        const activeJob = data.recentJobs?.find((j: any) => j.status === "RUNNING");

        if (activeJob) {
          const isPhase2 = activeJob.source?.includes("Phase 2") || activeJob.target?.includes("Phase 2");
          const lastLog = activeJob.logs?.split("\n").filter(Boolean).pop() || "Extraction engine running...";

          setFloatingProgress((prev) => ({
            active: true,
            phase: isPhase2 ? 2 : 1,
            status: "running",
            target: activeJob.target || prev?.target || "TradeMap Engine",
            volume: prev?.volume || 1000,
            message: lastLog,
            records: activeJob.recordsFound || 0,
            marketTotal: prev?.marketTotal,
          }));
        } else {
          // No job is running: Stop polling immediately!
          if (interval) {
            clearInterval(interval);
            interval = null;
          }

          setFloatingProgress((prev) => {
            if (prev && prev.status === "running") {
              const latestJob = data.recentJobs?.[0];
              if (latestJob?.status === "COMPLETED") {
                if (prev.phase === 1) {
                  setPhase1CompletedCount(latestJob.recordsFound || prev.records);
                }
                fetchData(1);
                fetchStats();
                return {
                  ...prev,
                  status: "completed",
                  message: prev.phase === 2
                    ? `✓ Phase 2 Complete! Enriched ${latestJob.recordsFound || prev.records} contact profiles.`
                    : `✓ Phase 1 Complete! Saved ${latestJob.recordsFound || prev.records} profiles into database. Ready for Phase 2.`,
                  records: latestJob.recordsFound || prev.records,
                  canEnrich: true,
                };
              } else if (latestJob?.status === "CANCELLED" || latestJob?.status === "FAILED") {
                setIsScraping(false);
                setIsEnriching(false);
                return null;
              }
            }
            return prev;
          });
        }
      } catch {}
    };

    // Only start polling if scraping or enriching is actively in progress
    if (isScraping || isEnriching) {
      interval = setInterval(syncActiveJob, 2500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScraping, isEnriching]);

  // Handle Phase 1: Directory Scraping (Company Names, Cities & Websites)
  const handleTriggerScrape = async () => {
    // 1. Immediately close the modal popup so user sees dashboard and table
    setIsScraperModalOpen(false);
    setIsScraping(true);
    setPhase1CompletedCount(null);

    const initialLog = `[${new Date().toLocaleTimeString()}] Phase 1: Calling TradeMap extraction engine (Batch volume: ${scrapeLimit} profiles across auto-pagination)...\nTarget: ${scrapeCountry} | HS: ${scrapeHsCode} | Flow: ${scrapeTradeFlow}`;
    setScrapeLogs(initialLog);

    // 2. Open side/corner floating live progress card
    setFloatingProgress({
      active: true,
      phase: 1,
      status: "running",
      target: `${scrapeCountry} • ${scrapeHsCode} (${scrapeTradeFlow === "exports" ? "Exporters" : "Importers"})`,
      volume: scrapeLimit,
      message: `Phase 1: Connecting to TradeMap live API (Target: ${scrapeLimit} profiles)...`,
      records: 0,
    });

    // 3. Poll latest live logs while extraction proceeds
    const pollTimer = setInterval(async () => {
      try {
        const sRes = await fetch("/api/scrape?lite=true");
        const sData = await sRes.json();
        if (sData.recentJobs && sData.recentJobs[0]) {
          const currentJob = sData.recentJobs[0];
          const lastLog = currentJob.logs?.split("\n").filter(Boolean).pop() || "";
          setFloatingProgress((prev) =>
            prev && prev.status === "running" && prev.phase === 1
              ? {
                  ...prev,
                  message: lastLog || prev.message,
                  records: currentJob.recordsFound || prev.records,
                }
              : prev
          );
        }
      } catch {}
    }, 2000);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: scrapeCountry,
          hsCode: scrapeHsCode,
          tradeFlow: scrapeTradeFlow,
          limit: scrapeLimit,
          engine: "playwright",
        }),
      });

      const json = await res.json();
      clearInterval(pollTimer);

      if (json.success) {
        const recordsFound = json.data?.recordsFound ?? 0;
        const marketTotal = json.data?.marketTotal ?? 0;
        setPhase1CompletedCount(recordsFound);

        const successMsg = marketTotal > 0
          ? `✓ Phase 1 Complete! Extracted ${recordsFound} profiles (out of ${marketTotal.toLocaleString()} in TradeMap). Ready for Phase 2 contact enrichment.`
          : (json.data?.message || `✓ Phase 1 Complete! Saved ${recordsFound} verified trade profiles into database.`);

        setScrapeLogs((prev) => `${prev}\n\n${successMsg}`);
        setFloatingProgress({
          active: true,
          phase: 1,
          status: "completed",
          target: `${scrapeCountry} • ${scrapeHsCode}`,
          volume: scrapeLimit,
          message: successMsg,
          records: recordsFound,
          marketTotal: marketTotal > 0 ? marketTotal : undefined,
          canEnrich: recordsFound > 0,
        });
        fetchData(1);
        fetchStats();
      } else {
        setScrapeLogs((prev) => `${prev}\n\n✗ FAILED: ${json.error}`);
        setFloatingProgress({
          active: true,
          phase: 1,
          status: "failed",
          target: `${scrapeCountry} • ${scrapeHsCode}`,
          volume: scrapeLimit,
          message: `✗ Error: ${json.error || "Scraping failed"}`,
          records: 0,
        });
      }
    } catch (err: unknown) {
      clearInterval(pollTimer);
      const message = err instanceof Error ? err.message : "Network error";
      setScrapeLogs((prev) => `${prev}\n\n✗ Network Error: ${message}`);
      setFloatingProgress({
        active: true,
        phase: 1,
        status: "failed",
        target: `${scrapeCountry} • ${scrapeHsCode}`,
        volume: scrapeLimit,
        message: `✗ Network Error: ${message}`,
        records: 0,
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleStopEnrich = async () => {
    try {
      await fetch("/api/scrape/cancel", { method: "POST" });
    } catch {}
    setIsEnriching(false);
    if (enrichPollRef.current) {
      clearInterval(enrichPollRef.current);
      enrichPollRef.current = null;
    }
    setFloatingProgress(null);
  };

  // Handle Phase 2: Contact Enrichment (Director/MD Names, Roles & Direct Phones)
  const handleTriggerEnrich = async (targetCountry?: string) => {
    setIsEnriching(true);
    const country = targetCountry || scrapeCountry;
    const targetEnrichCount = stats.unenrichedCount || phase1CompletedCount || total || 1000;

    setFloatingProgress({
      active: true,
      phase: 2,
      status: "running",
      target: `Phase 2: Contact Enrichment`,
      volume: targetEnrichCount,
      message: `⚡ Connecting to TradeMap Contact API for ${targetEnrichCount} companies...`,
      records: 0,
    });

    if (enrichPollRef.current) clearInterval(enrichPollRef.current);
    enrichPollRef.current = setInterval(async () => {
      try {
        const sRes = await fetch("/api/scrape?lite=true");
        const sData = await sRes.json();
        if (sData.recentJobs && sData.recentJobs[0]) {
          const currentJob = sData.recentJobs[0];
          const lastLog = currentJob.logs?.split("\n").filter(Boolean).pop() || "";
          setFloatingProgress((prev) =>
            prev && prev.status === "running" && prev.phase === 2
              ? {
                  ...prev,
                  message: lastLog || prev.message,
                  records: currentJob.recordsFound || prev.records,
                }
              : prev
          );
        }
      } catch {}
    }, 2000);

    try {
      const res = await fetch("/api/scrape/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: targetEnrichCount,
        }),
      });

      const json = await res.json();
      if (enrichPollRef.current) clearInterval(enrichPollRef.current);

      if (json.success) {
        const enriched = json.data?.enrichedCount ?? 0;
        const totalAttempted = json.data?.totalAttempted ?? 0;
        const successMsg = `✓ Phase 2 Complete! Enriched ${enriched} of ${totalAttempted} companies with Director Names & Direct Phones.`;

        setFloatingProgress({
          active: true,
          phase: 2,
          status: "completed",
          target: `Phase 2: Contact Enrichment Complete`,
          volume: totalAttempted,
          message: successMsg,
          records: enriched,
        });

        fetchData(1);
        fetchStats();
      } else {
        setFloatingProgress({
          active: true,
          phase: 2,
          status: "failed",
          target: `Phase 2: ${country} Contact Enrichment`,
          volume: 0,
          message: `✗ Phase 2 Error: ${json.error || "Enrichment failed"}`,
          records: 0,
        });
      }
    } catch (err: unknown) {
      if (enrichPollRef.current) clearInterval(enrichPollRef.current);
      const message = err instanceof Error ? err.message : "Network error";
      setFloatingProgress({
        active: true,
        phase: 2,
        status: "failed",
        target: `Phase 2: ${country} Contact Enrichment`,
        volume: 0,
        message: `✗ Phase 2 Network Error: ${message}`,
        records: 0,
      });
    } finally {
      setIsEnriching(false);
    }
  };

  // Continuous Auto-Pilot Scraping Loop (Sir's Requirement: Non-Stop 24/7 Scraping)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (isAutoPilotActive) {
      const CONTINUOUS_TARGETS = [
        { country: "India", hsCode: "0901", category: "Coffee, Tea & Spices" },
        { country: "Vietnam", hsCode: "1006", category: "Rice & Grains" },
        { country: "Germany", hsCode: "7208", category: "Flat-rolled Iron & Steel" },
        { country: "United States", hsCode: "8471", category: "Computers & Electronics" },
        { country: "United Arab Emirates", hsCode: "7113", category: "Jewellery & Gold" },
        { country: "India", hsCode: "5208", category: "Woven Cotton Fabrics" },
        { country: "China", hsCode: "8517", category: "Smartphones & Telephones" },
        { country: "Brazil", hsCode: "1701", category: "Cane & Beet Sugar" },
        { country: "Singapore", hsCode: "2710", category: "Petroleum Fuels & Oils" },
        { country: "United Kingdom", hsCode: "3004", category: "Pharmaceutical Medicaments" },
        { country: "Germany", hsCode: "8703", category: "Motor Cars & Vehicles" },
        { country: "India", hsCode: "6403", category: "Footwear & Leather Goods" },
      ];

      const executeCycle = async () => {
        try {
          const curr = CONTINUOUS_TARGETS[autoPilotCycleIndex % 12];
          const cycleNum = (autoPilotCycleIndex % 12) + 1;

          setAutoPilotTarget({
            country: curr.country,
            category: curr.category,
            hsCode: curr.hsCode,
            cycleNum,
          });

          setAutoPilotStatus(`Extracting ${curr.country} • ${curr.category} (HS ${curr.hsCode})...`);

          setFloatingProgress({
            active: true,
            status: "running",
            target: `${curr.country} • ${curr.category}`,
            volume: 20,
            message: `[Auto-Pilot Target #${cycleNum}/12] Calling TradeMap for ${curr.country} (${curr.category} - HS ${curr.hsCode})...`,
            records: 0,
          });

          const res = await fetch("/api/scrape/continuous", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cycleIndex: autoPilotCycleIndex, limit: 20 }),
          });
          const json = await res.json();
          if (json.success) {
            setAutoPilotStatus(
              `✓ Saved ${json.stats.recordsSaved} profiles from ${json.executedTarget.country} (${json.executedTarget.category}). Next up: ${json.nextTarget.country}`
            );
            setFloatingProgress({
              active: true,
              status: "completed",
              target: `${json.executedTarget.country} • ${json.executedTarget.category}`,
              volume: 20,
              message: `✓ Saved ${json.stats.recordsSaved} profiles from ${json.executedTarget.country}. Next: ${json.nextTarget.country} (${json.nextTarget.category})`,
              records: json.stats.recordsSaved,
            });
            setAutoPilotCycleIndex((prev) => prev + 1);
            fetchData(1);
            fetchStats();
          } else {
            setAutoPilotStatus(`Cycle paused: ${json.error || "Retrying in 18s..."}`);
          }
        } catch {
          setAutoPilotStatus("Connecting to TradeMap live stream...");
        }
      };

      executeCycle();
      timer = setInterval(executeCycle, 18000);
    } else {
      setAutoPilotStatus("");
      setAutoPilotTarget(null);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAutoPilotActive, autoPilotCycleIndex]);

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
  const handleExport = (format: "xlsx" | "csv") => {
    const query = new URLSearchParams({
      format,
      search,
      country: selectedCountry,
      tradeType: selectedTradeType,
    });
    const downloadUrl = `/api/export?${query.toString()}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", `trade_exporters.${format}`);
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

        {/* User Workspace Dropdown */}
        <div className="user-selector-btn">
          <div className="user-selector-left">
            <Globe size={16} style={{ color: "var(--text-primary)" }} />
            <span>Global Trade Hub</span>
          </div>
          <ChevronDown size={14} style={{ color: "#94a3b8" }} />
        </div>

        {/* Navigation Sections */}
        <div className="nav-section">
          <div className="nav-section-title">Build</div>
          <a
            href="#scraper"
            onClick={(e) => {
              e.preventDefault();
              setIsScraperModalOpen(true);
            }}
            className="nav-item"
          >
            <Compass size={16} />
            <span>Scraper Engine</span>
          </a>
          <a
            href="#live-extract"
            onClick={(e) => {
              e.preventDefault();
              setIsScraperModalOpen(true);
            }}
            className="nav-item"
          >
            <Send size={16} />
            <span>Live Extraction</span>
          </a>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Optimize</div>
          <div className="nav-item">
            <BarChart3 size={16} />
            <span>HS Code Mapping</span>
          </div>
          <div className="nav-item">
            <SlidersHorizontal size={16} />
            <span>Country Analytics</span>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Review</div>
          <div className="nav-item active">
            <Building2 size={16} />
            <span>Exporters Directory</span>
          </div>
          <div className="nav-item">
            <GitBranch size={16} />
            <span>Trade Flows</span>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="nav-item" style={{ padding: "4px 8px" }}>
            <Settings size={16} />
            <span>Settings</span>
          </div>
          <div className="nav-item" style={{ padding: "4px 8px" }}>
            <HelpCircle size={16} />
            <span>Help & Support</span>
          </div>

          {/* Quota Progress Card */}
          <div className="quota-card">
            {(() => {
              const targetGoal = floatingProgress?.volume || (total > 500 ? 1000 : 500);
              const currentCount = floatingProgress?.records || total;
              const percent = Math.min(100, Math.round((currentCount / targetGoal) * 100));
              return (
                <>
                  <div className="quota-header">
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Clock size={15} /> Records Scraped
                    </span>
                    <span>{percent}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${Math.max(5, percent)}%` }}
                    />
                  </div>
                  <div className="quota-labels">
                    <span>{currentCount}</span>
                    <span>{targetGoal} Target</span>
                  </div>
                </>
              );
            })()}
            <button
              onClick={() => setIsScraperModalOpen(true)}
              className="upgrade-btn"
            >
              Run New Scrape
            </button>
            <button
              onClick={toggleTheme}
              className="upgrade-btn"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "6px",
              }}
              title="Toggle theme appearance"
            >
              {theme === "light" ? (
                <>
                  <Moon size={14} /> Dark Mode
                </>
              ) : (
                <>
                  <Sun size={14} style={{ color: "#f59e0b" }} /> Light Mode
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="main-wrapper">
        {/* Top Header */}
        <div className="top-header">
          <h1 className="page-title">Exporters Directory</h1>
          <div className="top-header-right">
            <button
              onClick={toggleTheme}
              className="icon-btn theme-toggle-btn"
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              aria-label="Toggle dark mode"
            >
              {theme === "light" ? (
                <Moon size={16} />
              ) : (
                <Sun size={16} style={{ color: "#f59e0b" }} />
              )}
            </button>
            <button className="icon-btn" title="Notifications">
              <Bell size={16} />
            </button>
            <div className="user-avatar" title="Account profile">
              TS
            </div>
          </div>
        </div>

        {/* Sub-header Bar */}
        <div className="sub-header-bar">
          <div
            className="ask-pill"
            onClick={() => setIsAIModalOpen(true)}
            style={{ cursor: "pointer" }}
            title="Open Natural Language Trade Intelligence (Ctrl+K)"
          >
            <Command size={13} style={{ color: "var(--text-primary)" }} />
            <span>Search Trade Intelligence</span>
            <span className="kbd-shortcut">Ctrl+K</span>
          </div>
          <div className="events-indicator">
            <Radio size={14} style={{ color: "#16a34a" }} />
            <span>((•)) TradeMap Engine Live</span>
          </div>
        </div>

        {/* 5 Metric Cards in a Row (Reflects REAL Trade Data) */}
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-left">
              <span className="metric-title">Total Exporters</span>
              <div className="metric-value-row">
                <span className="metric-val">{stats.totalCompanies}</span>
                <span className="metric-change">↑ +24.3%</span>
              </div>
              <span className="metric-sub">Verified profiles</span>
            </div>
            <div className="metric-circle-icon">
              <Building2 size={16} />
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-left">
              <span className="metric-title">Countries Covered</span>
              <div className="metric-value-row">
                <span className="metric-val">{stats.totalCountries}</span>
                <span className="metric-change">↑ +67.2%</span>
              </div>
              <span className="metric-sub">Global markets</span>
            </div>
            <div className="metric-circle-icon">
              <Globe size={16} />
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-left">
              <span className="metric-title">Commodities / HS</span>
              <div className="metric-value-row">
                <span className="metric-val">{stats.totalProducts}</span>
                <span className="metric-change">↑ +18.5%</span>
              </div>
              <span className="metric-sub">Classified sectors</span>
            </div>
            <div className="metric-circle-icon">
              <Package size={16} />
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-left">
              <span className="metric-title">Scraper Status</span>
              <div className="metric-value-row">
                <span className="metric-val" style={{ color: "#16a34a", fontSize: "18px" }}>
                  100% Active
                </span>
              </div>
              <span className="metric-sub">Direct API connected</span>
            </div>
            <div className="metric-circle-icon">
              <CheckCircle size={16} />
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-left">
              <span className="metric-title">Verified Websites</span>
              <div className="metric-value-row">
                <span className="metric-val">{stats.totalCompanies}</span>
                <span className="metric-change">↑ +37.5%</span>
              </div>
              <span className="metric-sub">Online company links</span>
            </div>
            <div className="metric-circle-icon">
              <CheckCircle2 size={16} />
            </div>
          </div>
        </div>

        {/* Auto-Pilot Status Ribbon (Sir's Non-Stop Requirement) */}
        {isAutoPilotActive && (
          <div
            className="autopilot-ribbon"
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              background: "var(--bg-card)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="pulse-dot live" style={{ width: "10px", height: "10px" }} />
                <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>Auto-Pilot Active:</strong>
              </div>

              {autoPilotTarget ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "rgba(16, 185, 129, 0.12)",
                    padding: "5px 12px",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ color: "#10b981", fontWeight: 700 }}>#{autoPilotTarget.cycleNum}/12</span>
                  <strong style={{ color: "var(--text-primary)" }}>{autoPilotTarget.country}</strong>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{autoPilotTarget.category}</span>
                  <span style={{ fontSize: "11px", opacity: 0.8, fontFamily: "monospace" }}>[HS {autoPilotTarget.hsCode}]</span>
                </div>
              ) : null}

              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {autoPilotStatus || "Connecting to TradeMap live stream..."}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsAutoPilotActive(false);
                setAutoPilotStatus("");
                setAutoPilotTarget(null);
              }}
              style={{
                background: "#ef4444",
                border: "none",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "12px",
                padding: "6px 14px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Pause size={13} />
              Stop Auto-Pilot
            </button>
          </div>
        )}

        {/* 3. Main Data Table Card */}
        <div className="table-card">
          {/* Card Toolbar */}
          <div className="card-toolbar">
            <div className="search-input-wrapper">
              <Search size={15} className="search-icon-inside" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, country, HS code..."
                className="card-search-input"
              />
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
                onClick={() => setIsAutoPilotActive(!isAutoPilotActive)}
                className={`autopilot-toggle-btn ${isAutoPilotActive ? "active" : ""}`}
                title="Toggle 24/7 continuous autonomous scraping loop"
              >
                <span className={`pulse-dot ${isAutoPilotActive ? "live" : ""}`} />
                <span>{isAutoPilotActive ? "Auto-Pilot: ON" : "Auto-Pilot: OFF"}</span>
              </button>

              <button
                onClick={() => setIsScraperModalOpen(true)}
                className="action-btn primary"
                title="Run Phase 1 Directory Scraper"
              >
                <Play size={13} fill="currentColor" />
                <span>Run Scraper (Phase 1)</span>
              </button>

              {((stats.unenrichedCount && stats.unenrichedCount > 0) || (phase1CompletedCount && phase1CompletedCount > 0)) ? (
                <button
                  onClick={() => isEnriching ? handleStopEnrich() : handleTriggerEnrich()}
                  disabled={isScraping}
                  className="action-btn"
                  style={{
                    background: isEnriching ? "#dc2626" : "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                    color: "#fff",
                    border: "none",
                    boxShadow: isEnriching ? "0 2px 8px rgba(220, 38, 38, 0.35)" : "0 2px 8px rgba(99, 102, 241, 0.35)",
                    fontWeight: 600,
                  }}
                  title={isEnriching ? "Stop Phase 2 Enrichment" : "Enrich pending contact details (Director / MD names & direct phones)"}
                >
                  {isEnriching ? (
                    <>
                      <Square size={13} fill="currentColor" />
                      <span>Stop Phase 2</span>
                    </>
                  ) : (
                    <>
                      <Zap size={13} fill="currentColor" />
                      <span>Phase 2: Enrich Contacts {stats.unenrichedCount ? `(${stats.unenrichedCount})` : ""}</span>
                    </>
                  )}
                </button>
              ) : null}

              <button
                onClick={() => handleExport("xlsx")}
                className="action-btn"
                title="Export Excel (.xlsx)"
              >
                <FileSpreadsheet size={14} style={{ color: "#16a34a" }} />
                <span>Export Excel</span>
              </button>

              <button
                onClick={() => handleExport("csv")}
                className="action-btn"
                title="Export CSV"
              >
                <Download size={14} />
                <span>CSV</span>
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
                <th style={{ width: "20%" }}>Company Name ↕</th>
                <th style={{ width: "10%" }}>Country ↕</th>
                <th style={{ width: "10%" }}>Trade Type ↕</th>
                <th style={{ width: "9%" }}>HS Code ↕</th>
                <th style={{ width: "17%" }}>Product Category / Sector ↕</th>
                <th style={{ width: "17%" }}>Key Contact & Phone ↕</th>
                <th style={{ width: "8%" }}>Scraped Date ↕</th>
                <th style={{ width: "6%", textAlign: "right" }}>Actions ↕</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "48px 0" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
                      <Layers size={32} style={{ opacity: 0.4 }} />
                      <p style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>No companies found</p>
                      <p style={{ fontSize: "12px" }}>Click &quot;Run Scraper (Phase 1)&quot; above to fetch fresh trade records from TradeMap.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  const primaryProduct = company.products[0];
                  const { time, date } = formatDateTime(company.createdAt);
                  const isExporter = primaryProduct?.tradeType !== "Importer";
                  const isSelected = selectedIds.includes(company.id);

                  return (
                    <tr key={company.id} style={{ background: isSelected ? "var(--bg-active)" : undefined }}>
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
                          <Building2 size={15} className="type-icon" style={{ color: "var(--text-secondary)" }} />
                          <span style={{ fontWeight: 600 }}>{company.name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--text-light)", fontWeight: 500 }}>
                          <MapPin size={13} style={{ color: "#94a3b8" }} />
                          {company.country || "Global"}
                        </span>
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
                        {primaryProduct?.hsCode ? (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "11px",
                              fontWeight: 600,
                              background: "var(--bg-hover)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              color: "var(--text-primary)",
                              border: "1px solid var(--border-light)",
                            }}
                          >
                            HS {primaryProduct.hsCode}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "var(--text-primary)", fontSize: "12px", maxWidth: "200px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {primaryProduct?.productCategory || "General Merchandise"}
                        </div>
                      </td>
                      <td style={{ maxWidth: "220px" }}>
                        {company.contactName || company.phone ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            {company.contactName && (
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {company.contactName} {company.contactRole && <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 400 }}>({company.contactRole})</span>}
                              </span>
                            )}
                            {company.phone ? (
                              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                                📞 {company.phone}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#eab308", display: "inline-block" }} />
                            Pending Phase 2
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{time}</span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{date}</span>
                        </div>
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
                          ) : (
                            <button
                              onClick={() => copyToClipboard(company.name, company.id)}
                              className="mini-icon-btn"
                              title="Copy company name"
                            >
                              {copiedId === company.id ? <Check size={14} style={{ color: "#16a34a" }} /> : <Copy size={14} />}
                            </button>
                          )}
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
                  className="ai-suggestion-pill"
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
              className="scraper-modal-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Header */}
              <div className="scraper-modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <TradeScanMark size={40} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h3 className="scraper-modal-title">
                        TradeMap Live Scraper
                      </h3>
                      <span className="scraper-api-badge">
                        Direct API
                      </span>
                    </div>
                    <p className="scraper-modal-subtitle">
                      Extract verified exporter directories with director names & phone contacts
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsScraperModalOpen(false)}
                  className="scraper-modal-close-btn"
                  title="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Two Column Layout */}
              <div className="scraper-modal-layout">
                {/* Left Column: Feature Highlights & Brand Globe */}
                <div className="scraper-sidebar-col">
                  <div className="scraper-features-list">
                    <div className="scraper-feature-item">
                      <div className="scraper-feature-tile">
                        <ShieldCheck size={17} />
                      </div>
                      <div>
                        <div className="scraper-feature-name">Verified Data</div>
                        <div className="scraper-feature-desc">Official & up-to-date exporter information</div>
                      </div>
                    </div>

                    <div className="scraper-feature-item">
                      <div className="scraper-feature-tile">
                        <Zap size={16} />
                      </div>
                      <div>
                        <div className="scraper-feature-name">Direct API</div>
                        <div className="scraper-feature-desc">Real-time & reliable results</div>
                      </div>
                    </div>

                    <div className="scraper-feature-item">
                      <div className="scraper-feature-tile">
                        <Globe size={16} />
                      </div>
                      <div>
                        <div className="scraper-feature-name">Global Coverage</div>
                        <div className="scraper-feature-desc">200+ countries supported</div>
                      </div>
                    </div>

                    <div className="scraper-feature-item">
                      <div className="scraper-feature-tile">
                        <FileText size={16} />
                      </div>
                      <div>
                        <div className="scraper-feature-name">Trade Ready</div>
                        <div className="scraper-feature-desc">Get HS codes, company details & direct contacts</div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Globe Visual */}
                  <div className="scraper-brand-widget">
                    <div style={{ position: "relative", width: "100%", height: "100px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
                      <svg width="200" height="110" viewBox="0 0 200 110" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <radialGradient id="globeGlowModal2" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                            <stop offset="60%" stopColor="#1d4ed8" stopOpacity="0.08" />
                            <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0" />
                          </radialGradient>
                          <linearGradient id="globeArcModal2" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.12" />
                          </linearGradient>
                        </defs>
                        <circle cx="95" cy="88" r="68" fill="url(#globeGlowModal2)" />
                        <circle cx="95" cy="88" r="65" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="2 3" strokeOpacity="0.35" />
                        <ellipse cx="95" cy="88" rx="63" ry="24" stroke="url(#globeArcModal2)" strokeWidth="0.8" strokeOpacity="0.6" />
                        <ellipse cx="95" cy="68" rx="52" ry="17" stroke="url(#globeArcModal2)" strokeWidth="0.7" strokeOpacity="0.45" />
                        <ellipse cx="95" cy="88" rx="26" ry="63" stroke="url(#globeArcModal2)" strokeWidth="0.8" strokeOpacity="0.5" />
                        <ellipse cx="95" cy="88" rx="48" ry="63" stroke="url(#globeArcModal2)" strokeWidth="0.7" strokeOpacity="0.35" />
                        <line x1="95" y1="24" x2="95" y2="152" stroke="url(#globeArcModal2)" strokeWidth="0.8" strokeOpacity="0.5" />
                        <circle cx="95" cy="68" r="2.5" fill="#38bdf8" />
                        <circle cx="120" cy="88" r="2" fill="#60a5fa" />
                        <circle cx="70" cy="88" r="2" fill="#60a5fa" />
                        <circle cx="95" cy="88" r="3" fill="#38bdf8" />
                        <circle cx="95" cy="88" r="1.5" fill="#ffffff" />
                      </svg>
                    </div>
                    <div style={{ width: "24px", height: "3px", background: "#2563eb", borderRadius: "2px", marginBottom: "8px", marginTop: "8px" }} />
                    <div className="scraper-brand-title">
                      Global Trade Data<br />Made Simple.
                    </div>
                  </div>
                </div>

                {/* Right Column: 3-Step Form & Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {/* Step 1: Target Country */}
                  <div>
                    <div className="step-header" style={{ marginBottom: "8px" }}>
                      <div className="step-title-group">
                        <span className="scraper-step-badge">1</span>
                        <span className="scraper-step-label">Target Country / Market</span>
                      </div>
                      <span className="scraper-step-sub">
                        Select the country to find exporters
                      </span>
                    </div>
                    <div className="input-with-icon-wrapper">
                      <Globe size={15} className="input-icon-left" style={{ color: "var(--text-muted)" }} />
                      <select
                        value={scrapeCountry}
                        onChange={(e) => setScrapeCountry(e.target.value)}
                        className="scraper-select-input"
                      >
                        <option value="India">🇮🇳 India (Top Global Exporter Hub)</option>
                        <option value="Germany">🇩🇪 Germany (European Commerce)</option>
                        <option value="Vietnam">🇻🇳 Vietnam (Southeast Asia)</option>
                        <option value="United States">🇺🇸 USA (North America)</option>
                        <option value="United Arab Emirates">🇦🇪 UAE (Middle East Hub)</option>
                        <option value="China">🇨🇳 China (East Asia)</option>
                        <option value="United Kingdom">🇬🇧 United Kingdom (UK)</option>
                        <option value="Brazil">🇧🇷 Brazil (South America)</option>
                        <option value="Singapore">🇸🇬 Singapore (Global Trading Hub)</option>
                        <option value="France">🇫🇷 France</option>
                        <option value="Italy">🇮🇹 Italy</option>
                        <option value="Japan">🇯🇵 Japan</option>
                        <option value="Canada">🇨🇦 Canada</option>
                        <option value="Australia">🇦🇺 Australia</option>
                        <option value="Turkey">🇹🇷 Turkey</option>
                        <option value="Indonesia">🇮🇩 Indonesia</option>
                        <option value="Malaysia">🇲🇾 Malaysia</option>
                        <option value="South Korea">🇰🇷 South Korea</option>
                        <option value="Thailand">🇹🇭 Thailand</option>
                        <option value="Spain">🇪🇸 Spain</option>
                        <option value="Netherlands">🇳🇱 Netherlands</option>
                        <option value="Saudi Arabia">🇸🇦 Saudi Arabia</option>
                      </select>
                    </div>
                  </div>

                  {/* Step 2: Goods / Commodity */}
                  <div>
                    <div className="step-header" style={{ marginBottom: "8px" }}>
                      <div className="step-title-group">
                        <span className="scraper-step-badge">2</span>
                        <span className="scraper-step-label">Goods / Commodity</span>
                      </div>
                      <span className="scraper-step-sub">
                        Select product category (HS Code)
                      </span>
                    </div>
                    <div className="input-with-icon-wrapper">
                      <Package size={15} className="input-icon-left" style={{ color: "var(--text-muted)" }} />
                      <select
                        value={scrapeHsCode}
                        onChange={(e) => setScrapeHsCode(e.target.value)}
                        className="scraper-select-input"
                      >
                        <option value="Spices">🌶️ Spices & Aromatics (HS 0901)</option>
                        <option value="Rice">🌾 Rice & Grain Products (HS 1006)</option>
                        <option value="Tea">🫖 Tea whether or not flavored (HS 0902)</option>
                        <option value="Coffee">☕ Coffee & Maté (HS 0901)</option>
                        <option value="Cotton">👕 Woven Fabrics of Cotton (HS 5208)</option>
                        <option value="Yarn">🧵 Cotton Yarn & Thread (HS 5205)</option>
                        <option value="Apparel">👔 Garments & Apparel (HS 6203)</option>
                        <option value="Tshirt">🎽 T-Shirts & Knitted Wear (HS 6109)</option>
                        <option value="Leather">👞 Leather & Finished Hides (HS 4107)</option>
                        <option value="Footwear">👠 Footwear & Shoes (HS 6403)</option>
                        <option value="Pharma">💊 Pharmaceuticals & Medicaments (HS 3004)</option>
                        <option value="Chemical">🧪 Organic & Industrial Chemicals (HS 2905)</option>
                        <option value="Wheat">🌾 Wheat & Meslin (HS 1001)</option>
                        <option value="Sugar">🍬 Cane or Beet Sugar (HS 1701)</option>
                        <option value="Jewellery">💎 Articles of Jewellery & Parts (HS 7113)</option>
                        <option value="Gold">✨ Gold & Bullion (HS 7108)</option>
                        <option value="Diamond">💠 Diamonds, worked or unworked (HS 7102)</option>
                        <option value="Steel">🏗️ Flat-rolled Iron & Steel (HS 7208)</option>
                        <option value="Aluminium">🔩 Unwrought Aluminium (HS 7601)</option>
                        <option value="Copper">🥉 Refined Copper & Alloys (HS 7403)</option>
                        <option value="Electronics">🔌 Electronic Integrated Circuits (HS 8542)</option>
                        <option value="Mobile">📱 Smartphones & Telephones (HS 8517)</option>
                        <option value="Computer">💻 Computers & Processing Units (HS 8471)</option>
                        <option value="Ceramic">🧱 Ceramic Tiles & Paving (HS 6907)</option>
                        <option value="Plastic">🧴 Polymers of Ethylene & Plastics (HS 3901)</option>
                        <option value="Oil">🛢️ Petroleum Fuels & Oils (HS 2710)</option>
                        <option value="Dairy">🥛 Milk & Dairy Products (HS 0401)</option>
                        <option value="Meat">🥩 Meat of Bovine Animals (HS 0201)</option>
                        <option value="">🌐 All Commodities (No Sector Filter)</option>
                      </select>
                    </div>

                    {/* Auto-detected HS Code Bar */}
                    <div className="scraper-detected-bar">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div className="scraper-feature-tile" style={{ width: "20px", height: "20px", borderRadius: "50%", padding: 0 }}>
                          <Check size={11} strokeWidth={2.5} />
                        </div>
                        <span className="scraper-detected-text">
                          <strong>HS {currentCommodityInfo.hsCode || "0901"}</strong> • {currentCommodityInfo.category || "Spices and aromatics"}
                        </span>
                      </div>
                      <span className="scraper-detected-tag">
                        Auto-detected
                      </span>
                    </div>
                  </div>

                  {/* Step 3: Trade Flow */}
                  <div>
                    <div className="step-header" style={{ marginBottom: "8px" }}>
                      <div className="step-title-group">
                        <span className="scraper-step-badge">3</span>
                        <span className="scraper-step-label">Trade Flow</span>
                      </div>
                      <span className="scraper-step-sub">
                        Choose the type of directory
                      </span>
                    </div>
                    <div className="input-with-icon-wrapper">
                      <ArrowUpRight size={15} className="input-icon-left" style={{ color: "var(--text-muted)" }} />
                      <select
                        value={scrapeTradeFlow}
                        onChange={(e) => setScrapeTradeFlow(e.target.value as "exports" | "imports")}
                        className="scraper-select-input"
                      >
                        <option value="exports">↗ Exporters / Suppliers</option>
                        <option value="imports">↙ Importers / Buyers</option>
                      </select>
                    </div>
                  </div>

                  {/* Step 4: Extraction Volume (Multi-Page Pagination Depth) */}
                  <div>
                    <div className="step-header" style={{ marginBottom: "8px" }}>
                      <div className="step-title-group">
                        <span className="scraper-step-badge">4</span>
                        <span className="scraper-step-label">Batch Volume (Pagination Depth)</span>
                      </div>
                      <span className="scraper-step-sub">
                        Auto-paginates TradeMap multi-page directory
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px" }}>
                      {[
                        { count: 20, label: "20 Profiles", desc: "2 Pages (Fast)" },
                        { count: 50, label: "50 Profiles", desc: "5 Pages (Standard)" },
                        { count: 100, label: "100 Profiles", desc: "10 Pages (Deep)" },
                        { count: 250, label: "250 Profiles", desc: "25 Pages (Bulk)" },
                        { count: 500, label: "500 Profiles", desc: "50 Pages (Large)" },
                        { count: 1000, label: "🌐 ALL Profiles", desc: "Full Market" },
                      ].map((vol) => (
                        <button
                          key={vol.count}
                          type="button"
                          onClick={() => setScrapeLimit(vol.count)}
                          className={`scraper-vol-btn ${scrapeLimit === vol.count ? "active" : ""}`}
                        >
                          <span style={{ fontWeight: 600, fontSize: "12px" }}>{vol.label}</span>
                          <span style={{ fontSize: "10px", opacity: 0.75 }}>{vol.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Two-Phase Feature Callout Box */}
                  <div className="scraper-verified-card">
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1.1 }}>
                      <div className="scraper-feature-tile" style={{ width: "38px", height: "38px", borderRadius: "10px", background: "rgba(99, 102, 241, 0.1)", color: "#6366f1" }}>
                        <Zap size={18} />
                      </div>
                      <div>
                        <h4 className="scraper-verified-title">
                          2-Phase Extraction Engine
                        </h4>
                        <p className="scraper-verified-desc">
                          Phase 1 fast-scrapes all companies & websites. Phase 2 extracts verified Director/MD names & direct phone numbers.
                        </p>
                      </div>
                    </div>

                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      flex: 0.9,
                    }}>
                      <div className="scraper-verified-item">
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#2563eb", background: "rgba(37, 99, 235, 0.1)", padding: "1px 6px", borderRadius: "4px" }}>PHASE 1</span>
                        <span>Company Name, City & Website</span>
                      </div>
                      <div className="scraper-verified-item">
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#7c3aed", background: "rgba(124, 58, 237, 0.1)", padding: "1px 6px", borderRadius: "4px" }}>PHASE 2</span>
                        <span>Director / MD & Direct Phone</span>
                      </div>
                    </div>
                  </div>

                  {/* Phase 1 Completion Banner (if completed) */}
                  {phase1CompletedCount && phase1CompletedCount > 0 ? (
                    <div
                      style={{
                        background: "rgba(22, 163, 74, 0.08)",
                        border: "1px solid rgba(22, 163, 74, 0.3)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckCircle2 size={16} style={{ color: "#16a34a" }} />
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                          Phase 1 Complete: {phase1CompletedCount} Companies Saved
                        </span>
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#16a34a" }}>
                        Ready for Phase 2!
                      </span>
                    </div>
                  ) : null}

                  {/* Logs Console */}
                  {scrapeLogs && (
                    <div className="scraper-logs-box">
                      {scrapeLogs}
                    </div>
                  )}

                  {/* Action Buttons: Phase 1 Button / Phase 2 Button */}
                  <div style={{ display: "flex", gap: "10px", marginTop: "2px" }}>
                    <button
                      onClick={() => setIsScraperModalOpen(false)}
                      className="scraper-cancel-btn"
                    >
                      {phase1CompletedCount ? "Close" : "Cancel"}
                    </button>

                    {phase1CompletedCount && phase1CompletedCount > 0 ? (
                      <>
                        <button
                          onClick={handleTriggerScrape}
                          disabled={isScraping || isEnriching}
                          className="scraper-cancel-btn"
                          style={{ flex: 1 }}
                          title="Re-run Phase 1 Scrape"
                        >
                          <RefreshCw size={13} />
                          <span>Re-scrape Phase 1</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsScraperModalOpen(false);
                            handleTriggerEnrich();
                          }}
                          disabled={isScraping || isEnriching}
                          className="scraper-execute-btn"
                          style={{
                            flex: 1.6,
                            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                            boxShadow: "0 2px 10px rgba(99, 102, 241, 0.4)",
                          }}
                        >
                          <Zap size={14} fill="currentColor" />
                          <span>Start Phase 2: Enrich Contacts</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleTriggerScrape}
                        disabled={isScraping || isEnriching}
                        className="scraper-execute-btn"
                      >
                        {isScraping ? (
                          <>
                            <RefreshCw size={15} className="spin" />
                            Phase 1: Extracting Live TradeMap Data...
                          </>
                        ) : (
                          <>
                            <Play size={13} fill="currentColor" />
                            1️⃣ Start Phase 1: Scrape Directory
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
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
              <div className="drawer-info-card">
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                  Key Contact Details
                </span>
                {activeCompany.contactName && (
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {activeCompany.contactName} {activeCompany.contactRole && <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>({activeCompany.contactRole})</span>}
                  </p>
                )}
                {activeCompany.phone && (
                  <p style={{ fontSize: "13px", color: "var(--text-primary)", marginTop: "2px", fontWeight: 500 }}>
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
                    style={{ fontSize: "13px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
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
                    className="drawer-product-item"
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

      {/* 7. Floating Live Scraping Progress Widget (Side/Corner Progress Card) */}
      {floatingProgress && floatingProgress.active && (
        <div className="floating-progress-widget">
          <div className="floating-progress-header">
            <div className="floating-progress-title">
              {floatingProgress.status === "running" ? (
                floatingProgress.phase === 2 ? (
                  <>
                    <Zap size={14} className="spin" style={{ color: "#7c3aed" }} />
                    <span style={{ color: "#7c3aed" }}>Phase 2: Enriching Contacts...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} className="spin" style={{ color: "#2563eb" }} />
                    <span>Phase 1: Extracting Directory...</span>
                  </>
                )
              ) : floatingProgress.status === "completed" ? (
                <>
                  <CheckCircle2 size={15} style={{ color: "#16a34a" }} />
                  <span style={{ color: "#16a34a" }}>
                    {floatingProgress.phase === 2 ? "Phase 2 Completed" : "Phase 1 Completed"}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={15} style={{ color: "#dc2626" }} />
                  <span style={{ color: "#dc2626" }}>
                    {floatingProgress.phase === 2 ? "Phase 2 Failed" : "Phase 1 Failed"}
                  </span>
                </>
              )}
            </div>
            <button
              onClick={() => {
                setFloatingProgress(null);
                if (enrichPollRef.current) clearInterval(enrichPollRef.current);
              }}
              className="mini-icon-btn"
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              title="Close progress card"
            >
              <X size={15} />
            </button>
          </div>

          <div className="floating-progress-subtitle">
            <strong>Target:</strong> {floatingProgress.target} • {floatingProgress.volume} batch depth
          </div>

          <div className="floating-progress-bar-bg">
            <div
              className={`floating-progress-bar-fill ${floatingProgress.status === "running" ? "indeterminate" : ""}`}
              style={{
                width: floatingProgress.status === "completed" ? "100%" : floatingProgress.status === "failed" ? "100%" : undefined,
                background: floatingProgress.status === "completed"
                  ? "#16a34a"
                  : floatingProgress.status === "failed"
                  ? "#dc2626"
                  : floatingProgress.phase === 2
                  ? "linear-gradient(90deg, #6366f1, #a855f7)"
                  : undefined,
              }}
            />
          </div>

          <div className="floating-progress-log" title={floatingProgress.message}>
            {floatingProgress.message}
          </div>

          {floatingProgress.marketTotal ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--bg-hover)",
                padding: "8px 12px",
                borderRadius: "8px",
                marginTop: "8px",
                marginBottom: "4px",
                fontSize: "11px",
                border: "1px solid var(--border-main)",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "10px" }}>Total in TradeMap Market</span>
                <strong style={{ color: "var(--text-primary)", fontSize: "13px" }}>{floatingProgress.marketTotal.toLocaleString()} companies</strong>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ color: "var(--text-muted)", display: "block", fontSize: "10px" }}>Extracted in Batch</span>
                <strong style={{ color: "#16a34a", fontSize: "13px" }}>✓ {floatingProgress.records} saved</strong>
              </div>
            </div>
          ) : null}

          {floatingProgress.status === "completed" && (
            <div style={{ marginTop: "10px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setFloatingProgress(null)}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border-main)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>

              {floatingProgress.phase === 1 && floatingProgress.canEnrich && (
                <button
                  onClick={() => handleTriggerEnrich()}
                  disabled={isEnriching}
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "5px 12px",
                    borderRadius: "6px",
                    background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    boxShadow: "0 2px 8px rgba(99, 102, 241, 0.4)",
                  }}
                >
                  <Zap size={12} fill="currentColor" />
                  <span>Start Phase 2: Enrich Contacts</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
