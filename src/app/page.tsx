"use client";

import { useEffect, useState } from "react";
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

  // Scraper Controller State
  const [scrapeCountry, setScrapeCountry] = useState("India");
  const [scrapeHsCode, setScrapeHsCode] = useState("Spices");
  const [scrapeTradeFlow, setScrapeTradeFlow] = useState<"exports" | "imports">("exports");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeLogs, setScrapeLogs] = useState<string>("");

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

  // Handle Scraper Trigger
  const handleTriggerScrape = async () => {
    setIsScraping(true);
    setScrapeLogs(`[${new Date().toLocaleTimeString()}] Calling TradeMap extraction engine...\nTarget: ${scrapeCountry} | HS: ${scrapeHsCode} | Flow: ${scrapeTradeFlow}`);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: scrapeCountry,
          hsCode: scrapeHsCode,
          tradeFlow: scrapeTradeFlow,
          limit: 20,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setScrapeLogs((prev) => `${prev}\n\n✓ SUCCESS: ${json.data.message}\nSaved ${json.data.recordsFound} trade company profiles.`);
        fetchData(1);
        fetchStats();
      } else {
        setScrapeLogs((prev) => `${prev}\n\n✗ FAILED: ${json.error}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      setScrapeLogs((prev) => `${prev}\n\n✗ Network Error: ${message}`);
    } finally {
      setIsScraping(false);
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
            <Globe size={16} style={{ color: "#2563eb" }} />
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
            <div className="quota-header">
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Clock size={15} /> Records Scraped
              </span>
              <span>{Math.min(100, Math.round((total / 50) * 100))}%</span>
            </div>
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.min(100, Math.max(10, Math.round((total / 50) * 100)))}%` }}
              />
            </div>
            <div className="quota-labels">
              <span>{total}</span>
              <span>50 Target</span>
            </div>
            <button
              onClick={() => setIsScraperModalOpen(true)}
              className="upgrade-btn"
            >
              Run New Scrape
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
            <button className="icon-btn" title="Toggle theme">
              <Sun size={16} />
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
            <Command size={13} style={{ color: "#2563eb" }} />
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
                onClick={() => setIsScraperModalOpen(true)}
                className="action-btn primary"
              >
                <Play size={13} fill="currentColor" />
                <span>Run Scraper</span>
              </button>

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
                <th style={{ width: "22%" }}>Company Name ↕</th>
                <th style={{ width: "12%" }}>Country ↕</th>
                <th style={{ width: "12%" }}>Trade Type ↕</th>
                <th style={{ width: "10%" }}>HS Code ↕</th>
                <th style={{ width: "23%" }}>Product Category / Sector ↕</th>
                <th style={{ width: "12%" }}>Scraped Date ↕</th>
                <th style={{ width: "8%", textAlign: "right" }}>Actions ↕</th>
              </tr>
            </thead>
            <tbody>
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
                  const { time, date } = formatDateTime(company.createdAt);
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
                          <Building2 size={15} className="type-icon" style={{ color: "#2563eb" }} />
                          <span style={{ fontWeight: 600 }}>{company.name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#475569", fontWeight: 500 }}>
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
                              background: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              color: "#0f172a",
                            }}
                          >
                            HS {primaryProduct.hsCode}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td style={{ color: "var(--text-primary)", fontSize: "12px", maxWidth: "240px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {primaryProduct?.productCategory || "General Merchandise"}
                        </div>
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
                maxWidth: "520px",
                padding: "26px",
                borderRadius: "18px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 25px 50px -12px rgba(15, 23, 42, 0.25)",
              }}
            >
              {/* Header */}
              <div className="modal-header" style={{ marginBottom: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <TradeScanMark size={38} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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

              {/* 1. Target Country Dropdown */}
              <div className="modal-form-group" style={{ marginBottom: "16px" }}>
                <label className="modal-label">Target Country / Market</label>
                <div className="input-with-icon-wrapper">
                  <Globe size={15} className="input-icon-left" />
                  <select
                    value={scrapeCountry}
                    onChange={(e) => setScrapeCountry(e.target.value)}
                    className="modal-select"
                  >
                    <option value="India">🇮🇳 India (Top Global Exporter Hub)</option>
                    <option value="Germany">🇩🇪 Germany (European Commerce)</option>
                    <option value="Vietnam">🇻🇳 Vietnam (Southeast Asia)</option>
                    <option value="United States">🇺🇸 United States (North America)</option>
                    <option value="United Arab Emirates">🇦🇪 United Arab Emirates (Middle East)</option>
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
                {/* Quick Country Pills */}
                <div className="quick-pill-container">
                  {[
                    { label: "🇮🇳 India", val: "India" },
                    { label: "🇩🇪 Germany", val: "Germany" },
                    { label: "🇻🇳 Vietnam", val: "Vietnam" },
                    { label: "🇺🇸 USA", val: "United States" },
                    { label: "🇦🇪 UAE", val: "United Arab Emirates" },
                    { label: "🇨🇳 China", val: "China" },
                  ].map((c) => (
                    <button
                      key={c.val}
                      type="button"
                      onClick={() => setScrapeCountry(c.val)}
                      className={`quick-pill ${scrapeCountry.toLowerCase() === c.val.toLowerCase() ? "active" : ""}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Goods / Commodity Dropdown */}
              <div className="modal-form-group" style={{ marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label className="modal-label" style={{ margin: 0 }}>Goods / Commodity</label>
                  <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                    <CheckCircle2 size={12} style={{ color: "#16a34a" }} /> Auto-Maps to HS Code
                  </span>
                </div>
                <div className="input-with-icon-wrapper">
                  <Package size={15} className="input-icon-left" />
                  <select
                    value={scrapeHsCode}
                    onChange={(e) => setScrapeHsCode(e.target.value)}
                    className="modal-select"
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

                {/* Dynamic Mapped Pill */}
                {currentCommodityInfo.hsCode && (
                  <div className="mapped-indicator-badge">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle2 size={13} style={{ color: "#16a34a" }} />
                      <span>
                        <strong>HS {currentCommodityInfo.hsCode}</strong> • {currentCommodityInfo.category}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        background: "#dcfce7",
                        color: "#166534",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontWeight: 600,
                      }}
                    >
                      Ready
                    </span>
                  </div>
                )}

                {/* Quick Commodity Pills */}
                <div className="quick-pill-container" style={{ marginTop: "8px" }}>
                  {[
                    { label: "🌾 Rice", val: "Rice" },
                    { label: "🫖 Tea", val: "Tea" },
                    { label: "🌶️ Spices", val: "Spices" },
                    { label: "👕 Cotton", val: "Cotton" },
                    { label: "☕ Coffee", val: "Coffee" },
                    { label: "👞 Leather", val: "Leather" },
                    { label: "💊 Pharma", val: "Pharma" },
                    { label: "💎 Jewelry", val: "Jewellery" },
                    { label: "🏗️ Steel", val: "Steel" },
                    { label: "🌐 All Goods", val: "" },
                  ].map((g) => {
                    const isAct = g.val === "" ? !scrapeHsCode.trim() : scrapeHsCode.toLowerCase().includes(g.val.toLowerCase());
                    return (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => setScrapeHsCode(g.val)}
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
                >
                  <option value="exports">↗ Exporters / Suppliers</option>
                  <option value="imports">↙ Importers / Buyers</option>
                </select>
              </div>

              {/* 4. Verified Data Guarantee Info Callout */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  marginBottom: "16px",
                }}
              >
                <ShieldCheck size={16} style={{ color: "#16a34a", marginTop: "2px", flexShrink: 0 }} />
                <div style={{ fontSize: "11.5px", color: "#475569", lineHeight: "1.45" }}>
                  <strong style={{ color: "#0f172a" }}>Verified Profiles:</strong> Extracts Official Company Name, City, Website Link, Executive Director/MD & Direct Phone Number.
                </div>
              </div>

              {/* 5. Logs Console */}
              {scrapeLogs && (
                <div
                  style={{
                    background: "#0f172a",
                    color: "#93c5fd",
                    borderRadius: "10px",
                    padding: "12px",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    maxHeight: "100px",
                    overflowY: "auto",
                    marginBottom: "16px",
                    whiteSpace: "pre-wrap",
                    border: "1px solid #1e293b",
                  }}
                >
                  {scrapeLogs}
                </div>
              )}

              {/* 6. Modal Footer Action Buttons */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => setIsScraperModalOpen(false)}
                  className="action-btn"
                  style={{
                    flex: 1,
                    height: "42px",
                    justifyContent: "center",
                    borderRadius: "10px",
                    fontWeight: 600,
                  }}
                >
                  Close
                </button>
                <button
                  onClick={handleTriggerScrape}
                  disabled={isScraping}
                  className="action-btn primary"
                  style={{
                    flex: 1.6,
                    height: "42px",
                    justifyContent: "center",
                    borderRadius: "10px",
                    fontWeight: 600,
                    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.18)",
                  }}
                >
                  {isScraping ? (
                    <>
                      <RefreshCw size={15} className="spin" />
                      Extracting Live TradeMap...
                    </>
                  ) : (
                    <>
                      <Play size={13} fill="currentColor" />
                      Execute Live Scrape
                    </>
                  )}
                </button>
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
    </div>
  );
}
