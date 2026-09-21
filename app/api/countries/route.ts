import { rankCountries, type Suggestion, type UpstreamResponse } from "@/lib/countries";

const UPSTREAM = "https://api.restcountries.com/countries/v5";


const CANDIDATE_LIMIT = 100;
const MAX_RESULTS = 8;
const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 500;

type CacheEntry = { expires: number; results: Suggestion[] };

const cache = new Map<string, CacheEntry>();

function readCache(key: string): Suggestion[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }

  cache.delete(key);
  cache.set(key, hit);
  return hit.results;
}

function writeCache(key: string, results: Suggestion[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, results });
}

function json(body: unknown, status: number, cacheable: boolean) {
  return Response.json(body, {
    status,
    headers: cacheable
      ? { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" }
      : { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const apiKey = process.env.RESTCOUNTRIES_API_KEY;
  if (!apiKey) {
    console.error("RESTCOUNTRIES_API_KEY is not set");
    return json({ error: "Search is not configured." }, 500, false);
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (query.length === 0) return json({ results: [] }, 200, false);

  const key = query.toLowerCase();
  const cached = readCache(key);
  if (cached) return json({ results: cached }, 200, true);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${UPSTREAM}?q=${encodeURIComponent(query)}&limit=${CANDIDATE_LIMIT}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("Upstream country search failed", error);
    return json(
      { error: timedOut ? "Search timed out." : "Search is unavailable." },
      timedOut ? 504 : 502,
      false,
    );
  }

  if (!upstream.ok) {
    console.error(`Upstream country search returned ${upstream.status}`);
    return json({ error: "Search is unavailable." }, 502, false);
  }

  const body = (await upstream.json()) as UpstreamResponse;
  const results = rankCountries(body.data?.objects ?? [], query, MAX_RESULTS);

  writeCache(key, results);
  return json({ results }, 200, true);
}
