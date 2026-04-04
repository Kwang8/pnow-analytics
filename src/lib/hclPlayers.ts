// Famous HCL / livestream poker players with approximate VPIP/PFR stats
// Sources: highrollpoker.com tracker, poker community consensus, published articles
// Stats are approximate lifetime averages from televised/streamed sessions

export interface HCLPlayer {
  name: string;
  nickname: string;
  vpip: number;
  pfr: number;
  photo: string;
  style: string;
  note: string;
}

export const HCL_PLAYERS: HCLPlayer[] = [
  {
    name: 'Garrett Adelstein',
    nickname: 'GMan',
    vpip: 31,
    pfr: 23,
    photo: 'https://unavatar.io/x/GmanPoker',
    style: 'TAG',
    note: 'HCL resident shark. One of the best live cash game players alive.',
  },
  {
    name: 'Alan Keating',
    nickname: 'Keating',
    vpip: 55,
    pfr: 20,
    photo: 'https://unavatar.io/x/alan_keating1',
    style: 'Maniac',
    note: 'Highest VPIP in HCL history. Plays any two cards with a smile.',
  },
  {
    name: 'Nik Airball',
    nickname: 'Airball',
    vpip: 45,
    pfr: 30,
    photo: 'https://unavatar.io/x/NikAirball',
    style: 'LAG',
    note: 'Ultra-aggressive high-stakes reg. Massive swings, massive action.',
  },
  {
    name: 'Wesley Fei',
    nickname: 'Wesley',
    vpip: 48,
    pfr: 22,
    photo: 'https://unavatar.io/x/WesleyFeiPoker',
    style: 'LAG',
    note: 'Crypto millionaire turned poker entertainer. Has tightened up over time.',
  },
  {
    name: 'Handz',
    nickname: 'Handz',
    vpip: 38,
    pfr: 15,
    photo: 'https://unavatar.io/x/HandzPoker',
    style: 'Loose-Passive',
    note: 'Action player who loves to see flops. Crypto wealth fuels the game.',
  },
  {
    name: 'Doug Polk',
    nickname: 'Polk',
    vpip: 24,
    pfr: 20,
    photo: 'https://unavatar.io/x/DougPolkVids',
    style: 'TAG',
    note: 'GTO crusher and poker content king. Lodge Poker owner.',
  },
  {
    name: 'Phil Ivey',
    nickname: 'Ivey',
    vpip: 28,
    pfr: 22,
    photo: 'https://unavatar.io/x/PhilIvey',
    style: 'TAG',
    note: 'The GOAT. 11 WSOP bracelets. Reads souls at the table.',
  },
  {
    name: 'Tom Dwan',
    nickname: 'durrrr',
    vpip: 32,
    pfr: 24,
    photo: 'https://unavatar.io/x/tomduwan',
    style: 'LAG',
    note: 'Online legend turned high-stakes live crusher. Fearless aggression.',
  },
  {
    name: 'Daniel Negreanu',
    nickname: 'DNegs',
    vpip: 30,
    pfr: 18,
    photo: 'https://unavatar.io/x/RealKidPoker',
    style: 'TAG',
    note: '6x WSOP bracelet winner. Small ball poker pioneer.',
  },
  {
    name: 'Mariano Grandoli',
    nickname: 'King Argentina',
    vpip: 42,
    pfr: 15,
    photo: 'https://unavatar.io/x/kingargentina',
    style: 'Loose-Passive',
    note: 'Vlogger turned high-stakes crusher. $2.6M+ in tracked profits.',
  },
  {
    name: 'Britney Jing',
    nickname: 'Britney',
    vpip: 32,
    pfr: 12,
    photo: 'https://unavatar.io/x/AllInBritney',
    style: 'Loose-Passive',
    note: 'Wild animal trainer and HCL fan favorite on Max Pain Monday.',
  },
  {
    name: 'Randy Sadler',
    nickname: '3Coin',
    vpip: 35,
    pfr: 12,
    photo: 'https://unavatar.io/x/3coinpoker',
    style: 'Loose-Passive',
    note: 'Flamboyant fashion and unorthodox play. Rising HCL fan favorite.',
  },
  {
    name: 'Andy Stacks',
    nickname: 'Andy',
    vpip: 26,
    pfr: 20,
    photo: 'https://unavatar.io/x/AndyStacksPoker',
    style: 'TAG',
    note: 'Consistent winning player on HCL. Solid fundamentals.',
  },
  {
    name: 'Lynne Ji',
    nickname: 'Lynne',
    vpip: 30,
    pfr: 14,
    photo: 'https://unavatar.io/x/LynneJiPoker',
    style: 'Moderate',
    note: 'High-stakes regular. Known for creative lines and big plays.',
  },
];

/**
 * Find the HCL player most similar to the given VPIP/PFR using Euclidean distance.
 */
export function findMostSimilarHCL(vpip: number, pfr: number): { player: HCLPlayer; distance: number; similarity: number } {
  let bestPlayer = HCL_PLAYERS[0];
  let bestDist = Infinity;

  for (const p of HCL_PLAYERS) {
    const dist = Math.sqrt((vpip - p.vpip) ** 2 + (pfr - p.pfr) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      bestPlayer = p;
    }
  }

  // Convert distance to a 0-100 similarity score (max reasonable distance ~50)
  const similarity = Math.max(0, Math.min(100, 100 - (bestDist / 50) * 100));

  return { player: bestPlayer, distance: bestDist, similarity };
}
