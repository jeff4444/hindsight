import type { NextConfig } from "next";

/**
 * Old URLs, kept working.
 *
 * Hindsight was a chart-reading game, then a trading platform, and is a game again (docs/rules.md
 * §23). Every link to a page that is gone — a bookmarked daily, a market, a portfolio, a school's
 * account — lands on the page that does that job now rather than on a 404: Play for anything you
 * played or traded, Schools for anything about the schools.
 *
 * The renames that predate the platform stay permanent. The retirements are not: these paths are
 * free to mean something again, and a browser that cached a 308 for one would never find out —
 * which is exactly what happened to `/play`, retired by the platform and reclaimed by the game.
 */
const RETIRED: [source: string, destination: string][] = [
  // The first game's pages. `/play/<uuid>` is a round now, so only the old mode names go.
  ["/today", "/play"],
  ["/you", "/play"],
  ["/ranks", "/play"],
  ["/manage", "/play"],
  ["/play/daily", "/play"],
  ["/play/ranked", "/play"],
  ["/play/tape/:path*", "/play"],
  ["/play/manage/:path*", "/play"],
  ["/play/duel/:path*", "/play"],
  ["/versus/:path*", "/play"],
  ["/tapes/:path*", "/play"],
  // The trading platform's pages (§23.9).
  ["/markets", "/play"],
  ["/portfolio", "/play"],
  ["/leaderboard", "/play"],
  ["/trade/:path*", "/play"],
  ["/strategies/:path*", "/schools"],
  // The retired schools' dossier; their measurements stay in the rulebook's §14.
  ["/learn/methods", "/schools"],
];

export const REDIRECTS = [
  { source: "/home", destination: "/play", permanent: true },
  { source: "/stats", destination: "/play", permanent: true },
  { source: "/rules", destination: "/learn/rulebook", permanent: true },
  ...RETIRED.map(([source, destination]) => ({ source, destination, permanent: false })),
];

const nextConfig: NextConfig = {
  async redirects() {
    return REDIRECTS;
  },
};

export default nextConfig;
