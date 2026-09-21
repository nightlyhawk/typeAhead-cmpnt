import { describe, expect, it } from "vitest";
import { rankCountries } from "./countries";

/**
 * Minimal stand-ins shaped like the upstream payload. The `_match` array is
 * what the ranker actually reads.
 */
function country(name: string, alpha3: string, match: { path: string; value: string }[]) {
  return {
    names: { common: name, official: `The ${name}` },
    codes: { alpha_2: alpha3.slice(0, 2), alpha_3: alpha3 },
    capitals: [{ name: "Capital", primary: true }],
    flag: { emoji: "🏳️" },
    region: "Region",
    _match: match,
  };
}

describe("rankCountries", () => {
  it("puts a name match above a flag-description match", () => {
    // The real failure this guards: `q=can` returns Anguilla second, because
    // its flag description contains "the canton".
    const results = rankCountries(
      [
        country("Anguilla", "AIA", [
          { path: "flag.description", value: "…the Union Jack in the canton…" },
        ]),
        country("Canada", "CAN", [{ path: "names.common", value: "Canada" }]),
      ],
      "can",
      8,
    );

    expect(results.map((r) => r.name)).toEqual(["Canada", "Anguilla"]);
  });

  it("ranks exact over prefix over substring", () => {
    const results = rankCountries(
      [
        country("Vatican City", "VAT", [{ path: "names.common", value: "Vatican City" }]),
        country("Canada", "CAN", [{ path: "names.common", value: "Canada" }]),
        country("Can", "XCA", [{ path: "names.common", value: "Can" }]),
      ],
      "can",
      8,
    );

    expect(results.map((r) => r.name)).toEqual(["Can", "Canada", "Vatican City"]);
  });

  it("drops a country when none of its recorded matches contain the query", () => {
    const results = rankCountries(
      [country("Austria", "AUT", [{ path: "currencies[0].name", value: "Euro" }])],
      "can",
      8,
    );

    expect(results).toEqual([]);
  });

  it("keeps an incidental substring hit, but ranks it below a name hit", () => {
    // "West Afri(can) CFA franc" genuinely contains the query — this is why a
    // naive pass-through shows Benin when you type "can".
    const results = rankCountries(
      [
        country("Benin", "BEN", [
          { path: "currencies[0].name", value: "West African CFA franc" },
        ]),
        country("Canada", "CAN", [{ path: "names.common", value: "Canada" }]),
      ],
      "can",
      8,
    );

    expect(results.map((r) => r.name)).toEqual(["Canada", "Benin"]);
  });

  it("explains non-name matches and stays silent on name matches", () => {
    // Canada ranks first: an exact `alpha_3` hit on "CAN" outscores "Canberra".
    const [canada, australia] = rankCountries(
      [
        country("Australia", "AUS", [{ path: "capitals[0].name", value: "Canberra" }]),
        country("Canada", "CAN", [
          { path: "codes.alpha_3", value: "CAN" },
          { path: "names.common", value: "Canada" },
        ]),
      ],
      "can",
      8,
    );

    expect(canada.matchedOn).toBeNull();
    expect(australia.matchedOn).toBe("Canberra");
  });

  it("projects away the bulk of the upstream record", () => {
    const [result] = rankCountries(
      [country("Canada", "CAN", [{ path: "names.common", value: "Canada" }])],
      "canada",
      8,
    );

    expect(Object.keys(result).sort()).toEqual([
      "capital",
      "code",
      "flag",
      "id",
      "matchedOn",
      "name",
      "official",
      "region",
    ]);
  });
});
