const CODE128_PATTERNS: Record<string, number[]> = {
  " ": [2, 1, 2, 2, 2, 2],
  "!": [2, 2, 2, 1, 2, 2],
  "\"": [2, 2, 2, 2, 2, 1],
  "#": [1, 2, 1, 2, 2, 3],
  $: [1, 2, 1, 3, 2, 2],
  "%": [1, 3, 1, 2, 2, 2],
  "&": [1, 2, 2, 2, 1, 3],
  "'": [1, 2, 2, 3, 1, 2],
  "(": [1, 3, 2, 2, 1, 2],
  ")": [2, 2, 1, 2, 1, 3],
  "*": [2, 2, 1, 3, 1, 2],
  "+": [2, 3, 1, 2, 1, 2],
  ",": [1, 1, 2, 2, 3, 2],
  "-": [1, 2, 2, 1, 3, 2],
  ".": [1, 2, 2, 2, 3, 1],
  "/": [1, 1, 3, 2, 2, 2],
  "0": [1, 2, 3, 1, 2, 2],
  "1": [1, 2, 3, 2, 2, 1],
  "2": [2, 2, 3, 2, 1, 1],
  "3": [2, 2, 1, 1, 3, 2],
  "4": [2, 2, 1, 2, 3, 1],
  "5": [2, 1, 3, 2, 1, 2],
  "6": [2, 2, 3, 1, 1, 2],
  "7": [3, 1, 2, 1, 3, 1],
  "8": [3, 1, 1, 2, 2, 2],
  "9": [3, 2, 1, 1, 2, 2],
  ":": [3, 2, 1, 2, 2, 1],
  ";": [3, 1, 2, 2, 1, 2],
  "<": [3, 2, 2, 1, 1, 2],
  "=": [3, 2, 2, 2, 1, 1],
  ">": [2, 1, 2, 1, 2, 3],
  "?": [2, 1, 2, 3, 2, 1],
  "@": [2, 3, 2, 1, 2, 1],
  A: [1, 1, 1, 3, 2, 3],
  B: [1, 3, 1, 1, 2, 3],
  C: [1, 3, 1, 3, 2, 1],
  D: [1, 1, 2, 3, 1, 3],
  E: [1, 3, 2, 1, 1, 3],
  F: [1, 3, 2, 3, 1, 1],
  G: [2, 1, 1, 3, 1, 3],
  H: [2, 3, 1, 1, 1, 3],
  I: [2, 3, 1, 3, 1, 1],
  J: [1, 1, 2, 1, 3, 3],
  K: [1, 1, 2, 3, 3, 1],
  L: [1, 3, 2, 1, 3, 1],
  M: [1, 1, 3, 1, 2, 3],
  N: [1, 1, 3, 3, 2, 1],
  O: [1, 3, 3, 1, 2, 1],
  P: [3, 1, 3, 1, 2, 1],
  Q: [2, 1, 1, 3, 3, 1],
  R: [2, 3, 1, 1, 3, 1],
  S: [2, 1, 3, 1, 1, 3],
  T: [2, 1, 3, 3, 1, 1],
  U: [2, 1, 3, 1, 3, 1],
  V: [3, 1, 1, 1, 2, 3],
  W: [3, 1, 1, 3, 2, 1],
  X: [3, 3, 1, 1, 2, 1],
  Y: [3, 1, 2, 1, 1, 3],
  Z: [3, 1, 2, 3, 1, 1],
  "[": [3, 3, 2, 1, 1, 1],
  "\\": [3, 1, 4, 1, 1, 1],
  "]": [2, 2, 1, 4, 1, 1],
  "^": [4, 3, 1, 1, 1, 1],
  _: [1, 1, 1, 2, 4, 2],
  "`": [1, 1, 1, 4, 2, 2],
  a: [1, 2, 1, 1, 4, 2],
  b: [1, 2, 1, 2, 4, 1],
  c: [1, 1, 4, 2, 1, 2],
  d: [1, 2, 4, 1, 1, 2],
  e: [1, 2, 4, 2, 1, 1],
  f: [4, 1, 1, 2, 1, 2],
  g: [4, 2, 1, 1, 1, 2],
  h: [4, 2, 1, 2, 1, 1],
  i: [1, 1, 4, 1, 2, 2],
  j: [1, 2, 4, 1, 2, 1],
  k: [1, 2, 1, 2, 1, 4],
  l: [1, 2, 1, 4, 2, 1],
  m: [1, 4, 1, 2, 1, 2],
  n: [1, 4, 2, 1, 1, 2],
  o: [1, 4, 2, 2, 1, 1],
  p: [4, 1, 2, 1, 2, 1],
  q: [4, 2, 1, 2, 1, 1],
  r: [2, 1, 4, 1, 2, 1],
  s: [2, 1, 4, 2, 1, 1],
  t: [2, 1, 1, 2, 1, 4],
  u: [2, 1, 1, 4, 2, 1],
  v: [2, 1, 2, 1, 4, 1],
  w: [2, 1, 2, 4, 1, 1],
  x: [2, 4, 1, 2, 1, 1],
  y: [2, 4, 1, 1, 2, 1],
  z: [4, 1, 2, 1, 1, 2],
  "{": [4, 1, 2, 2, 1, 1],
  "|": [1, 1, 2, 2, 1, 4],
  "}": [1, 1, 2, 4, 1, 2],
  "~": [1, 4, 2, 1, 2, 1],
};

