'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface WorkerState {
  workerId: number;
  email: string;
  displayAccount: string;
  status: string;
  hsCode: string | null;
  countryName: string | null;
  page: number;
  totalPages: number;
  currentRecord: number;
  totalOnPage: number;
  totalExtracted: number;
  currentCompany: string;
}

interface BatchState {
  isRunning: boolean;
  shouldStop: boolean;
  batchId: string;
  elapsedSeconds: number;
  etaSeconds: number;
  progressPercent: number;
  speedRecordsPerMin: number;
  totalTasks: number;
  completedTasks: number;
  pendingCount: number;
  totalExtracted: number;
  workerCount: number;
  configuredAccountCount?: number;
  active: WorkerState[];
  logs: string[];
  updatedAt: string;
}

const PRESET_HS_CODES = [
  { code: '020130', label: '🥩 Beef / Meat (020130)' },
  { code: '5208', label: '🧵 Woven Cotton (5208)' },
  { code: '0902', label: '🍵 Tea & Mate (0902)' },
  { code: '310210', label: '🌾 Urea / Fertilizer (310210)' },
  { code: '0910', label: '🌶️ Ginger & Spices (0910)' },
  { code: '7113', label: '💍 Jewellery (7113)' },
];

const PRESET_COUNTRIES = [
  { code: '000', name: 'World (All Markets)' },
  { code: '699', name: 'India (699)' },
  { code: '842', name: 'United States (842)' },
  { code: '156', name: 'China (156)' },
  { code: '276', name: 'Germany (276)' },
  { code: '784', name: 'United Arab Emirates (784)' },
  { code: '826', name: 'United Kingdom (826)' },
  { code: '704', name: 'Vietnam (704)' },
];

