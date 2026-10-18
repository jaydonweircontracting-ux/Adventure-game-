/**
 * BUILD 855: Remove only a solid black/white matte connected to the image edges.
 * Transparent pixels and sprites with non-solid/detailed backgrounds are left alone.
 */
const transparentSourceCache = new Map<string, Promise<string>>();

export function removeEdgeMatte(image: HTMLImageElement): string {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return image.src;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return image.src;
    context.drawImage(image, 0, 0);
    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;
    const corners = [0, width - 1, (height - 1) * width, height * width - 1];
    const family = (index: number): 'white' | 'black' | null => {
      const offset = index * 4;
      if (pixels[offset + 3] < 245) return null;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (r >= 215 && g >= 215 && b >= 215) return 'white';
      if (r <= 40 && g <= 40 && b <= 40) return 'black';
      return null;
    };
    const cornerFamilies = corners.map(family);
    const whiteCorners = cornerFamilies.filter((value) => value === 'white').length;
    const blackCorners = cornerFamilies.filter((value) => value === 'black').length;
    const target = whiteCorners >= 3 ? 'white' : blackCorners >= 3 ? 'black' : null;
    if (!target) return image.src;

    const matches = (index: number): boolean => {
      const offset = index * 4;
      if (pixels[offset + 3] < 8) return false;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (target === 'white') return r >= 205 && g >= 205 && b >= 205 && Math.max(r, g, b) - Math.min(r, g, b) <= 48;
      return r <= 55 && g <= 55 && b <= 55 && Math.max(r, g, b) - Math.min(r, g, b) <= 48;
    };

    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    const add = (index: number) => {
      if (index < 0 || index >= total || visited[index] || !matches(index)) return;
      visited[index] = 1;
      queue[tail++] = index;
    };
    // Seed the entire outer border so JPEG matte noise is removed too.
    for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
    for (let y = 1; y < height - 1; y++) { add(y * width); add(y * width + width - 1); }
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      if (x > 0) add(index - 1);
      if (x + 1 < width) add(index + 1);
      if (index >= width) add(index - width);
      if (index + width < total) add(index + width);
    }
    if (tail < Math.max(16, total * 0.002)) return image.src;
    for (let i = 0; i < total; i++) {
      if (!visited[i]) continue;
      const offset = i * 4;
      const distance = target === 'white'
        ? Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2])
        : 255 - Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      // Softly fade antialiased matte pixels instead of leaving a bright/dark fringe.
      pixels[offset + 3] = Math.min(pixels[offset + 3], Math.max(0, Math.round((distance / 75) * 255)));
    }
    context.putImageData(frame, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // Tainted canvas or unsupported image: retain the original rather than breaking placement.
    return image.src;
  }
}

export function transparentAssetSource(src: string): Promise<string> {
  const cached = transparentSourceCache.get(src);
  if (cached) return cached;
  const result = new Promise<string>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(removeEdgeMatte(image));
    image.onerror = () => resolve(src);
    image.src = src;
  });
  transparentSourceCache.set(src, result);
  return result;
}
