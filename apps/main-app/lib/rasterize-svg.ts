/** Serializes an SVG element to a raster canvas (white background) — the
 * browser-native SVG-to-canvas technique, no image library needed. Shared by
 * MindmapModal (mind map exports) and the Settings Wiki tab (wiki/bullet
 * JPEG exports). */
export async function rasterizeSvg(
  svg: SVGSVGElement,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to rasterize SVG'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Wraps arbitrary HTML in an SVG foreignObject so plain styled text (not
 * just existing SVG content like a mind map) can go through the same
 * rasterize-to-JPEG pipeline. */
export function wrapHtmlAsSvg(html: string, width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;box-sizing:border-box;">${html}</div>` +
    `</foreignObject></svg>`
  );
}

/** Rasterizes an HTML string (via wrapHtmlAsSvg) directly to a JPEG data URL and triggers a download. */
export async function downloadHtmlAsJpeg(
  html: string,
  width: number,
  height: number,
  filename: string
): Promise<void> {
  const svgMarkup = wrapHtmlAsSvg(html, width, height);
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to rasterize content'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
