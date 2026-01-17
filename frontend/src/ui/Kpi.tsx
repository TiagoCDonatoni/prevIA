import type { ReactNode } from "react";

export function Kpi(props: { title: string; value: string; meta?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-title">{props.title}</div>
        {props.meta ? <div className="kpi-meta">{props.meta}</div> : null}
      </div>

      <div className="kpi-value">{props.value}</div>
    </div>
  );
}
