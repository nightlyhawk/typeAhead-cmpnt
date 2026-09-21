"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Suggestion } from "@/lib/countries";
import { useTypeahead } from "./use-typeahead";

const LISTBOX_ID_SUFFIX = "listbox";

export function CountrySearch() {
  const baseId = useId();
  const listboxId = `${baseId}-${LISTBOX_ID_SUFFIX}`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<Suggestion | null>(null);

  const { results, status, error } = useTypeahead(query);

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // A fresh result set invalidates whichever row was highlighted. Adjusting
  // during render rather than in an effect avoids a pass where the highlight
  // points at the wrong row.
  const [renderedResults, setRenderedResults] = useState(results);
  if (results !== renderedResults) {
    setRenderedResults(results);
    setActiveIndex(0);
  }

  // Keep the highlighted row visible when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(`${baseId}-option-${activeIndex}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, results, baseId]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function select(suggestion: Suggestion) {
    setSelected(suggestion);
    setQuery(suggestion.name);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (results.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => (current + step + results.length) % results.length);
        return;
      }
      case "Enter": {
        if (!open) return;
        const suggestion = results[activeIndex];
        if (!suggestion) return;
        event.preventDefault();
        select(suggestion);
        return;
      }
      case "Escape": {
        event.preventDefault();
        // First Escape dismisses the list, a second clears the field.
        if (open) setOpen(false);
        else setQuery("");
        return;
      }
      case "Tab": {
        setOpen(false);
      }
    }
  }

  const showList = open && query.trim().length > 0;
  const isEmpty = status === "ready" && results.length === 0;
  // Results already on screen during a refetch are stale but still useful.
  const isStale = status === "loading" && results.length > 0;

  return (
    <div className="w-full">
      <label htmlFor={baseId} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Search countries
      </label>

      <div ref={containerRef} className="relative mt-2">
        <input
          id={baseId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results.length > 0 ? optionId(activeIndex) : undefined}
          placeholder="Try “can”, “ottawa” or “CAN”"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setSelected(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-10 text-black outline-none placeholder:text-zinc-400 focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-400"
        />

        {status === "loading" && (
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
          />
        )}

        {showList && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            {status === "error" && (
              <p className="px-3 py-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            {isEmpty && (
              <p className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                No countries match “{query.trim()}”.
              </p>
            )}

            {status === "loading" && results.length === 0 && (
              <p className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">Searching…</p>
            )}

            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Country suggestions"
              className={`max-h-72 overflow-y-auto ${isStale ? "opacity-60" : ""}`}
            >
              {results.map((suggestion, index) => (
                <li
                  key={suggestion.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  onPointerDown={(event) => {
                    // Beat the input's blur so the click isn't lost.
                    event.preventDefault();
                    select(suggestion);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                    index === activeIndex ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  <span aria-hidden="true" className="text-xl">
                    {suggestion.flag}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-black dark:text-zinc-50">
                      {suggestion.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {suggestion.capital ?? suggestion.region}
                      {suggestion.matchedOn && ` · matched “${suggestion.matchedOn}”`}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{suggestion.code}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Screen readers get result counts without a visual change. */}
      <p aria-live="polite" className="sr-only">
        {status === "ready" ? `${results.length} suggestions available.` : ""}
      </p>

      {selected && (
        <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <Detail label="Country" value={`${selected.flag} ${selected.name}`} />
          <Detail label="Official name" value={selected.official} />
          <Detail label="Capital" value={selected.capital ?? "—"} />
          <Detail label="Region" value={selected.region || "—"} />
        </dl>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="truncate text-sm text-black dark:text-zinc-50">{value}</dd>
    </div>
  );
}
