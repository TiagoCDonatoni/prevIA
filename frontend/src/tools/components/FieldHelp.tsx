import React from "react";

export function FieldHelp({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <span className={`tools-field-help ${open ? "is-open" : ""}`} onBlur={() => setOpen(false)}>
      <button
        type="button"
        className="tools-field-help-button"
        aria-label={text}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span id={id} role="tooltip" className="tools-field-tooltip">{text}</span>
    </span>
  );
}

export function FieldLabel({ htmlFor, label, help, helpId }: { htmlFor: string; label: string; help: string; helpId: string }) {
  return <span className="tools-field-label"><label htmlFor={htmlFor}>{label}</label><FieldHelp id={helpId} text={help} /></span>;
}
