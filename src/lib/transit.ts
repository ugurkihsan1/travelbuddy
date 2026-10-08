import type { LiveArrivalState, TransitArrival } from "../types";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_DATA_AGE_MS = 3 * 60_000;
const MAX_FUTURE_SKEW_MS = 30_000;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function configuredEndpoint(): string {
  const endpoint: unknown = import.meta.env.VITE_TRANSIT_API_URL;
  return typeof endpoint === "string" ? endpoint.trim() : "";
}

export function hasLiveTransit(): boolean {
  return configuredEndpoint().length > 0;
}

function errorState(message: string): LiveArrivalState {
  return { status: "error", arrivals: [], message };
}

function parseArrival(value: unknown, now: number): TransitArrival {
  if (typeof value !== "object" || value === null)
    throw new Error("invalid-data");
  const arrival = value as Record<string, unknown>;
  if (
    typeof arrival.line !== "string" ||
    !arrival.line.trim() ||
    typeof arrival.destination !== "string" ||
    !arrival.destination.trim() ||
    typeof arrival.minutes !== "number" ||
    !Number.isFinite(arrival.minutes) ||
    arrival.minutes < 0 ||
    typeof arrival.updatedAt !== "string" ||
    !ISO_TIMESTAMP.test(arrival.updatedAt)
  )
    throw new Error("invalid-data");

  const timestamp = Date.parse(arrival.updatedAt);
  if (!Number.isFinite(timestamp)) throw new Error("invalid-data");
  if (
    now - timestamp > MAX_DATA_AGE_MS ||
    timestamp - now > MAX_FUTURE_SKEW_MS
  ) {
    throw new Error("stale-data");
  }

  return {
    line: arrival.line.trim(),
    destination: arrival.destination.trim(),
    minutes: Math.ceil(arrival.minutes),
    updatedAt: arrival.updatedAt,
  };
}

/**
 * The configured service is a public, read-only backend adapter, never a provider
 * API key in the browser. It must resolve the official stop ID and return fresh
 * arrivals; an absent provider is deliberately not replaced by simulated data.
 */
export async function fetchArrivals(
  stopId: string,
  signal?: AbortSignal,
): Promise<LiveArrivalState> {
  const endpoint = configuredEndpoint();
  if (!endpoint) {
    return {
      status: "unconfigured",
      arrivals: [],
      message: "Live bus arrivals are not connected yet.",
    };
  }
  if (!stopId.trim())
    return errorState("Choose a bus stop to see live arrivals.");
  if (signal?.aborted) return errorState("Arrival request cancelled.");

  let url: URL;
  try {
    const origin =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    url = new URL(endpoint, origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return errorState("The live arrival service URL is invalid.");
    }
    url.searchParams.set("stopId", stopId.trim());
  } catch {
    return errorState("The live arrival service URL is invalid.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok)
      return errorState(
        "Live arrivals are temporarily unavailable. Try again.",
      );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("invalid-data");
    }
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("arrivals" in payload)
    ) {
      throw new Error("invalid-data");
    }
    const values = (payload as Record<string, unknown>).arrivals;
    if (!Array.isArray(values)) throw new Error("invalid-data");
    const now = Date.now();
    const arrivals = values
      .map((value) => parseArrival(value, now))
      .sort((a, b) => a.minutes - b.minutes);
    return {
      status: "available",
      arrivals,
      message: arrivals.length
        ? undefined
        : "No upcoming arrivals were reported for this stop.",
    };
  } catch (error) {
    if (timedOut)
      return errorState("The live arrival service took too long. Try again.");
    if (signal?.aborted) return errorState("Arrival request cancelled.");
    if (error instanceof Error && error.message === "invalid-data") {
      return errorState(
        "The service returned invalid arrival data. Try again.",
      );
    }
    if (error instanceof Error && error.message === "stale-data") {
      return errorState(
        "The arrival service returned outdated data. Try again.",
      );
    }
    return errorState("Live arrivals are temporarily unavailable. Try again.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
