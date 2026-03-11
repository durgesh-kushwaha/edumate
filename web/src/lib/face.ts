import sharp from 'sharp';

const DESCRIPTOR_W = 16;
const DESCRIPTOR_H = 8;
const MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || '0.58');

export { MATCH_THRESHOLD };

/* ------------------------------------------------------------------ */
/*  Image helpers                                                      */
/* ------------------------------------------------------------------ */

/** Resize an image buffer down so the longest edge is at most `maxPx`. */
export async function shrinkImage(buf: Buffer, maxPx = 320): Promise<Buffer> {
  return sharp(buf)
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Descriptor – matches Python's opencv-haar-luma16x8-v1 format       */
/* ------------------------------------------------------------------ */

/**
 * Compute a 128-dim face descriptor from a raw image buffer.
 *
 * Uses sharp's attention-based smart-crop to locate the most salient
 * region (face in a selfie / webcam capture), then resizes that region
 * to 16×8 greyscale and L2-normalises the pixel vector.
 */
export async function computeDescriptor(buf: Buffer): Promise<number[] | null> {
  try {
    const raw = await sharp(buf)
      .resize(DESCRIPTOR_W, DESCRIPTOR_H, {
        fit: 'cover',
        position: sharp.strategy.attention,
      })
      .greyscale()
      .raw()
      .toBuffer();

    const vector: number[] = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) vector[i] = raw[i] / 255;

    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i] /= norm;

    return vector;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Vector math                                                        */
/* ------------------------------------------------------------------ */

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return 999;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function averageDescriptors(descriptors: number[][]): number[] {
  if (descriptors.length === 0) return [];
  const len = descriptors[0].length;
  const mean = new Array<number>(len).fill(0);
  for (const d of descriptors) for (let i = 0; i < len; i++) mean[i] += d[i];
  for (let i = 0; i < len; i++) mean[i] /= descriptors.length;
  const norm = Math.sqrt(mean.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < len; i++) mean[i] /= norm;
  return mean;
}
