"use client";
import { clientError } from "./api";

/**
 * Shrinks a phone photo to at most 1280 px and re-encodes it as JPEG.
 * Re-encoding through a canvas drops all EXIF metadata, including GPS coordinates.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error(clientError("notPhoto"));
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  let w: number, h: number, draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
  if (bitmap) {
    w = bitmap.width;
    h = bitmap.height;
    draw = (ctx, W, H) => ctx.drawImage(bitmap, 0, 0, W, H);
  } else {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(clientError("cantRead")));
      i.src = URL.createObjectURL(file);
    });
    w = img.naturalWidth;
    h = img.naturalHeight;
    draw = (ctx, W, H) => ctx.drawImage(img, 0, 0, W, H);
  }
  const scale = Math.min(1, 1280 / Math.max(w, h));
  const W = Math.round(w * scale);
  const H = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(clientError("cantProcess"));
  draw(ctx, W, H);
  for (const q of [0.72, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= 880 * 1024) return blob;
  }
  throw new Error(clientError("tooLarge"));
}