function encodeCode128(text: string): number[] {
  const bars: number[] = [2, 1, 1, 4, 1, 2];
  for (const ch of text.toUpperCase()) {
    const pattern = CODE128_PATTERNS[ch];
    if (pattern) bars.push(...pattern);
  }
  bars.push(2, 3, 3, 1, 1, 1, 2);
  return bars;
}

function barsToSvg(bars: number[], barHeight: number, barWidth: number): string {
  let x = 0;
  let svg = "";
  for (let i = 0; i < bars.length; i++) {
    const width = bars[i] * barWidth;
    if (i % 2 === 0) {
      svg += `<rect x="${x}" y="0" width="${width}" height="${barHeight}" fill="black"/>`;
    }
    x += width;
  }
  return svg;
}

export function generateBarcodeSvg(data: string, options?: {
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
}): Promise<string> {
  const barWidth = options?.width || 2;
  const barHeight = options?.height || 50;
  const fontSize = options?.fontSize || 14;
  const displayValue = options?.displayValue !== false;

  const bars = encodeCode128(data);
  const svgBars = barsToSvg(bars, barHeight, barWidth);
  const totalWidth = bars.reduce((sum, v) => sum + v * barWidth, 0);
  const totalHeight = displayValue ? barHeight + fontSize + 10 : barHeight;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth + 20}" height="${totalHeight + 10}" viewBox="0 0 ${totalWidth + 20} ${totalHeight + 10}">`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;
  svg += `<g transform="translate(10, 5)">${svgBars}</g>`;
  if (displayValue) {
    svg += `<text x="${(totalWidth + 20) / 2}" y="${barHeight + fontSize + 5}" text-anchor="middle" font-size="${fontSize}" font-family="monospace">${data}</text>`;
  }
  svg += `</svg>`;
  return Promise.resolve(svg);
}

export async function generateBarcodeDataUrl(data: string, options?: {
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
}): Promise<string> {
  const svg = await generateBarcodeSvg(data, options);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function generateBarcodeBuffer(data: string, options?: {
  width?: string;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
}): Promise<Buffer> {
  const svg = await generateBarcodeSvg(data, options);
  return Buffer.from(svg);
}

export async function generateJobBarcode(jobNumber: string): Promise<string> {
  return generateBarcodeDataUrl(jobNumber, {
    width: 2,
    height: 40,
    fontSize: 12,
    displayValue: true,
  });
}

export async function generateDispatchBarcode(dispatchNumber: string): Promise<string> {
  return generateBarcodeDataUrl(dispatchNumber, {
    width: 2,
    height: 40,
    fontSize: 12,
    displayValue: true,
  });
}

export async function generateProductBarcode(productId: string): Promise<string> {
  const padded = productId.replace(/\D/g, "").padStart(12, "0").slice(0, 12);
  return generateBarcodeDataUrl(padded, {
    width: 2,
    height: 50,
    fontSize: 12,
    displayValue: true,
  });
}
