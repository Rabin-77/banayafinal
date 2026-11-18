export class AdminAuthError extends Error {
  constructor(message = 'Admin verification required. Please sign in with your authorized Google account.') {
    super(message);
    this.name = 'AdminAuthError';
  }
}

const MAX_DATA_URL_LENGTH = 110_000;
export const MAX_PRODUCT_GALLERY_BYTES = 780_000;

/**
 * Resize and compress an image file on canvas so uploaded photos stay crisp,
 * load reliably across static hosts (Vercel/GitHub) and mobile devices,
 * and stay well within Firestore's document size limits.
 */
export async function optimizeImageToDataUrl(
  file: File,
  maxDimension = 760,
  targetMaxLength = MAX_DATA_URL_LENGTH
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      if (!rawDataUrl || !rawDataUrl.startsWith('data:image/')) {
        reject(new Error('Unsupported or unreadable image file'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode selected image file'));
      img.onload = () => {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;
        if (!naturalWidth || !naturalHeight) {
          reject(new Error('Image has invalid dimensions'));
          return;
        }

        const encodeAt = (dim: number, quality: number, preferWebp: boolean): string => {
          let width = naturalWidth;
          let height = naturalHeight;
          if (width > dim || height > dim) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * dim) / width));
              width = dim;
            } else {
              width = Math.max(1, Math.round((width * dim) / height));
              height = dim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return rawDataUrl;

          ctx.drawImage(img, 0, 0, width, height);

          if (preferWebp) {
            try {
              const webpCandidate = canvas.toDataURL('image/webp', quality);
              if (webpCandidate.startsWith('data:image/webp')) {
                return webpCandidate;
              }
            } catch {
              // Safari fallback to JPEG
            }
          }

          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
          return canvas.toDataURL('image/jpeg', quality);
        };

        const attempts: Array<{ dim: number; quality: number; webp: boolean }> = [
          { dim: maxDimension, quality: 0.82, webp: true },
          { dim: maxDimension, quality: 0.68, webp: true },
          { dim: Math.min(600, maxDimension), quality: 0.62, webp: true },
          { dim: Math.min(520, maxDimension), quality: 0.54, webp: false },
          { dim: 420, quality: 0.45, webp: false }
        ];

        let best = rawDataUrl;
        for (const attempt of attempts) {
          const candidate = encodeAt(attempt.dim, attempt.quality, attempt.webp);
          best = candidate;
          if (candidate.length <= targetMaxLength) {
            resolve(candidate);
            return;
          }
        }

        resolve(best);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Optimizes an uploaded product photo into a self-contained portable data URL
 * so it syncs instantaneously through Firestore to all live visitors on Vercel and dev.
 */
export async function uploadProductImage(file: File): Promise<string> {
  return optimizeImageToDataUrl(file);
}

/**
 * Guards Firestore 1MB per-document limits before saving product galleries.
 */
export function calculateGalleryByteSize(gallery: string[]): number {
  return gallery.reduce((sum, item) => sum + (typeof item === 'string' ? item.length : 0), 0);
}
