import React, { useEffect } from "react";

type ProductFiltersSheetProps = {
  open: boolean;
  title: string;
  clearText: string;
  applyText: string;
  hasActiveFilters: boolean;
  onClose: () => void;
  onClear: () => void;
  children: React.ReactNode;
};

export function ProductFiltersSheet({
  open,
  title,
  clearText,
  applyText,
  hasActiveFilters,
  onClose,
  onClear,
  children,
}: ProductFiltersSheetProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="product-filters-sheet-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="product-filters-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="product-filters-sheet-handle" />

        <div className="product-filters-sheet-head">
          <div className="product-filters-sheet-title">{title}</div>

          <button
            type="button"
            className="product-filters-sheet-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="product-filters-sheet-body">{children}</div>

        <div className="product-filters-sheet-footer">
          <button
            type="button"
            className="product-secondary"
            onClick={onClear}
            disabled={!hasActiveFilters}
          >
            {clearText}
          </button>

          <button
            type="button"
            className="product-primary"
            onClick={onClose}
          >
            {applyText}
          </button>
        </div>
      </div>
    </div>
  );
}