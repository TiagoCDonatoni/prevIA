import React from "react";

export function Card(props: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={"card " + (props.className ?? "")}>
      <div className="hd">
        <h2>{props.title}</h2>
        {props.right ?? null}
      </div>
      <div className="bd">{props.children}</div>
    </div>
  );
}

export function Kpi(props: { title: string; value: string; meta?: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="hd">
        <h2>{props.title}</h2>
      </div>
      <div className="bd">
        <div className="value">{props.value}</div>
        {props.meta ? <div className="meta">{props.meta}</div> : null}
      </div>
    </div>
  );
}

export function Pill(props: { children: React.ReactNode }) {
  return <span className="pill">{props.children}</span>;
}

export function fmtPct(x: number) {
  const v = Math.round(x * 1000) / 10;
  return `${v.toFixed(1)}%`;
}

export function fmtNum(x: number, decimals = 3) {
  const p = Math.pow(10, decimals);
  return String(Math.round(x * p) / p);
}

export function fmtIsoToShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return iso;
  }
}
