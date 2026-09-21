export type Suggestion = {
  id: string;
  name: string;
  official: string;
  code: string;
  flag: string;
  region: string;
  capital: string | null;
  matchedOn: string | null;
};

type Match = { path: string; value: string };

type UpstreamCountry = {
  names: { common: string; official: string };
  codes: { alpha_2: string; alpha_3: string };
  capitals?: { name: string; primary?: boolean }[];
  flag?: { emoji?: string };
  region?: string;
  _match?: Match[];
};

export type UpstreamResponse = {
  data: { objects: UpstreamCountry[] };
};

/** How much we trust a match, by the field path it landed on. */
const PATH_WEIGHTS: [RegExp, number][] = [
  [/^names\.common$/, 100],
  [/^names\.official$/, 80],
  [/^codes\.alpha_[23]$/, 75],
  [/^names\.native\.[^.]+\.common$/, 60],
  [/^capitals\[\d+\]\.name$/, 50],
  [/^codes\./, 40],
  [/^demonyms\./, 30],
  [/^names\.translations\./, 20],
  [/^(currencies|languages)\[\d+\]\./, 15],
  // Prose fields match almost anything; keep them as a last resort only.
  [/^(flag|descriptions)\./, 1],
];

const DEFAULT_WEIGHT = 10;

function weightFor(path: string): number {
  for (const [pattern, weight] of PATH_WEIGHTS) {
    if (pattern.test(path)) return weight;
  }
  return DEFAULT_WEIGHT;
}

function positionMultiplier(value: string, query: string): number {
  const haystack = value.toLowerCase();
  if (haystack === query) return 3;
  if (haystack.startsWith(query)) return 2;
  if (haystack.includes(query)) return 1;
  return 0;
}

function scoreMatch(match: Match, query: string): number {
  return weightFor(match.path) * positionMultiplier(match.value, query);
}

const NAME_PATH = /^names\.(common|official)$/;

function bestMatch(country: UpstreamCountry, query: string): Match | null {
  let best: Match | null = null;
  let bestScore = 0;
  for (const match of country._match ?? []) {
    const score = scoreMatch(match, query);
    if (score > bestScore) {
      bestScore = score;
      best = match;
    }
  }
  return best;
}

function score(country: UpstreamCountry, query: string): number {
  let highest = 0;
  for (const match of country._match ?? []) {
    highest = Math.max(highest, scoreMatch(match, query));
  }
  return highest;
}

function toSuggestion(country: UpstreamCountry, query: string): Suggestion {
  const best = bestMatch(country, query);
  // If the name itself matched, the row is self-explanatory — even when an
  // exact code hit ("CAN") outscored it.
  const nameMatched = (country._match ?? []).some(
    (m) => NAME_PATH.test(m.path) && positionMultiplier(m.value, query) > 0,
  );
  const capital = country.capitals?.find((c) => c.primary)?.name ?? country.capitals?.[0]?.name ?? null;

  return {
    id: country.codes.alpha_3,
    name: country.names.common,
    official: country.names.official,
    code: country.codes.alpha_2,
    flag: country.flag?.emoji ?? "",
    region: country.region ?? "",
    capital,
    // Only worth surfacing when the name alone doesn't explain the hit.
    matchedOn: !nameMatched && best ? best.value : null,
  };
}

export function rankCountries(
  countries: UpstreamCountry[],
  rawQuery: string,
  limit: number,
): Suggestion[] {
  const query = rawQuery.trim().toLowerCase();

  return countries
    .map((country) => ({ country, score: score(country, query) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        // Shorter names first: "Chad" over "Central African Republic" for "cha".
        a.country.names.common.length - b.country.names.common.length ||
        a.country.names.common.localeCompare(b.country.names.common),
    )
    .slice(0, limit)
    .map((entry) => toSuggestion(entry.country, query));
}
