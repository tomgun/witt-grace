// Browser-only rasterisation helpers shared by the PNG and PDF exports: an SVG string decoded as an image,
// a canvas of a given size, and encoders. Nothing here is unit-testable without a browser; keep it thin.
export function imageFromSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG renderer could not load the export'));
    };
    im.src = url;
  });
}
export function canvasFor(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
export function blobFor(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b?.size ? resolve(b) : reject(new Error('Cannot encode exported image'))),
      type,
      quality
    )
  );
}
/** JPEG bytes of a canvas at quality .9 (the PDF page image). */
export function jpegBytes(canvas: HTMLCanvasElement): Uint8Array {
  const raw = atob(canvas.toDataURL('image/jpeg', 0.9).split(',')[1] ?? '');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
/** Trigger a browser download of a blob under `name`. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
