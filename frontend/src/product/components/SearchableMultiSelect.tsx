import React, { useEffect, useMemo, useRef, useState } from "react";
import type { FilterOption } from "../filters/productFilterOptions";

type SearchableMultiSelectProps = {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  clearText: string;
  selectedValues: string[];
  options: FilterOption[];
  disabled?: boolean;
  className?: string;
  getSummaryText?: (selectedOptions: FilterOption[]) => string;
  onChange: (next: string[]) => void;
  renderLeading?: (option: FilterOption) => React.ReactNode;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function SearchableMultiSelect({
  label,
  placeholder,
  searchPlaceholder,
  emptyText,
  clearText,
  selectedValues,
  options,
  disabled = false,
  className = "",
  getSummaryText,
  onChange,
  renderLeading,
}: SearchableMultiSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const filteredOptions = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return options;
    return options.filter((option) => option.searchText.includes(q));
  }, [options, query]);

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(option.value)),
    [options, selectedSet]
  );

  const summaryText = useMemo(() => {
    if (getSummaryText) return getSummaryText(selectedOptions);
    if (!selectedOptions.length) return placeholder;
    if (selectedOptions.length === 1) return selectedOptions[0].label;
    return `${selectedOptions.length} selecionados`;
  }, [getSummaryText, placeholder, selectedOptions]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  function toggleValue(value: string) {
    if (selectedSet.has(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }
    onChange([...selectedValues, value]);
  }

  function clearAll(event?: React.MouseEvent) {
    event?.stopPropagation();
    onChange([]);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={`smx ${className}`.trim()}>
      <button
        type="button"
        className="smx-trigger"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
        aria-expanded={open}
      >
        <span className="smx-trigger-copy">
          <span className="smx-trigger-label">{label}</span>
            <span
              className={`smx-trigger-summary ${selectedOptions.length ? "is-filled" : ""}`}
              title={summaryText}
            >
              {summaryText}
            </span>
        </span>

        <span className="smx-trigger-actions">
          {selectedOptions.length ? (
            <span
              className="smx-trigger-count"
              onClick={(event) => {
                event.stopPropagation();
                clearAll();
              }}
              role="button"
              tabIndex={-1}
              aria-label={clearText}
              title={clearText}
            >
              {selectedOptions.length}
            </span>
          ) : null}

          <span className={`smx-caret ${open ? "is-open" : ""}`} aria-hidden="true">
            ▾
          </span>
        </span>
      </button>

      {open ? (
        <div className="smx-popover">
          <div className="smx-search-wrap">
            <input
              className="smx-search"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
            />
          </div>

          <div className="smx-list" role="listbox" aria-multiselectable="true">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const checked = selectedSet.has(option.value);

                return (
                  <label
                    key={option.value}
                    className={`smx-option ${checked ? "is-selected" : ""}`}
                  >
                    <input
                      className="smx-option-checkbox"
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(option.value)}
                    />

                    {renderLeading ? (
                      <span className="smx-option-leading">{renderLeading(option)}</span>
                    ) : null}

                    <span className="smx-option-copy">
                      <span className="smx-option-label-row">
                        <span className="smx-option-label">{option.label}</span>
                        {typeof option.count === "number" ? (
                          <span className="smx-option-count">{option.count}</span>
                        ) : null}
                      </span>

                      {option.hint ? (
                        <span className="smx-option-hint">{option.hint}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            ) : (
              <div className="smx-empty">{emptyText}</div>
            )}
          </div>

          <div className="smx-footer">
            <button
              type="button"
              className="smx-clear"
              onClick={(event) => clearAll(event)}
              disabled={!selectedOptions.length && !query}
            >
              {clearText}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}