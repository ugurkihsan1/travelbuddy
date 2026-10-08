import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArrivals, hasLiveTransit } from "./transit";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const freshArrival = {
  line: "28",
  destination: "Beşiktaş",
  minutes: 4,
  updatedAt: NOW.toISOString(),
};

describe("live transit adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv(
      "VITE_TRANSIT_API_URL",
      "https://transit.example.test/arrivals?city=istanbul",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps arrivals unavailable when no live provider is configured", async () => {
    vi.stubEnv("VITE_TRANSIT_API_URL", "   ");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(hasLiveTransit()).toBe(false);
    expect(await fetchArrivals("12345")).toMatchObject({
      status: "unconfigured",
      arrivals: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the stop identifier and displays only fresh, sorted arrivals", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          arrivals: [
            { ...freshArrival, line: "30D", minutes: 7.2 },
            { ...freshArrival, minutes: 2, updatedAt: "2026-10-08T11:59:00Z" },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(hasLiveTransit()).toBe(true);
    const state = await fetchArrivals("  stop/123  ");
    expect(state.status).toBe("available");
    expect(state.arrivals.map((arrival) => arrival.minutes)).toEqual([2, 8]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get("stopId")).toBe("stop/123");
    expect(new URL(url).searchParams.get("city")).toBe("istanbul");
    expect(options.credentials).toBe("omit");
    expect(options.cache).toBe("no-store");
  });

  it("accepts an empty provider result without inventing a bus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ arrivals: [] }))),
    );
    expect(await fetchArrivals("12345")).toMatchObject({
      status: "available",
      arrivals: [],
      message: expect.stringContaining("No upcoming arrivals"),
    });
  });

  it.each([
    null,
    { arrivals: "not an array" },
    { arrivals: [{ ...freshArrival, minutes: -1 }] },
    { arrivals: [{ ...freshArrival, minutes: "4" }] },
    { arrivals: [{ ...freshArrival, line: "" }] },
    { arrivals: [{ ...freshArrival, updatedAt: "not a date" }] },
    { arrivals: [freshArrival, { ...freshArrival, destination: null }] },
  ])("rejects malformed provider payloads: %j", async (payload) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
    );
    const state = await fetchArrivals("12345");
    expect(state).toMatchObject({
      status: "error",
      arrivals: [],
      message: expect.stringContaining("invalid arrival data"),
    });
  });

  it.each(["2026-10-08T11:56:59Z", "2026-10-08T12:00:31Z"])(
    "rejects stale or implausibly future data: %s",
    async (updatedAt) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ arrivals: [{ ...freshArrival, updatedAt }] }),
            ),
          ),
      );
      expect(await fetchArrivals("12345")).toMatchObject({
        status: "error",
        arrivals: [],
        message: expect.stringContaining("outdated data"),
      });
    },
  );

  it("reports HTTP and network failures without stale fallback arrivals", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockRejectedValueOnce(new TypeError("Network connection lost"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchArrivals("12345")).toMatchObject({
      status: "error",
      arrivals: [],
    });
    expect(await fetchArrivals("12345")).toMatchObject({
      status: "error",
      arrivals: [],
    });
  });

  it("does not request a missing stop or an unsafe endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchArrivals("  ")).status).toBe("error");
    vi.stubEnv("VITE_TRANSIT_API_URL", "javascript:alert(1)");
    expect((await fetchArrivals("12345")).status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects cancellation before a request starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchArrivals("12345", controller.signal)).toMatchObject({
      status: "error",
      arrivals: [],
      message: "Arrival request cancelled.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards an in-flight abort to the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const controller = new AbortController();
    const pending = fetchArrivals("12345", controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({
      status: "error",
      arrivals: [],
      message: "Arrival request cancelled.",
    });
  });

  it("times out a slow provider and closes the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const pending = fetchArrivals("12345");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({
      status: "error",
      arrivals: [],
      message: expect.stringContaining("took too long"),
    });
  });
});
