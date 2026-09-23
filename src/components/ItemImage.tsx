import { useEffect, useState } from 'react';
import type { ItemImage as ItemImageRecord } from '../types';

/**
 * A memory image of an entry. Uploaded images need the bearer token, so they are fetched
 * and shown through an object URL; external images load directly without a referrer.
 */
export function ItemImage({ image, token, alt, className }: { image: ItemImageRecord; token?: string; alt: string; className?: string }) {
  const [src, setSrc] = useState(image.url ?? '');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!image.id) {
      setSrc(image.url ?? '');
      return;
    }
    if (!token) return;
    let disposed = false;
    let objectUrl = '';
    setSrc('');
    fetch(`/api/item-images/${encodeURIComponent(image.id)}`, { headers: { authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error('Image not found');
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.id, image.url, token]);

  if (failed) return <span className={`item-image item-image--missing ${className ?? ''}`} role="img" aria-label={alt} />;
  return src
    ? <img className={`item-image ${className ?? ''}`} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className={`item-image item-image--loading ${className ?? ''}`} aria-hidden="true" />;
}

const MAX_IMAGE_EDGE = 1600;

/**
 * Prepare a picked file for the upload endpoint (base64 without the data: prefix).
 * Large photos are scaled to 1600px on the long edge and re-encoded, so phone pictures fit
 * the 5 MB limit; GIFs keep their animation and are sent unchanged.
 */
export async function prepareImageUpload(file: File): Promise<{ imageBase64: string; mime: string }> {
  if (file.type === 'image/gif') return { imageBase64: await blobToBase64(file), mime: file.type };
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close();
    return { imageBase64: await blobToBase64(file), mime: file.type };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) return { imageBase64: await blobToBase64(file), mime: file.type };
  return { imageBase64: await blobToBase64(blob), mime: blob.type };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(blob);
  });
}
