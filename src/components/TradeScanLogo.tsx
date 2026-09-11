import React from "react";

interface LogoProps {
  size?: number;
  showText?: boolean;
  showBadge?: boolean;
  className?: string;
}

export function TradeScanMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="ts_mark_bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f172a" />
          <stop offset="1" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="ts_accent_grad" x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>

      {/* Dark Slate Rounded Foundation */}
      <rect width="32" height="32" rx="8" fill="url(#ts_mark_bg)" />
      <rect width="32" height="32" rx="8" stroke="#334155" strokeWidth="0.75" />

      {/* Interlocking Global Trade Routes (Precision Vector Geometry) */}
      {/* Route 1: Upper-left to Lower-right Commerce Arc */}
      <path
        d="M8 12C8 9.79086 9.79086 8 12 8H16L24 16V20C24 22.2091 22.2091 24 20 24H16L8 16V12Z"
        fill="url(#ts_accent_grad)"
        fillOpacity="0.18"
      />

      {/* Trade Flow Vector Arrows / S-Line */}
      <path
        d="M7 16H18C20.2091 16 22 17.7909 22 20C22 21.6569 20.6569 23 19 23H10"
        stroke="#38bdf8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M25 16H14C11.7909 16 10 14.2091 10 12C10 10.3431 11.3431 9 13 9H22"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Global Trade Coordinates Precision Node */}
      <circle cx="16" cy="16" r="2.75" fill="#38bdf8" />
      <circle cx="16" cy="16" r="1.25" fill="#ffffff" />
    </svg>
  );
}

export function TradeScanLogo({ size = 28, showText = true, showBadge = true, className = "" }: LogoProps) {
  return (
    <div className={`trade-scan-brand ${className}`} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <TradeScanMark size={size} />
      {showText && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "#0f172a",
                lineHeight: "1.2",
              }}
            >
              TradeScan
            </span>
            {showBadge && (
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#2563eb",
                  background: "#eff6ff",
                  padding: "1.5px 5px",
                  borderRadius: "4px",
                  border: "1px solid #dbeafe",
                  lineHeight: "1.2",
                }}
              >
                PRO
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: "0.02em",
              color: "#64748b",
              lineHeight: "1",
              marginTop: "2px",
            }}
          >
            Global Trade Intelligence
          </span>
        </div>
      )}
    </div>
  );
}
