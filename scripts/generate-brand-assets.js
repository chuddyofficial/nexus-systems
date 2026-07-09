const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const OUT_DIR = path.join(__dirname, '..', 'brand');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BLURPLE = '#5865F2';
const VIOLET = '#8A5CF6';
const DEEP = '#0b0d1a';
const DEEP2 = '#141833';

// A hexagonal shield outline with three connected "nexus" nodes inside —
// reads as both a security badge and a network/connection mark.
function markSvg({ size = 512, transparent = false } = {}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  const hexPoints = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
  const hexPath = hexPoints.map((p) => p.join(',')).join(' ');

  const nodeR = size * 0.032;
  const nodes = [
    [cx, cy - r * 0.42],
    [cx - r * 0.4, cy + r * 0.28],
    [cx + r * 0.4, cy + r * 0.28],
  ];

  const bg = transparent
    ? ''
    : `<circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="url(#bgGrad)" />`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bgGrad" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="${DEEP2}" />
      <stop offset="100%" stop-color="${DEEP}" />
    </radialGradient>
    <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BLURPLE}" />
      <stop offset="100%" stop-color="${VIOLET}" />
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${size * 0.02}" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  ${bg}

  <polygon points="${hexPath}" fill="none" stroke="url(#hexGrad)" stroke-width="${size * 0.035}" stroke-linejoin="round" filter="url(#glow)" />

  <line x1="${nodes[0][0]}" y1="${nodes[0][1]}" x2="${nodes[1][0]}" y2="${nodes[1][1]}" stroke="url(#hexGrad)" stroke-width="${size * 0.018}" stroke-linecap="round" />
  <line x1="${nodes[0][0]}" y1="${nodes[0][1]}" x2="${nodes[2][0]}" y2="${nodes[2][1]}" stroke="url(#hexGrad)" stroke-width="${size * 0.018}" stroke-linecap="round" />
  <line x1="${nodes[1][0]}" y1="${nodes[1][1]}" x2="${nodes[2][0]}" y2="${nodes[2][1]}" stroke="url(#hexGrad)" stroke-width="${size * 0.018}" stroke-linecap="round" />

  ${nodes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${nodeR}" fill="#ffffff" />`).join('\n  ')}
  ${nodes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${nodeR * 1.8}" fill="none" stroke="url(#hexGrad)" stroke-width="${size * 0.01}" opacity="0.55" />`).join('\n  ')}
</svg>`;
}

// Bot avatar: same mark plus a thin circuit-line ring, to read distinctly as
// "the bot" next to the plainer server icon while staying on-brand.
function botMarkSvg({ size = 512 } = {}) {
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * 0.47;
  const dash = size * 0.04;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bgGrad2" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="${DEEP2}" />
      <stop offset="100%" stop-color="${DEEP}" />
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="url(#bgGrad2)" />
  <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${VIOLET}" stroke-width="${size * 0.008}" stroke-dasharray="${dash} ${dash * 0.7}" opacity="0.5" />
  ${markSvg({ size, transparent: true })
    .replace(/<svg[^>]*>/, '')
    .replace('</svg>', '')}
</svg>`;
}

function bannerSvg({ width = 960, height = 540 } = {}) {
  const markSize = height * 0.5;
  const markX = width * 0.5 - markSize / 2;
  const markY = height * 0.16;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="bannerBg" cx="30%" cy="20%" r="90%">
      <stop offset="0%" stop-color="${DEEP2}" />
      <stop offset="100%" stop-color="${DEEP}" />
    </radialGradient>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#c8cdfa" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bannerBg)" />

  <!-- subtle grid -->
  <g opacity="0.08" stroke="${VIOLET}" stroke-width="1">
    ${Array.from({ length: Math.ceil(width / 40) }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="${height}" />`).join('\n    ')}
    ${Array.from({ length: Math.ceil(height / 40) }, (_, i) => `<line x1="0" y1="${i * 40}" x2="${width}" y2="${i * 40}" />`).join('\n    ')}
  </g>

  ${markSvg({ size: markSize, transparent: true }).replace(/<svg[^>]*>/, `<g transform="translate(${markX}, ${markY})">`).replace('</svg>', '</g>')}

  <text x="50%" y="${height * 0.78}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${height * 0.11}" font-weight="700" fill="url(#textGrad)" letter-spacing="${height * 0.01}">NEXUS SYSTEMS</text>
  <text x="50%" y="${height * 0.88}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${height * 0.045}" fill="#9198b0" letter-spacing="${height * 0.004}">COMMUNITY SECURITY &amp; MODERATION</text>
</svg>`;
}

async function main() {
  await sharp(Buffer.from(markSvg({ size: 512 }))).png().toFile(path.join(OUT_DIR, 'serverpfp.png'));
  console.log('serverpfp.png written');

  await sharp(Buffer.from(botMarkSvg({ size: 512 }))).png().toFile(path.join(OUT_DIR, 'botpfp.png'));
  console.log('botpfp.png written');

  await sharp(Buffer.from(bannerSvg({ width: 960, height: 540 }))).png().toFile(path.join(OUT_DIR, 'banner.png'));
  console.log('banner.png written');

  // Favicon-sized versions for the web dashboard.
  await sharp(Buffer.from(markSvg({ size: 64 }))).png().toFile(path.join(OUT_DIR, 'favicon-64.png'));
  await sharp(Buffer.from(markSvg({ size: 32 }))).png().toFile(path.join(OUT_DIR, 'favicon-32.png'));
  console.log('favicon PNGs written');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
