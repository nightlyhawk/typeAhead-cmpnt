import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountrySearch } from "./country-search";
import type { Suggestion } from "@/lib/countries";

function suggestion(name: string, code: string): Suggestion {
  return {
    id: code,
    name,
    official: `The ${name}`,
    code: code.slice(0, 2),
    flag: "🏳️",
    region: "Region",
    capital: "Capital",
    matchedOn: null,
  };
}

function ok(results: Suggestion[]) {
  return { ok: true, json: async () => ({ results }) } as Response;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CountrySearch", () => {
  it("debounces: a burst of keystrokes issues one request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(ok([suggestion("Canada", "CAN")]));
    vi.stubGlobal("fetch", fetchMock);

    render(<CountrySearch />);
    const input = screen.getByRole("combobox");

    for (const value of ["c", "ca", "can"]) {
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        vi.advanceTimersByTime(100); // each below the 250ms debounce
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("q=can");
    vi.useRealTimers();
  });

  it("discards a stale response that resolves after a newer one", async () => {
    vi.useFakeTimers();

    // Two deferred responses so we control the resolution order by hand.
    let resolveFirst!: (value: Response) => void;
    let resolveSecond!: (value: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveFirst = r)))
      .mockImplementationOnce(() => new Promise<Response>((r) => (resolveSecond = r)));
    vi.stubGlobal("fetch", fetchMock);

    render(<CountrySearch />);
    const input = screen.getByRole("combobox");

    // Request 1 for "chad" goes out...
    fireEvent.change(input, { target: { value: "chad" } });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    // ...then request 2 for "canada", before request 1 has come back.
    fireEvent.change(input, { target: { value: "canada" } });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The newer request lands first.
    await act(async () => {
      resolveSecond(ok([suggestion("Canada", "CAN")]));
    });
    expect(screen.getByRole("option", { name: /Canada/ })).toBeInTheDocument();

    // The older, slower request lands second. It must not overwrite the list.
    await act(async () => {
      resolveFirst(ok([suggestion("Chad", "TCD")]));
    });

    expect(screen.queryByRole("option", { name: /Chad/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Canada/ })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("navigates with the keyboard and selects with Enter", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ok([suggestion("Canada", "CAN"), suggestion("Chad", "TCD")])),
    );

    render(<CountrySearch />);
    const input = screen.getByRole("combobox");
    await user.type(input, "c");

    const first = await screen.findByRole("option", { name: /Canada/ });
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", first.id);

    await user.keyboard("{ArrowDown}");
    const second = screen.getByRole("option", { name: /Chad/ });
    await waitFor(() => expect(second).toHaveAttribute("aria-selected", "true"));
    expect(input).toHaveAttribute("aria-activedescendant", second.id);

    // Wrapping keeps a keyboard user from getting stuck at the end.
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(first).toHaveAttribute("aria-selected", "true"));

    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(input).toHaveValue("Chad"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape, then clears the field on a second Escape", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([suggestion("Canada", "CAN")])));

    render(<CountrySearch />);
    const input = screen.getByRole("combobox");
    await user.type(input, "can");
    await screen.findByRole("option", { name: /Canada/ });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("can");

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("reports an empty result set rather than an empty dropdown", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok([])));

    render(<CountrySearch />);
    await user.type(screen.getByRole("combobox"), "zzzz");

    expect(await screen.findByText(/No countries match/)).toBeInTheDocument();
  });

  it("surfaces the server's error message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Search timed out." }),
      } as Response),
    );

    render(<CountrySearch />);
    await user.type(screen.getByRole("combobox"), "can");

    expect(await screen.findByText("Search timed out.")).toBeInTheDocument();
  });

  it("keeps the previous results visible while the next request is in flight", async () => {
    const user = userEvent.setup();
    let resolveNext!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(ok([suggestion("Canada", "CAN")]))
        .mockImplementationOnce(() => new Promise<Response>((r) => (resolveNext = r))),
    );

    render(<CountrySearch />);
    const input = screen.getByRole("combobox");
    await user.type(input, "can");
    await screen.findByRole("option", { name: /Canada/ });

    await user.type(input, "a");

    // Still on screen, dimmed, rather than a blank flash at ~1s per request.
    await waitFor(() => expect(resolveNext).toBeDefined());
    expect(screen.getByRole("option", { name: /Canada/ })).toBeInTheDocument();
  });
});
