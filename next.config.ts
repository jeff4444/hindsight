import type { NextConfig } from "next";

/**
 * Old URLs, kept working.
 *
 * The redesign moved every play mode from a query string to a path (`/play?mode=tape&tape=chop`
 * became `/play/tape/chop`) and renamed four destinations. Links already in the wild — a duel sent
 * last week, a bookmarked tape — redirect rather than 404. Query values carry through to the
 * destination automatically, so a legacy `tier=` still reaches the tape page that reads it.
 *
 * The renames are permanent. The `/play?mode=…` mappings are not marked permanent, because `/play`
 * itself is now the hub and a browser that cached a 308 for it would never see the hub again.
 */
const PLAY_MODES: [mode: string, destination: string][] = [
  ["daily", "/play/daily"],
  ["ranked", "/play/ranked"],
  ["storm", "/play/storm"],
  ["streak", "/play/survival"],
];

export const REDIRECTS = [
  { source: "/home", destination: "/today", permanent: true },
  { source: "/stats", destination: "/you", permanent: true },
  { source: "/rules", destination: "/learn/rulebook", permanent: true },
  { source: "/tapes/mine", destination: "/tapes?tab=yours", permanent: false },
  {
    source: "/manage",
    has: [{ type: "query" as const, key: "tape", value: "(?<tape>[^&]+)" }],
    destination: "/play/manage/:tape",
    permanent: false,
  },
  { source: "/manage", destination: "/play/manage/open", permanent: false },
  ...PLAY_MODES.map(([mode, destination]) => ({
    source: "/play",
    has: [{ type: "query" as const, key: "mode", value: mode }],
    destination,
    permanent: false,
  })),
  {
    source: "/play",
    has: [
      { type: "query" as const, key: "mode", value: "tape" },
      { type: "query" as const, key: "tape", value: "(?<tape>[^&]+)" },
    ],
    destination: "/play/tape/:tape",
    permanent: false,
  },
  {
    source: "/play",
    has: [{ type: "query" as const, key: "mode", value: "tape" }],
    destination: "/play/tape/open",
    permanent: false,
  },
  {
    source: "/play",
    has: [
      { type: "query" as const, key: "mode", value: "(?<kind>duel|race)" },
      { type: "query" as const, key: "match", value: "(?<id>[^&]+)" },
    ],
    destination: "/play/:kind/:id",
    permanent: false,
  },
];

const nextConfig: NextConfig = {
  async redirects() {
    return REDIRECTS;
  },
};

export default nextConfig;
