type RGB = [number, number, number];
type HSL = [number, number, number];

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")
  );
}

interface Bucket {
  rSum: number;
  gSum: number;
  bSum: number;
  count: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Extract 3 dominant high-contrast colors from an image URL.
 * Filters out whites, blacks, and low-saturation grays.
 * Returns null if extraction fails.
 */
export async function extractColors(
  imageUrl: string
): Promise<[string, string, string] | null> {
  if (!imageUrl) return null;

  try {
    const img = await loadImage(imageUrl);

    const size = 50;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    // Bucket RGB into ~8 bins per channel (8^3 = 512 buckets)
    const bins = 8;
    const binSize = 256 / bins;
    const buckets = new Map<string, Bucket>();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const br = Math.floor(r / binSize);
      const bg = Math.floor(g / binSize);
      const bb = Math.floor(b / binSize);
      const key = `${br},${bg},${bb}`;

      const bucket = buckets.get(key);
      if (bucket) {
        bucket.rSum += r;
        bucket.gSum += g;
        bucket.bSum += b;
        bucket.count++;
      } else {
        buckets.set(key, { rSum: r, gSum: g, bSum: b, count: 1 });
      }
    }

    // Convert buckets to averaged colors with HSL filtering
    const candidates: { rgb: RGB; hsl: HSL; count: number }[] = [];

    for (const bucket of buckets.values()) {
      const r = bucket.rSum / bucket.count;
      const g = bucket.gSum / bucket.count;
      const b = bucket.bSum / bucket.count;
      const hsl = rgbToHsl(r, g, b);

      // Filter: no whites (l > 0.82), no blacks (l < 0.15), no grays (s < 0.18)
      if (hsl[2] > 0.82 || hsl[2] < 0.15 || hsl[1] < 0.18) continue;

      candidates.push({ rgb: [r, g, b], hsl, count: bucket.count });
    }

    // Sort by pixel count (most dominant first)
    candidates.sort((a, b) => b.count - a.count);

    if (candidates.length === 0) return null;

    // Pick top 3, trying for hue diversity
    const picked: RGB[] = [candidates[0].rgb];

    for (const c of candidates.slice(1)) {
      if (picked.length >= 3) break;
      // Check hue distance from already-picked colors (avoid near-duplicates)
      const isDifferent = picked.every((p) => {
        const pH = rgbToHsl(p[0], p[1], p[2])[0];
        const cH = c.hsl[0];
        const hueDist = Math.min(Math.abs(pH - cH), 1 - Math.abs(pH - cH));
        return hueDist > 0.06 || Math.abs(c.hsl[2] - rgbToHsl(p[0], p[1], p[2])[2]) > 0.15;
      });
      if (isDifferent) picked.push(c.rgb);
    }

    // If still < 3, fill from remaining candidates
    for (const c of candidates) {
      if (picked.length >= 3) break;
      if (!picked.some((p) => p[0] === c.rgb[0] && p[1] === c.rgb[1] && p[2] === c.rgb[2])) {
        picked.push(c.rgb);
      }
    }

    if (picked.length < 3) return null;

    return [
      rgbToHex(picked[0][0], picked[0][1], picked[0][2]),
      rgbToHex(picked[1][0], picked[1][1], picked[1][2]),
      rgbToHex(picked[2][0], picked[2][1], picked[2][2]),
    ];
  } catch {
    return null;
  }
}
