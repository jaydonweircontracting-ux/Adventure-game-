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
    // BUILD 857: Detect a matte from the whole outer border, not just the four corners.
    // House art often touches a corner or has a non-white corner detail while most of
    // the surrounding canvas is still a flat white export background.
    const family = (index: number): 'white' | 'black' | null => {
      const offset = index * 4;
      if (pixels[offset + 3] < 200) return null;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (r >= 215 && g >= 215 && b >= 215 && Math.max(r, g, b) - Math.min(r, g, b) <= 55) return 'white';
      if (r <= 45 && g <= 45 && b <= 45 && Math.max(r, g, b) - Math.min(r, g, b) <= 45) return 'black';
      return null;
    };
    let edgeSamples = 0, whiteEdgeSamples = 0, blackEdgeSamples = 0;
    const sampleEdge = (index: number) => {
      const kind = family(index);
      if (kind) {
        edgeSamples++;
        if (kind === 'white') whiteEdgeSamples++;
        else blackEdgeSamples++;
      }
    };
    for (let x = 0; x < width; x++) {
      sampleEdge(x);
      if (height > 1) sampleEdge((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      sampleEdge(y * width);
      if (width > 1) sampleEdge(y * width + width - 1);
    }
    const target: 'white' | 'black' | null =
      edgeSamples > 0 && whiteEdgeSamples / edgeSamples >= 0.55 ? 'white' :
      edgeSamples > 0 && blackEdgeSamples / edgeSamples >= 0.55 ? 'black' : null;
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
    if (tail < Math.max(8, total * 0.0005)) return image.src;
    for (let i = 0; i < total; i++) {
      if (!visited[i]) continue;
      const offset = i * 4;
      const distance = target === 'white'
        ? 255 - Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2])
        : Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
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


/** Remove a user-selected edge-connected matte color with adjustable tolerance. */
export function removeEdgeColorMatte(image: HTMLImageElement, hexColor: string, tolerance = 45): string {
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height) return image.src;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return image.src;
    context.drawImage(image, 0, 0);
    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;
    const parsed = /^#?([0-9a-f]{6})$/i.exec(hexColor);
    if (!parsed) return image.src;
    const rgb = [parseInt(parsed[1].slice(0,2),16), parseInt(parsed[1].slice(2,4),16), parseInt(parsed[1].slice(4,6),16)];
    const threshold = Math.max(0, Math.min(160, tolerance));
    const total = width * height, visited = new Uint8Array(total), queue = new Int32Array(total);
    const matches = (i: number) => {
      const o = i * 4;
      if (pixels[o + 3] < 8) return false;
      const d0 = pixels[o] - rgb[0], d1 = pixels[o + 1] - rgb[1], d2 = pixels[o + 2] - rgb[2];
      return Math.sqrt(d0*d0 + d1*d1 + d2*d2) <= threshold * 1.732;
    };
    let head = 0, tail = 0;
    const add = (i: number) => { if (i < 0 || i >= total || visited[i] || !matches(i)) return; visited[i] = 1; queue[tail++] = i; };
    for (let x=0;x<width;x++) { add(x); add((height-1)*width+x); }
    for (let y=1;y<height-1;y++) { add(y*width); add(y*width+width-1); }
    while (head < tail) {
      const i=queue[head++], x=i%width;
      if (x>0) add(i-1); if (x+1<width) add(i+1);
      if (i>=width) add(i-width); if (i+width<total) add(i+width);
    }
    if (tail < Math.max(8, total * 0.001)) return image.src;
    for (let i=0;i<total;i++) {
      if (!visited[i]) continue;
      const o=i*4;
      const d0=pixels[o]-rgb[0], d1=pixels[o+1]-rgb[1], d2=pixels[o+2]-rgb[2];
      const distance=Math.sqrt(d0*d0+d1*d1+d2*d2);
      pixels[o+3]=Math.min(pixels[o+3], Math.max(0, Math.round((distance / Math.max(1, threshold)) * 255)));
    }
    context.putImageData(frame,0,0);
    return canvas.toDataURL('image/png');
  } catch { return image.src; }
}
