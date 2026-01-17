import { ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="card">
      {title ? <div className="card-title">{title}</div> : null}
      <div className="card-body">{children}</div>
    </div>
  );
}
