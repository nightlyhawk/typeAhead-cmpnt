"use client";

import { useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/countries";

const DEBOUNCE_MS = 250;

// Stable identity: a fresh `[]` each render would invalidate consumers' memos.
const NO_RESULTS: Suggestion[] = [];

export type TypeaheadStatus = "idle" | "loading" | "ready" | "error";

export type TypeaheadState = {
  results: Suggestion[];
  status: TypeaheadStatus;
  error: string | null;
};

/** The last response actually received, tagged with the query it answered. */
type Settled = TypeaheadState & { query: string };

const INITIAL: Settled = { query: "", results: NO_RESULTS, status: "idle", error: null };

export function useTypeahead(query: string): TypeaheadState {
  const [settled, setSettled] = useState<Settled>(INITIAL);

  // Monotonic id of the most recently started request.
  const latestRequest = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length === 0) {
      // Invalidate anything in flight; the idle state is derived below.
      latestRequest.current += 1;
      return;
    }

    const requestId = (latestRequest.current += 1);
    const controller = new AbortController();

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/countries?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
          });
          const body = (await response.json()) as { results?: Suggestion[]; error?: string };

          if (requestId !== latestRequest.current) return;

          setSettled(
            response.ok
              ? {
                  query: trimmed,
                  results: body.results ?? NO_RESULTS,
                  status: "ready",
                  error: null,
                }
              : {
                  query: trimmed,
                  results: NO_RESULTS,
                  status: "error",
                  error: body.error ?? "Something went wrong.",
                },
          );
        } catch (error) {
          if (controller.signal.aborted) return;
          if (requestId !== latestRequest.current) return;

          setSettled({
            query: trimmed,
            results: NO_RESULTS,
            status: "error",
            error:
              error instanceof Error && error.name === "TypeError"
                ? "You appear to be offline."
                : "Something went wrong.",
          });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  if (trimmed.length === 0) {
    return { results: NO_RESULTS, status: "idle", error: null };
  }

  if (settled.query === trimmed) {
    return { results: settled.results, status: settled.status, error: settled.error };
  }

  return { results: settled.results, status: "loading", error: null };
}
