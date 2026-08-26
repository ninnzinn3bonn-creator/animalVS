import type { CharacterDefinition } from "./CharacterTypes";

function svgDataUrl(label: string, fill: string, accent: string): string {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 360">
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#000" flood-opacity=".25"/>
    </filter>
    <g filter="url(#s)">
      <path d="M122 20c42 0 75 32 75 72 0 23-11 43-28 56 35 14 60 49 60 91v58c0 21-17 38-38 38H69c-21 0-38-17-38-38v-58c0-42 25-77 60-91-18-13-29-33-29-56 0-40 28-72 60-72z" fill="${fill}"/>
      <path d="M85 198c25 17 65 17 91 0v96H85z" fill="${accent}" opacity=".42"/>
      <circle cx="105" cy="88" r="10" fill="#17202a"/>
      <circle cx="154" cy="88" r="10" fill="#17202a"/>
      <path d="M98 123c22 18 43 18 64 0" fill="none" stroke="#17202a" stroke-width="9" stroke-linecap="round"/>
      <text x="130" y="282" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#fff">${label}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const demoCharacters: CharacterDefinition[] = [
  {
    id: "demo-hiro",
    name: "Hiro",
    enabled: true,
    spriteUrl: svgDataUrl("P1", "#2f80ed", "#56ccf2"),
    width: 260,
    height: 360,
    collisionMode: "convexHull",
    vertices: [
      { x: -0.36, y: -0.45 },
      { x: 0.28, y: -0.47 },
      { x: 0.43, y: -0.12 },
      { x: 0.39, y: 0.43 },
      { x: -0.34, y: 0.45 },
      { x: -0.44, y: -0.05 }
    ],
    createdAt: new Date(0).toISOString()
  },
  {
    id: "demo-ren",
    name: "Ren",
    enabled: true,
    spriteUrl: svgDataUrl("P2", "#27ae60", "#f2c94c"),
    width: 260,
    height: 360,
    collisionMode: "convexHull",
    vertices: [
      { x: -0.31, y: -0.48 },
      { x: 0.34, y: -0.43 },
      { x: 0.44, y: 0.11 },
      { x: 0.29, y: 0.47 },
      { x: -0.41, y: 0.42 },
      { x: -0.46, y: -0.16 }
    ],
    createdAt: new Date(0).toISOString()
  },
  {
    id: "demo-aki",
    name: "Aki",
    enabled: true,
    spriteUrl: svgDataUrl("P3", "#eb5757", "#f2994a"),
    width: 260,
    height: 360,
    collisionMode: "convexHull",
    vertices: [
      { x: -0.24, y: -0.5 },
      { x: 0.41, y: -0.34 },
      { x: 0.38, y: 0.38 },
      { x: 0.05, y: 0.49 },
      { x: -0.4, y: 0.35 },
      { x: -0.45, y: -0.2 }
    ],
    createdAt: new Date(0).toISOString()
  }
];
