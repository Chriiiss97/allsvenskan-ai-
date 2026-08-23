import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gör det möjligt att bygga ett produktionsbygge (för prestandamätning)
  // medan `next dev` kör — de kan annars inte dela `.next`. Se .gitignore:
  // katalogen MÅSTE vara ignorerad, annars skannar Tailwind den som källkod.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Fas 14.1 (total redesign, plans/humble-giggling-biscuit.md) döpte om
  // /data/** till kortare toppnivå-URL:er (/matcher, /lag, /spelare) och
  // flyttade /data/scout in i en egen (scout)-route-grupp (/scout/spelare).
  // Fas 14.4 flyttade i sin tur BÅDA jämförelsesidorna (/spelare/compare,
  // /lag/compare) in i en enda /scout/compare (Compare är en uttalad Scout
  // Premium-funktion, se planens sitemap). Permanenta redirects så gamla
  // bokmärken/delade länkar och ev. externa referenser fortsätter fungera.
  // Specifika/statiska källor listas FÖRE de dynamiska :id-varianterna —
  // Next.js matchar första träffen i ordning.
  async redirects() {
    return [
      { source: "/data/matches/:id", destination: "/matcher/:id", permanent: true },
      { source: "/data/matches", destination: "/matcher", permanent: true },
      { source: "/data/teams/compare", destination: "/scout/compare?mode=lag", permanent: true },
      { source: "/data/teams/:id", destination: "/lag/:id", permanent: true },
      { source: "/data/teams", destination: "/lag", permanent: true },
      { source: "/data/players/compare", destination: "/scout/compare?mode=spelare", permanent: true },
      { source: "/data/players/rankings", destination: "/spelare/rankings", permanent: true },
      { source: "/data/players/:id", destination: "/spelare/:id", permanent: true },
      { source: "/data/players", destination: "/spelare", permanent: true },
      { source: "/data/scout", destination: "/scout/spelare", permanent: true },
      { source: "/spelare/compare", destination: "/scout/compare?mode=spelare", permanent: true },
      { source: "/lag/compare", destination: "/scout/compare?mode=lag", permanent: true },
    ];
  },
};

export default nextConfig;
