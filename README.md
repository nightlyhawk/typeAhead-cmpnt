# Country typeahead

A debounced autocomplete over [restcountries.com](https://restcountries.com) v5, built with Next.js 16 (App Router), React 19 and Tailwind v4.

Search by name, capital, ISO code or demonym — try `can`, `ottawa` or `CAN`.

## Running it

```bash
npm install
cp .env.example .env.local   # then paste your key in
npm run dev
npm test
```

`RESTCOUNTRIES_API_KEY` is read only on the server. 

## Layout

| File | Role |
| --- | --- |
| [`app/api/countries/route.ts`](app/api/countries/route.ts) | Proxy: holds the key, caches, ranks, trims the payload |
| [`lib/countries.ts`](lib/countries.ts) | Relevance scoring and projection |
| [`components/use-typeahead.ts`](components/use-typeahead.ts) | Debounce, abort, stale-response guard |
| [`components/country-search.tsx`](components/country-search.tsx) | ARIA combobox, keyboard navigation |

## Write-up

**Tradeoffs.** The API 401s without a bearer token, so every request goes through a Next
route handler rather than the browser. First, `?q=`
is a full-text search across *every* field, returned alphabetically with no score: typing `can` puts American Samoa first and Canada twelfth — Anguilla ranks second
because its flag description contains "the canton". Each result carries a `_match` array
naming the fields that matched, so the proxy re-ranks on it: exact name beats prefix beats
code beats capital beats demonym, with prose fields scored near zero. Second, it projects
35-field, ~6KB-per-country records down to six fields, cutting a 159KB response to ~1.2KB.

On the client Debounce is 250ms; each keystroke aborts the in-flight
request *and* bumps a request id that the resolver re-checks before setting state. Both are
needed — `abort()` cannot unwind a response already queued as a microtask. Upstream TTFB
measured 0.75–1.9s, so previous results stay on screen, dimmed, instead of flashing empty.

**Scaling.** The proxy memoises per query behind a small LRU and sets `s-maxage`. This dataset is only 254 countries: at high traffic loading it
once, building an in-memory index, and serving searches with zero upstream calls would be preferable. Beyond that,
per-IP rate limiting and a circuit breaker.

**Testing.** Vitest and Testing Library, against behaviour not internals. One test proves a
burst of keystrokes issues a single request; another resolves two overlapping responses
deliberately out of order and asserts the stale one is discarded. The rest cover keyboard
navigation, Escape, and the empty and error states.
