import React from "react";
import "./brand-logo.css";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export default function BrandLogo({
  compact = false,
  className = "",
}: BrandLogoProps) {
  return (
    <div
      className={`brand-logo ${compact ? "is-compact" : ""} ${className}`.trim()}
      aria-label="prevIA Betting Intelligence"
    >
      <div className="brand-logo-wordmark">
        <span className="brand-logo-prev">prev</span>
        <span className="brand-logo-ia">IA</span>
      </div>

      {!compact ? (
        <div className="brand-logo-subtitle">BETTING INTELLIGENCE</div>
      ) : null}
    </div>
  );
}