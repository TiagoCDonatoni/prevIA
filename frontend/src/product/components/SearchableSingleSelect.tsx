import React, { useEffect, useMemo, useRef, useState } from "react";

type SearchableSingleSelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SearchableSingleSelectProps = {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  selectedValue: string;
  options: SearchableSingleSelectOption[];
  disabled?: boolean;
  className?: string;
  onChange: (next: string) => void;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function SearchableSingleSelect({
  label,
  placeholder,
  searchPlaceholder,
  emptyText,
  selectedValue,
  options,
  disabled = false,
  className = "",
  onChange,
}: SearchableSingleSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue]
  );

  const summaryText = selectedOption?.label ?? placeholder;

  const filteredOptions = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return options;

    return options.filter((option) =>
      normalizeText(option.searchText ?? option.label).includes(q)
    );
  }, [options, query]);

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

  function handleSelect(value: string) {
    onChange(value);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={`smx ssx ${className}`.trim()}>
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
            className={`smx-trigger-summary ${selectedOption ? "is-filled" : ""}`}
            title={summaryText}
          >
            {summaryText}
          </span>
        </span>

        <span className="smx-trigger-actions">
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

          <div className="smx-list" role="listbox" aria-multiselectable="false">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const isSelected = option.value === selectedValue;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`smx-option ssx-option ${isSelected ? "is-selected" : ""}`}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span className="smx-option-copy">
                      <span className="smx-option-label-row">
                        <span className="smx-option-label">{option.label}</span>
                        {isSelected ? (
                          <span className="ssx-option-selected" aria-hidden="true">
                            ✓
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="smx-empty">{emptyText}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}