import React from "react";

type BrandLogoProps = {
  compact?: boolean;
};

export default function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className={`brand-logo ${compact ? "is-compact" : ""}`} aria-label="prevIA Betting Intelligence">
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