import React from 'react';
import { Product } from '../types';

const PRODUCT_FALLBACK_IMAGES: Record<string, string> = {
  'pure-honey': '/images/pure-honey-1.png',
  'magarantha-thean': '/images/magarantha-thean-1.png',
  'malai-thean': '/images/malai_thean_bottle.jpg',
  'mixed-nuts': '/images/mixed-nuts-2.png',
  'honey-amla': '/images/honey-amla-1.webp',
  'gulkand': '/images/rose-gulkand-2.png',
  'karuppukavani-kanji': '/images/karuppu_kavuni_kanji_front.jpg',
  'mudavatukal-soup': '/images/mudavatukal_soup_front.jpeg',
  'murungai-leaf-powder': '/images/murungai_pouch_front.jpg',
  'curry-leaf-powder': '/images/curry_leaf_pouch_front.jpg',
  'natural-soap': '/images/natural-soap-3.png',
  'desi-cow-ghee': '/images/desi-cow-ghee-2.png',
  'abc-malt': '/images/abc_malt_front.jpg'
};

const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  'honey-sweeteners': '/images/pure-honey-1.png',
  'health-drinks': '/images/abc_malt_front.jpg',
  'herbal-powders': '/images/murungai_pouch_front.jpg',
  'ghee-foods': '/images/desi-cow-ghee-2.png',
  'nuts-dryfruits': '/images/mixed-nuts-2.png',
  'traditional-wellness': '/images/honey-amla-1.webp',
  'herbal-products': '/images/natural-soap-3.png'
};

export function getFallbackProductImage(
  product?: Pick<Product, 'id' | 'categorySlug'> | null
): string {
  if (!product) return '/images/banaya_logo.png';
  return (
    PRODUCT_FALLBACK_IMAGES[product.id] ||
    CATEGORY_FALLBACK_IMAGES[product.categorySlug] ||
    '/images/banaya_logo.png'
  );
}

export function isValidImageSource(src?: string): boolean {
  if (!src || typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed === '[object Object]') {
    return false;
  }
  if (trimmed.startsWith('/uploads/1-179456')) {
    return false;
  }
  if (trimmed.startsWith('data:')) {
    return /^data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{16,}/i.test(trimmed);
  }
  return trimmed.startsWith('/') || trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

export function isLocalAssetImage(src?: string): boolean {
  if (!src) return false;
  return (
    src.startsWith('/images/') ||
    src.startsWith('/assets/') ||
    src.startsWith('/uploads/') ||
    src.startsWith('data:image/')
  );
}

export function isBrokenLegacyUpload(src?: string): boolean {
  return !isValidImageSource(src);
}

export function healLegacyProductImages(product: Product): Product {
  const fallbackImg = getFallbackProductImage(product);
  const healedImage = isValidImageSource(product.image) ? product.image.trim() : fallbackImg;

  const rawGallery = Array.isArray(product.gallery) ? product.gallery : [];
  const validGallery = Array.from(
    new Set(
      rawGallery
        .filter((img) => isValidImageSource(img))
        .map((img) => img.trim())
    )
  );

  const mergedGallery = [
    healedImage,
    ...validGallery.filter((img) => img !== healedImage)
  ];

  if (
    healedImage === product.image &&
    mergedGallery.length === rawGallery.length &&
    mergedGallery.every((img, idx) => img === rawGallery[idx])
  ) {
    return product;
  }

  return {
    ...product,
    image: healedImage,
    gallery: mergedGallery
  };
}

export function handleProductImageLoad(
  event: React.SyntheticEvent<HTMLImageElement>
): void {
  const img = event.currentTarget;
  delete img.dataset.fallbackStage;
  delete img.dataset.failedSrc;
}

export function handleProductImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  product?: Pick<Product, 'id' | 'categorySlug'> | null
): void {
  const img = event.currentTarget;
  const currentSrc = img.getAttribute('src') || '';
  const fallback = getFallbackProductImage(product);

  // Reset stage automatically whenever React binds a brand-new src URL to this img node
  if (img.dataset.failedSrc && img.dataset.failedSrc !== currentSrc) {
    delete img.dataset.fallbackStage;
  }
  img.dataset.failedSrc = currentSrc;

  if (img.dataset.fallbackStage === 'done') {
    return;
  }

  if (img.dataset.fallbackStage !== 'primary' && currentSrc !== fallback) {
    img.dataset.fallbackStage = 'primary';
    img.src = fallback;
    return;
  }

  if (currentSrc !== '/images/banaya_logo.png') {
    img.dataset.fallbackStage = 'done';
    img.src = '/images/banaya_logo.png';
  }
}