export default function BatchDashboard() {
  const [state, setState] = useState<BatchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Form controls (dynamically synced from URL or active state)
  const [targetHsCode, setTargetHsCode] = useState('');
  const [targetCountry, setTargetCountry] = useState('000');
  const [targetFlow, setTargetFlow] = useState('exports');
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserLaunchMsg, setBrowserLaunchMsg] = useState<string | null>(null);

  const terminalContainerRef = useRef<HTMLDivElement>(null);

  const activeCount = state?.configuredAccountCount || state?.workerCount || 8;

  // Read URL query params on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlHs = params.get('hs');
      const urlCountry = params.get('country');
      const urlFlow = params.get('flow');
      if (urlHs) setTargetHsCode(urlHs);
      if (urlCountry) setTargetCountry(urlCountry);
      if (urlFlow) setTargetFlow(urlFlow);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchState = async () => {
      try {
        const res = await fetch('/api/scraper/batch');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setState(data);
            setLoading(false);
            // If actively running and no custom input yet, sync to the running HS code
            if (data.active && data.active.length > 0) {
              const activeHs = data.active.find((w: any) => w.hsCode)?.hsCode;
              if (activeHs) {
                setTargetHsCode((prev) => prev || activeHs);
              }
            }
          }
        }
      } catch {}
    };

    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [state?.logs]);

  const handleLaunchBrowsers = async () => {
    setBrowserLoading(true);
    setBrowserLaunchMsg(null);
    try {
      const res = await fetch('/api/scraper/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'launch_browsers',
          hsCode: targetHsCode || '020130',
          countryCode: targetCountry || '000',
          tradeFlow: targetFlow || 'exports',
        }),
      });
      const data = await res.json();
      setBrowserLaunchMsg(data.message || `🚀 ${activeCount} Chrome Browsers Launched & Logged In Successfully!`);
    } catch (err: any) {
      setBrowserLaunchMsg(`❌ Launch error: ${err.message}`);
    }
    setBrowserLoading(false);
  };

  const handleStartExtraction = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/scraper/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_extraction',
          hsCode: targetHsCode || '020130',
          countryCode: targetCountry || '000',
          tradeFlow: targetFlow || 'exports',
        }),
      });
      const res = await fetch('/api/scraper/batch');
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } catch {}
    setActionLoading(false);
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/scraper/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const res = await fetch('/api/scraper/batch');
      if (res.ok) {
        const data = await res.json();
        setState(data);
      }
    } catch {}
    setActionLoading(false);
  };

  const formatTime = (secs: number) => {
    if (!secs || secs < 0) return '0s';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const targetUrlPreview = `https://www.trademap.org/en/goods/companies/c/${targetCountry}/${targetFlow}/p/${targetHsCode || '020130'}`;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #0f172a 0%, #060913 100%)',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '24px 32px',
      boxSizing: 'border-box',
    }}>
      {/* ── Top Navigation Bar ── */}
      <div style={{
        maxWidth: '1360px',
        margin: '0 auto 28px auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '16px 24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              color: '#94a3b8',
              fontSize: '13px',
              fontWeight: '600',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              transition: 'all 0.2s',
            }}
          >
            ← Back to Main App
          </Link>
          <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: '800',
              background: 'linear-gradient(90deg, #60a5fa 0%, #a78bfa 50%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
            }}>
              TradeScan Multi-Account Parallel Engine
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              8 Isolated Chrome Instances • Full STS Auto-Login • 100% Director & Direct Phone Numbers
            </p>
          </div>
        </div>

        {/* Engine Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '9999px',
            fontSize: '13px',
            fontWeight: '700',
            letterSpacing: '0.5px',
            background: state?.isRunning
              ? 'radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.1) 100%)'
              : 'rgba(239, 68, 68, 0.1)',
            color: state?.isRunning ? '#34d399' : '#f87171',
            border: `1px solid ${state?.isRunning ? 'rgba(52, 211, 153, 0.4)' : 'rgba(248, 113, 113, 0.3)'}`,
            boxShadow: state?.isRunning ? '0 0 20px rgba(52, 211, 153, 0.25)' : 'none',
          }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: state?.isRunning ? '#34d399' : '#f87171',
              boxShadow: state?.isRunning ? '0 0 8px #34d399' : 'none',
            }} />
            {state?.isRunning ? '8 WORKERS STREAMING' : 'ENGINE READY'}
          </div>
        </div>
      </div>

      {/* ── Main Command Center Card ── */}
      <div style={{
        maxWidth: '1360px',
        margin: '0 auto 28px auto',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        borderRadius: '20px',
        padding: '28px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle Ambient Glow */}
        <div style={{
          position: 'absolute',
          top: '-120px',
          right: '-120px',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Section Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🎯</span>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                Universal HS Code Target Configuration
              </h2>
              <span style={{
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                fontSize: '11px',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}>
                {activeCount} ACCOUNTS ACTIVE
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
              Select or type any HS Code. All {activeCount} Chrome windows will automatically authenticate via STS and redirect directly to this product page.
            </p>
          </div>

          {/* Quick Preset Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Quick Select:</span>
            {PRESET_HS_CODES.map((item) => (
              <button
                key={item.code}
                onClick={() => setTargetHsCode(item.code)}
                style={{
                  background: targetHsCode === item.code ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                  color: targetHsCode === item.code ? '#93c5fd' : '#cbd5e1',
                  border: `1px solid ${targetHsCode === item.code ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '8px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
          alignItems: 'flex-end',
          marginBottom: '22px',
        }}>
          {/* HS Code Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📦 Product / HS Code:
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={targetHsCode}
                onChange={(e) => setTargetHsCode(e.target.value.trim())}
                placeholder="e.g. 020130, 5208, 0902"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(2, 6, 23, 0.7)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  borderRadius: '10px',
                  color: '#38bdf8',
                  fontSize: '15px',
                  fontWeight: '800',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)',
                }}
              />
            </div>
          </div>

          {/* Partner Country Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🌍 Market / Partner Country:
            </label>
            <select
              value={targetCountry}
              onChange={(e) => setTargetCountry(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(2, 6, 23, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                color: '#f8fafc',
                fontSize: '14px',
                fontWeight: '600',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            >
              {PRESET_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Trade Flow Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🔄 Trade Flow:
            </label>
            <select
              value={targetFlow}
              onChange={(e) => setTargetFlow(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(2, 6, 23, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                color: '#f8fafc',
                fontSize: '14px',
                fontWeight: '600',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            >
              <option value="exports" style={{ background: '#0f172a' }}>📤 Exports (Suppliers / Sellers)</option>
              <option value="imports" style={{ background: '#0f172a' }}>📥 Imports (Buyers / Importers)</option>
            </select>
          </div>

          {/* Target URL Preview */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🔗 Live Destination URL:
            </label>
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(2, 6, 23, 0.9)',
                border: '1px solid rgba(167, 139, 250, 0.3)',
                borderRadius: '10px',
                color: '#c084fc',
                fontSize: '12px',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxSizing: 'border-box',
              }}
              title={targetUrlPreview}
            >
              trademap.org/c/{targetCountry}/{targetFlow}/p/{targetHsCode || '...'}
            </div>
          </div>
        </div>

        {/* ── Action Buttons Row ── */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '20px',
        }}>
          {/* Button 1: Launch 8 Browsers */}
          <button
            onClick={handleLaunchBrowsers}
            disabled={browserLoading}
            style={{
              padding: '14px 26px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: browserLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.45)',
              transition: 'all 0.2s ease',
              opacity: browserLoading ? 0.7 : 1,
            }}
          >
            {browserLoading ? `⏳ Launching ${activeCount} Chrome Windows...` : `🚀 OPEN ${activeCount} BROWSERS (AUTO LOGIN)`}
          </button>

          {/* Button 2: Start Full Extraction */}
          {!state?.isRunning ? (
            <button
              onClick={handleStartExtraction}
              disabled={actionLoading}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '800',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.45)',
                transition: 'all 0.2s ease',
              }}
            >
              {actionLoading ? '⏳ Initializing Stream...' : `⚡ START ${activeCount}-WORKER EXTRACTION`}
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontWeight: '800',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 20px rgba(220, 38, 38, 0.4)',
              }}
            >
              🛑 STOP EXTRACTION ENGINE
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b' }}>
            <span>Auto-Resumes from checkpoint • 0 duplicates guaranteed</span>
          </div>
        </div>

        {/* Feedback Message */}
        {browserLaunchMsg && (
          <div style={{
            marginTop: '18px',
            padding: '12px 18px',
            borderRadius: '10px',
            background: browserLaunchMsg.includes('❌') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            border: `1px solid ${browserLaunchMsg.includes('❌') ? '#ef4444' : '#10b981'}`,
            color: browserLaunchMsg.includes('❌') ? '#fca5a5' : '#6ee7b7',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            {browserLaunchMsg}
          </div>
        )}
      </div>

      {/* ── Metrics HUD Grid ── */}
      <div style={{
        maxWidth: '1360px',
        margin: '0 auto 28px auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '18px',
      }}>
        {/* Metric 1 */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ height: '3px', width: '100%', background: '#38bdf8', position: 'absolute', top: 0, left: 0 }} />
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total Verified Ingested
          </div>
          <div style={{ fontSize: '36px', fontWeight: '900', color: '#38bdf8', marginTop: '6px', letterSpacing: '-1px' }}>
            {state?.totalExtracted ? state.totalExtracted.toLocaleString() : '0'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Saved directly in MongoDB Atlas
          </div>
        </div>

        {/* Metric 2 */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ height: '3px', width: '100%', background: '#10b981', position: 'absolute', top: 0, left: 0 }} />
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Live Stream Velocity
          </div>
          <div style={{ fontSize: '36px', fontWeight: '900', color: '#10b981', marginTop: '6px', letterSpacing: '-1px' }}>
            {state?.speedRecordsPerMin || 0}
            <span style={{ fontSize: '15px', color: '#94a3b8', fontWeight: '500', marginLeft: '6px' }}>rec/min</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            8x Parallel Chrome Pipeline
          </div>
        </div>

        {/* Metric 3 */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(251, 191, 36, 0.2)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ height: '3px', width: '100%', background: '#fbbf24', position: 'absolute', top: 0, left: 0 }} />
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Elapsed / Estimated ETA
          </div>
          <div style={{ fontSize: '28px', fontWeight: '900', color: '#fbbf24', marginTop: '10px' }}>
            {formatTime(state?.elapsedSeconds || 0)}
            <span style={{ fontSize: '16px', color: '#64748b', fontWeight: '400', margin: '0 8px' }}>/</span>
            <span style={{ fontSize: '20px', color: '#94a3b8' }}>~{formatTime(state?.etaSeconds || 0)}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Real-time pacing calculation
          </div>
        </div>

        {/* Metric 4 */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(192, 132, 252, 0.2)',
          borderRadius: '16px',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ height: '3px', width: '100%', background: '#c084fc', position: 'absolute', top: 0, left: 0 }} />
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Batch Completion
          </div>
          <div style={{ fontSize: '36px', fontWeight: '900', color: '#c084fc', marginTop: '6px', letterSpacing: '-1px' }}>
            {state?.progressPercent || 0}%
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{
              width: `${state?.progressPercent || 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      </div>

      {/* ── 8 Parallel Workers Live Stream Cards ── */}
      <div style={{ maxWidth: '1360px', margin: '0 auto 28px auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>👥</span> 8 Active Account Workers (Parallel Chrome Grid)
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Automatic token injection • Zero session clash
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
        }}>
          {Array.from({ length: 8 }, (_, idx) => {
            const wId = idx + 1;
            const w = state?.active?.find((item) => item.workerId === wId);

            const isFetching = w?.status === 'FETCHING';
            const isReady = w?.status === 'READY';
            const isDone = w?.status === 'TASK_DONE';
            const isCooldown = w?.status === 'COOLDOWN' || w?.currentCompany?.includes('Cooldown');
            const isIdle = !w || w.status === 'IDLE';

            let badgeColor = '#94a3b8';
            let badgeBg = 'rgba(148, 163, 184, 0.15)';
            let borderColor = 'rgba(255, 255, 255, 0.08)';

            if (isFetching) {
              badgeColor = '#38bdf8';
              badgeBg = 'rgba(56, 189, 248, 0.2)';
              borderColor = '#0284c7';
            } else if (isDone) {
              badgeColor = '#34d399';
              badgeBg = 'rgba(52, 211, 153, 0.2)';
              borderColor = '#059669';
            } else if (isCooldown) {
              badgeColor = '#fbbf24';
              badgeBg = 'rgba(251, 191, 36, 0.2)';
              borderColor = '#d97706';
            } else if (isReady) {
              badgeColor = '#a78bfa';
              badgeBg = 'rgba(167, 139, 250, 0.2)';
              borderColor = '#7c3aed';
            }

            return (
              <div
                key={wId}
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '14px',
                  padding: '18px',
                  boxShadow: isFetching ? '0 0 20px rgba(2, 132, 199, 0.25)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: '800', fontSize: '15px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isFetching ? '#38bdf8' : isDone ? '#34d399' : '#64748b',
                    }} />
                    Worker #{wId}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '800',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    color: badgeColor,
                    background: badgeBg,
                    border: `1px solid ${borderColor}`,
                  }}>
                    {w?.status || 'IDLE'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  🔑 Account #{wId}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: '#cbd5e1' }}>
                  <span style={{ color: '#64748b' }}>Claimed Page:</span>
                  <span style={{ fontWeight: '700', color: '#38bdf8' }}>
                    {w?.page ? `Page ${w.page} / ${state?.totalTasks || w?.totalPages || 111}` : 'Standby'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '12px', color: '#cbd5e1' }}>
                  <span style={{ color: '#64748b' }}>Records on Page:</span>
                  <span style={{ fontWeight: '700', color: '#10b981' }}>
                    {w?.currentRecord || 0} / {w?.totalOnPage || 100}
                  </span>
                </div>

                <div style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingTop: '10px',
                  background: 'rgba(2, 6, 23, 0.5)',
                  margin: '0 -18px -18px -18px',
                  padding: '10px 18px',
                  borderBottomLeftRadius: '14px',
                  borderBottomRightRadius: '14px',
                }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>
                    Live Enrichment Feed:
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#f1f5f9',
                      marginTop: '3px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={w?.currentCompany || 'Idle / Waiting for claim'}
                  >
                    {w?.currentCompany || 'Waiting for page claim...'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Real-time Terminal Log Console ── */}
      <div style={{ maxWidth: '1360px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📜</span> Live System Telemetry & Enrichment Stream
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
            Auto-refreshing 1.5s
          </span>
        </div>

        <div style={{
          background: '#040711',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '16px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}>
          {/* Terminal Window Header Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px', fontFamily: 'monospace' }}>
                terminal@tradescan-8worker-pipeline
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'monospace' }}>
              UTF-8 • JSONL Checkpoint Sync
            </span>
          </div>

          {/* Terminal Logs Content */}
          <div
            ref={terminalContainerRef}
            style={{
            padding: '18px',
            fontFamily: 'Consolas, "Fira Code", monospace',
            fontSize: '13px',
            color: '#38bdf8',
            height: '280px',
            overflowY: 'auto',
            lineHeight: '1.7',
            background: 'transparent',
          }}>
            {state?.logs && state.logs.length > 0 ? (
              state.logs.map((log, i) => {
                const isError = log.includes('❌') || log.includes('Error') || log.includes('Rate limit') || log.includes('403');
                const isSuccess = log.includes('✅') || log.includes('🎉') || log.includes('active') || log.includes('Completed');
                const isWarning = log.includes('⚠️') || log.includes('⏳') || log.includes('Cooldown');

                let logColor = '#cbd5e1';
                if (isError) logColor = '#f87171';
                else if (isSuccess) logColor = '#4ade80';
                else if (isWarning) logColor = '#fbbf24';

                return (
                  <div key={i} style={{ color: logColor }}>
                    {log}
                  </div>
                );
              })
            ) : (
              <div style={{ color: '#475569' }}>
                [System Initialized] Standing by for browser launch or extraction trigger...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
