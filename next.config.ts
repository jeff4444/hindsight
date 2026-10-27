import type { NextConfig } from "next";

/**
 * Old URLs, kept working.
 *
 * Hindsight was a chart-reading game before it was a trading platform. Its pages are gone, and
 * every link to them already in the wild — a bookmarked daily, a tape sent to a friend, a duel —
 * lands on the page that does that job now rather than on a 404. A tape became a scenario, so a
 * tape link opens Markets with that scenario picked out.
 *
 * The renames that predate the platform stay permanent. The retirements are not: these paths are
 * free to mean something again, and a browser that cached a 308 for one would never find out.
 */
const RETIRED: [source: string, destination: string][] = [
  ["/today", "/markets"],
  ["/you", "/portfolio"],
  ["/ranks", "/leaderboard"],
  ["/manage", "/markets"],
  ["/play/:path*", "/markets"],
  ["/versus/:path*", "/markets"],
  // Before `/tapes/:slug`, which would otherwise read these as tape names.
  ["/tapes/new", "/markets#scenarios"],
  ["/tapes/mine", "/markets#scenarios"],
  ["/tapes/:slug/:rest*", "/markets?scenario=:slug"],
  ["/tapes", "/markets#scenarios"],
];

export const REDIRECTS = [
  { source: "/home", destination: "/markets", permanent: true },
  { source: "/stats", destination: "/portfolio", permanent: true },
  { source: "/rules", destination: "/learn/rulebook", permanent: true },
  ...RETIRED.map(([source, destination]) => ({ source, destination, permanent: false })),
];

const nextConfig: NextConfig = {
  async redirects() {
    return REDIRECTS;
  },
};

export default nextConfig;
