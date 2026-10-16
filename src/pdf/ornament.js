const MOTIF_W = 36;
const MOTIF_H = 22;

const LOCAL = [
  { d: "M 6 12 C 1 12 1 5 6 5 C 8.5 5 8.5 7.4 6.4 7.4", fill: "none", strokeWidth: 1.15 },
  { d: "M 30 12 C 35 12 35 5 30 5 C 27.5 5 27.5 7.4 29.6 7.4", fill: "none", strokeWidth: 1.15 },
  { d: "M 18 3 L 26 11 L 18 19 L 10 11 Z", fill: "color", strokeWidth: 0.6 },
  { d: "M 18 7 L 22 11 L 18 15 L 14 11 Z", fill: "paper", strokeWidth: 0.4 },
];

const CORNER = [
  { d: "M 11 2 L 20 11 L 11 20 L 2 11 Z", fill: "color", strokeWidth: 0.6 },
  { d: "M 11 6 L 16 11 L 11 16 L 6 11 Z", fill: "paper", strokeWidth: 0.4 },
];

function round(value) {
  return Math.round(value * 100) / 100;
}

function transformPath(d, map) {
  const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g);
  let index = 0;
  let out = "";
  const pair = () => {
    const [x, y] = map(Number(tokens[index]), Number(tokens[index + 1]));
    index += 2;
    return `${round(x)} ${round(y)}`;
  };
  while (index < tokens.length) {
    const op = tokens[index];
    index += 1;
    if (op === "Z" || op === "z") out += "Z";
    else if (op === "M" || op === "L") out += `${op}${pair()}`;
    else if (op === "C") out += `C${pair()} ${pair()} ${pair()}`;
  }
  return out;
}

function paint(paths, map, color, paper) {
  return paths.map((path) => ({
    d: transformPath(path.d, map),
    fill: path.fill === "color" ? color : path.fill === "paper" ? paper : "none",
    strokeWidth: path.strokeWidth,
  }));
}

function rails(width, height) {
  const inner = MOTIF_H - 1;
  return [
    { d: `M 1 1 H ${round(width - 1)} V ${round(height - 1)} H 1 Z`, fill: "none", strokeWidth: 0.7 },
    {
      d: `M ${inner} ${inner} H ${round(width - inner)} V ${round(height - inner)} H ${inner} Z`,
      fill: "none",
      strokeWidth: 0.7,
    },
  ];
}

export function ornamentBand(width, { color = "#6b7a3d", paper = "#f3f0e6" } = {}) {
  const count = Math.max(1, Math.floor(width / MOTIF_W));
  const total = count * MOTIF_W;
  const paths = [
    { d: `M 0 1 H ${total}`, fill: "none", strokeWidth: 0.7 },
    { d: `M 0 ${MOTIF_H - 1} H ${total}`, fill: "none", strokeWidth: 0.7 },
  ];
  for (let index = 0; index < count; index += 1) {
    const x = index * MOTIF_W;
    paths.push(...paint(LOCAL, (px, py) => [x + px, py], color, paper));
  }
  return { width: total, height: MOTIF_H, paths };
}

export function ornamentFrame(width, height, { color = "#6b7a3d", paper = "#f3f0e6" } = {}) {
  const paths = [...rails(width, height)];
  const corners = [
    [0, 0],
    [width - MOTIF_H, 0],
    [0, height - MOTIF_H],
    [width - MOTIF_H, height - MOTIF_H],
  ];
  for (const [x, y] of corners) paths.push(...paint(CORNER, (px, py) => [x + px, y + py], color, paper));

  const hCount = Math.max(0, Math.floor((width - MOTIF_H * 2) / MOTIF_W));
  const vCount = Math.max(0, Math.floor((height - MOTIF_H * 2) / MOTIF_W));
  const hStart = (width - hCount * MOTIF_W) / 2;
  const vStart = (height - vCount * MOTIF_W) / 2;

  for (let index = 0; index < hCount; index += 1) {
    const x = hStart + index * MOTIF_W;
    paths.push(...paint(LOCAL, (px, py) => [x + px, py], color, paper));
    paths.push(...paint(LOCAL, (px, py) => [x + px, height - py], color, paper));
  }
  for (let index = 0; index < vCount; index += 1) {
    const y = vStart + index * MOTIF_W;
    paths.push(...paint(LOCAL, (px, py) => [py, y + px], color, paper));
    paths.push(...paint(LOCAL, (px, py) => [width - py, y + px], color, paper));
  }

  return { width, height, paths };
}

export function ornamentBorderDataUri(options = {}) {
  const tile = MOTIF_H * 2 + MOTIF_W;
  const model = ornamentFrame(tile, tile, options);
  const color = options.color || "#6b7a3d";
  const body = model.paths
    .map((path) => {
      const fill = path.fill && path.fill !== "none" ? path.fill : "none";
      return `<path d="${path.d}" fill="${fill}" stroke="${color}" stroke-width="${path.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
