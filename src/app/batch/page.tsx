'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ALL_COUNTRIES } from '@/lib/countries';

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
  hsCode?: string;
  tradeFlow?: string;
  countryCode?: string;
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

const uniqueCountries = new Map<string, { code: string; name: string }>();
uniqueCountries.set('000', { code: '000', name: '🌍 World (All Markets)' });
ALL_COUNTRIES.forEach((c) => {
  if (c.code !== '000' && !uniqueCountries.has(c.code)) {
    uniqueCountries.set(c.code, {
      code: c.code,
      name: `${c.flag ? c.flag + ' ' : ''}${c.name} (${c.code})`,
    });
  }
});
const PRESET_COUNTRIES = Array.from(uniqueCountries.values());

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

  // Read URL query params or localStorage on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlHs = params.get('hs');
      const urlCountry = params.get('country');
      const urlFlow = params.get('flow');
      if (urlHs) setTargetHsCode(urlHs);
      if (urlCountry) setTargetCountry(urlCountry);
      if (urlFlow) {
        setTargetFlow(urlFlow);
      } else {
        const savedFlow = localStorage.getItem('tradescan_tradeFlow');
        if (savedFlow) setTargetFlow(savedFlow);
      }
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
            // If actively running, sync to the running HS code, trade flow, and country!
            if (data.isRunning) {
              if (data.hsCode) {
                setTargetHsCode((prev) => prev || data.hsCode);
              } else if (data.active && data.active.length > 0) {
                const activeHs = data.active.find((w: any) => w.hsCode)?.hsCode;
                if (activeHs) setTargetHsCode((prev) => prev || activeHs);
              }
              if (data.tradeFlow) {
                setTargetFlow(data.tradeFlow);
              }
              if (data.countryCode) {
                setTargetCountry((prev) => (prev === '000' && data.countryCode !== '000' ? data.countryCode : prev));
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
      setBrowserLaunchMsg(data.message || `${activeCount} Chrome Browsers Launched & Logged In Successfully!`);
    } catch (err: any) {
      setBrowserLaunchMsg(`❌ Launch error: ${err.message}`);
    }
    setBrowserLoading(false);
  };

  const handleStartExtraction = async (forceFresh = false) => {
    const trimmedHs = targetHsCode.trim();
    if (!trimmedHs) {
      alert('Please enter or select a Product / HS Code first.');
      return;
    }
    setActionLoading(true);
    try {
      await fetch('/api/scraper/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_extraction',
          hsCode: trimmedHs,
          countryCode: targetCountry || '000',
          tradeFlow: targetFlow || 'exports',
          fresh: forceFresh,
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

  const targetUrlPreview = targetHsCode.trim()
    ? `trademap.org/c/${targetCountry}/${targetFlow}/p/${targetHsCode.trim()}`
    : `trademap.org/c/${targetCountry}/${targetFlow}/p/-`;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f3f4f6',
      color: '#0f172a',
      fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px 32px',
      boxSizing: 'border-box',
    }}>
      {/* ── Top Navigation Bar ── */}
      <div style={{
        maxWidth: '1360px',
        margin: '0 auto 24px auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '16px 24px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: '700',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#2563eb',
              border: '1px solid #1d4ed8',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ← Back to Main App
          </Link>
          <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }} />
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: '800',
              color: '#0f172a',
              letterSpacing: '-0.3px',
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
            fontSize: '12px',
            fontWeight: '800',
            letterSpacing: '0.4px',
            background: state?.isRunning ? '#dcfce7' : '#f8fafc',
            color: state?.isRunning ? '#15803d' : '#64748b',
            border: `1px solid ${state?.isRunning ? '#86efac' : '#e2e8f0'}`,
          }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: state?.isRunning ? '#22c55e' : '#94a3b8',
              boxShadow: state?.isRunning ? '0 0 6px #22c55e' : 'none',
            }} />
            {state?.isRunning ? `${activeCount} WORKERS STREAMING` : 'ENGINE READY'}
          </div>
        </div>
      </div>

      {/* ── Main Command Center Card ── */}
      <div style={{
        maxWidth: '1360px',
        margin: '0 auto 24px auto',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '24px 28px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
      }}>
        {/* Section Title & Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>🎯</span>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px' }}>
                Universal HS Code Target Configuration
              </h2>
              <span style={{
                background: '#dbeafe',
                color: '#1d4ed8',
                fontSize: '11px',
                fontWeight: '700',
                padding: '3px 10px',
                borderRadius: '6px',
                border: '1px solid #bfdbfe',
              }}>
                {activeCount} ACCOUNTS ACTIVE
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Select or type any HS Code. All {activeCount} Chrome windows will automatically authenticate via STS and redirect directly to this product page.
            </p>
          </div>

          {/* Quick Preset Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Quick Select:</span>
            {PRESET_HS_CODES.map((item) => {
              const isActive = targetHsCode === item.code;
              return (
                <button
                  key={item.code}
                  onClick={() => setTargetHsCode(item.code)}
                  style={{
                    background: isActive ? '#eff6ff' : '#ffffff',
                    color: isActive ? '#2563eb' : '#334155',
                    border: `1px solid ${isActive ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: '20px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: isActive ? '700' : '600',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 1px 4px rgba(59, 130, 246, 0.15)' : 'none',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inputs Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          alignItems: 'flex-end',
          marginBottom: '20px',
        }}>
          {/* HS Code Input */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📦 Product / HS Code:
            </label>
            <input
              type="text"
              value={targetHsCode}
              onChange={(e) => setTargetHsCode(e.target.value.trim())}
              placeholder="e.g. 020130, 5208, 0902"
              style={{
                width: '100%',
                padding: '11px 14px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#0f172a',
                fontSize: '14px',
                fontWeight: '600',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                letterSpacing: '0.5px',
              }}
            />
          </div>

          {/* Partner Country Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🌍 Market / Partner Country:
            </label>
            <select
              value={targetCountry}
              onChange={(e) => setTargetCountry(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#0f172a',
                fontSize: '14px',
                fontWeight: '600',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            >
              {PRESET_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} style={{ background: '#ffffff', color: '#0f172a' }}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Trade Flow Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📉 Trade Flow:
            </label>
            <select
              value={targetFlow}
              onChange={(e) => {
                const val = e.target.value;
                setTargetFlow(val);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('tradescan_tradeFlow', val);
                }
              }}
              style={{
                width: '100%',
                padding: '11px 14px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#0f172a',
                fontSize: '14px',
                fontWeight: '600',
                outline: 'none',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            >
              <option value="exports">Exports (Suppliers / Sellers)</option>
              <option value="imports">Imports (Buyers / Importers)</option>
            </select>
          </div>

          {/* Target URL Preview */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🔗 Live Destination URL:
            </label>
            <div
              style={{
                padding: '11px 14px',
                background: '#eff6ff',
                border: '1px solid #dbeafe',
                borderRadius: '8px',
                color: '#2563eb',
                fontSize: '13px',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxSizing: 'border-box',
                fontWeight: '500',
              }}
              title={targetUrlPreview}
            >
              {targetUrlPreview}
            </div>
          </div>
        </div>

        {/* ── Action Buttons Row ── */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          borderTop: '1px solid #f1f5f9',
          paddingTop: '18px',
        }}>
          {!state?.isRunning ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => handleStartExtraction(false)}
                disabled={actionLoading}
                style={{
                  padding: '12px 24px',
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '800',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.2)',
                  transition: 'all 0.15s ease',
                }}
              >
                {actionLoading ? '⏳ Initializing Stream...' : '► Run Extraction Engine'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Start fresh from Page 1? Any existing checkpoint for this HS code will be reset.')) {
                    handleStartExtraction(true);
                  }
                }}
                disabled={actionLoading}
                style={{
                  padding: '12px 18px',
                  background: '#ffffff',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
                title="Start fresh from Page 1, resetting any saved checkpoint"
              >
                🔄 Start from Page 1 (Fresh)
              </button>
            </div>
          ) : (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              style={{
                padding: '12px 24px',
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: '800',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
              }}
            >
              🛑 Stop Extraction Engine
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b' }}>
            <span>Auto-Resumes from checkpoint • 0 duplicates guaranteed</span>
          </div>
        </div>

        {/* Feedback Message */}
        {browserLaunchMsg && (
          <div style={{
            marginTop: '16px',
            padding: '10px 16px',
            borderRadius: '8px',
            background: browserLaunchMsg.includes('❌') ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${browserLaunchMsg.includes('❌') ? '#fecaca' : '#bbf7d0'}`,
            color: browserLaunchMsg.includes('❌') ? '#991b1b' : '#166534',
            fontSize: '13px',
            fontWeight: '600',
          }}>
            {browserLaunchMsg}
          </div>
        )}
      </div>

      {/* ── Metrics HUD Grid ── */}
      <div style={{
        maxWidth: '1360px',
        margin: '0 auto 24px auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
      }}>
        {/* Metric 1 */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📄</span> BATCH EXTRACTED {state?.hsCode ? `(HS ${state.hsCode})` : ''}
            </div>
            <span style={{ fontSize: '14px', color: '#3b82f6' }}>📊</span>
          </div>
          <div style={{ fontSize: '36px', fontWeight: '800', color: '#2563eb', marginTop: '8px', letterSpacing: '-1px' }}>
            {state?.isRunning && state?.totalExtracted ? state.totalExtracted.toLocaleString() : '0'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Saved directly in MongoDB Atlas
          </div>
        </div>

        {/* Metric 2 */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚡</span> LIVE STREAM VELOCITY
            </div>
            <span style={{ fontSize: '12px', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>📈</span>
          </div>
          <div style={{ fontSize: '36px', fontWeight: '800', color: '#16a34a', marginTop: '8px', letterSpacing: '-1px' }}>
            {state?.isRunning ? (state?.speedRecordsPerMin || 0) : 0}
            <span style={{ fontSize: '15px', color: '#64748b', fontWeight: '500', marginLeft: '6px' }}>rec/min</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            {activeCount}x Parallel Chrome Pipeline
          </div>
        </div>

        {/* Metric 3 */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⏱️</span> ELAPSED / ESTIMATED ETA
            </div>
            <span style={{ fontSize: '14px', color: '#d97706' }}>🕒</span>
          </div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#d97706', marginTop: '8px' }}>
            {state?.isRunning ? formatTime(state?.elapsedSeconds || 0) : '0s'}
            <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: '400', margin: '0 6px' }}>/</span>
            <span style={{ fontSize: '22px', color: '#64748b' }}>~{state?.isRunning ? formatTime(state?.etaSeconds || 0) : '0s'}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            Real-time pacing calculation
          </div>
        </div>

        {/* Metric 4 */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🎯</span> BATCH COMPLETION
            </div>
            <span style={{ fontSize: '14px', color: '#9333ea' }}>🎯</span>
          </div>
          <div style={{ fontSize: '36px', fontWeight: '800', color: '#9333ea', marginTop: '8px', letterSpacing: '-1px' }}>
            {state?.isRunning ? (state?.progressPercent || 0) : 0}%
          </div>
          <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', marginTop: '10px', overflow: 'hidden' }}>
            <div style={{
              width: `${state?.isRunning ? (state?.progressPercent || 0) : 0}%`,
              height: '100%',
              background: '#a855f7',
              borderRadius: '4px',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      </div>

      {/* ── 8 Parallel Workers Live Stream Cards ── */}
      <div style={{ maxWidth: '1360px', margin: '0 auto 24px auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👥</span> {activeCount} Active Account Workers (Parallel Chrome Grid)
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Automatic token injection • Zero session clash
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}>
          {Array.from({ length: activeCount }, (_, idx) => {
            const wId = idx + 1;
            const w = state?.active?.find((item) => item.workerId === wId);

            const isRunning = !!state?.isRunning;
            const isFetching = isRunning && w?.status === 'FETCHING';
            const isReady = isRunning && w?.status === 'READY';
            const isDone = isRunning && w?.status === 'TASK_DONE';
            const isCooldown = isRunning && (w?.status === 'COOLDOWN' || w?.currentCompany?.includes('Cooldown'));

            let badgeColor = '#15803d';
            let badgeBg = '#dcfce7';
            let badgeBorder = '#86efac';

            if (isFetching) {
              badgeColor = '#0369a1';
              badgeBg = '#e0f2fe';
              badgeBorder = '#7dd3fc';
            } else if (isDone) {
              badgeColor = '#15803d';
              badgeBg = '#dcfce7';
              badgeBorder = '#86efac';
            } else if (isCooldown) {
              badgeColor = '#b45309';
              badgeBg = '#fef3c7';
              badgeBorder = '#fde68a';
            } else if (isReady) {
              badgeColor = '#6b21a8';
              badgeBg = '#f3e8ff';
              badgeBorder = '#d8b4fe';
            } else if (!isRunning || !w || w.status === 'IDLE' || w.status === 'STOPPED') {
              badgeColor = '#475569';
              badgeBg = '#f1f5f9';
              badgeBorder = '#e2e8f0';
            }

            return (
              <div
                key={wId}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '18px',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: '800', fontSize: '15px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: isFetching ? '#0284c7' : isDone ? '#22c55e' : '#22c55e',
                    }} />
                    Worker #{wId}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '800',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    color: badgeColor,
                    background: badgeBg,
                    border: `1px solid ${badgeBorder}`,
                  }}>
                    {isRunning ? (w?.status || 'IDLE') : 'IDLE'}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  🔑 Account #{wId}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: '#475569' }}>
                  <span style={{ color: '#94a3b8' }}>Claimed Page:</span>
                  <span style={{ fontWeight: '700', color: '#2563eb' }}>
                    {isRunning && w?.page ? `Page ${w.page} / ${state?.totalTasks || w?.totalPages || 111}` : 'Standby'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '12px', color: '#475569' }}>
                  <span style={{ color: '#94a3b8' }}>Records on Page:</span>
                  <span style={{ fontWeight: '700', color: '#16a34a' }}>
                    {isRunning ? (w?.currentRecord || 0) : 0} / {isRunning ? (w?.totalOnPage || 100) : 100}
                  </span>
                </div>

                <div style={{
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: '10px',
                  background: '#f8fafc',
                  margin: '0 -18px -18px -18px',
                  padding: '10px 18px',
                  borderBottomLeftRadius: '14px',
                  borderBottomRightRadius: '14px',
                }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>
                    LIVE ENRICHMENT FEED:
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#475569',
                      marginTop: '3px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={isRunning ? (w?.currentCompany || 'Idle / Waiting for claim') : 'Standby'}
                  >
                    {isRunning ? (w?.currentCompany || 'Waiting for page claim...') : 'Waiting for page claim...'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Real-time Terminal Log Console ── */}
      <div style={{ maxWidth: '1360px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📜</span> Live System Telemetry & Enrichment Stream
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
            Auto-refreshing 1.5s
          </span>
        </div>

        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '14px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
        }}>
          {/* Terminal Window Header Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '8px', fontFamily: 'monospace' }}>
                terminal@tradescan-8worker-pipeline
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
              UTF-8 • JSONL Checkpoint Sync
            </span>
          </div>

          {/* Terminal Logs Content */}
          <div
            ref={terminalContainerRef}
            style={{
              padding: '16px 18px',
              fontFamily: 'Consolas, "Fira Code", monospace',
              fontSize: '13px',
              color: '#38bdf8',
              height: '260px',
              overflowY: 'auto',
              lineHeight: '1.7',
              background: 'transparent',
            }}
          >
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
              <div style={{ color: '#64748b' }}>
                [System Initialized] Standing by for browser launch or extraction trigger...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
