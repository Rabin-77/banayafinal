import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  linkWithCredential,
  signOut
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  ADMIN_EMAILS,
  OperationType,
  handleFirestoreError,
  isAllowedAdminEmailString,
  isVerifiedAdminEmail
} from '../firebase';
import { Product, CartItem, Order, ActiveModal, MediaFolder, MediaFolderImage, AdminAlertRecord } from '../types';
import { PRODUCTS } from '../data/products';
import { DEFAULT_MEDIA_FOLDERS } from '../data/defaultMediaFolders';
import { getPriceForProductWeight } from '../utils/pricing';
import { setAdminSessionPasskey, getAdminSessionPasskey, hasAdminSession, clearAdminSession } from '../utils/adminAuth';
import { healLegacyProductImages } from '../utils/imageFallback';
import { sortCatalogByCanonicalOrder } from '../utils/catalogOrder';
import { MAX_PRODUCT_GALLERY_BYTES, calculateGalleryByteSize, optimizeImageToDataUrl } from '../utils/imageUpload';
import { formatReceiptNumber } from '../utils/receipt';

const SYNC_CHANNEL_NAME = 'banaya_store_sync';
const CATALOG_VERSION_KEY = 'banaya_catalog_version';
const CURRENT_CATALOG_VERSION = '2026-11-15-cloud-sync-v7';

interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  productImage?: string;
}

interface ShopContextType {
  products: Product[];
  cart: CartItem[];
  wishlist: string[];
  orders: Order[];
  activeModal: ActiveModal;
  selectedProduct: Product | null;
  searchQuery: string;
  selectedCategory: string;
  sortBy: string;
  toasts: ToastMessage[];
  appliedCoupon: { code: string; discountPercent: number; discountFixed: number } | null;
  serverSynced: boolean;
  lastSyncedAt: number | null;

  // Admin Authentication (Setup Key + Optional Cloud Sync)
  authReady: boolean;
  firebaseUser: User | null;
  isCloudAdmin: boolean;
  isPasskeyAdmin: boolean;
  passkeyAuthChecking: boolean;
  adminAuthError: string | null;
  unauthorizedDomain: string | null;
  emailPasswordProviderDisabled: boolean;
  pendingVerificationEmail: string | null;
  canAttemptFirstTimeSetup: boolean;
  unlockWithSetupKey: (setupKey: string) => Promise<boolean>;
  signInWithEmailAdmin: (email: string, password: string) => Promise<boolean>;
  registerFirstAdminAccount: (email: string, password: string) => Promise<boolean>;
  sendAdminPasswordReset: (email: string) => Promise<boolean>;
  updateAdminPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  updateAdminEmailAddress: (currentPassword: string, newEmail: string) => Promise<boolean>;
  resendAdminVerificationEmail: () => Promise<boolean>;
  refreshAdminVerificationStatus: () => Promise<boolean>;
  signInWithGoogleAdmin: () => Promise<boolean>;
  signOutAdmin: () => Promise<void>;
  clearAdminAuthError: () => void;

  // Actions
  setActiveModal: (modal: ActiveModal) => void;
  setSelectedProduct: (product: Product | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  setSortBy: (sort: string) => void;

  // Cart Actions
  addToCart: (product: Product, quantity?: number, weight?: string) => void;
  removeFromCart: (productId: string, weight: string) => void;
  updateQuantity: (productId: string, weight: string, quantity: number) => void;
  clearCart: () => void;
  applyCoupon: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;

  // Wishlist Actions
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;

  // Order Actions
  placeOrder: (orderDetails: {
    customerName: string;
    phone: string;
    email: string;
    shippingAddress: string;
    city: string;
    postalCode: string;
    paymentMethod: string;
    transactionId?: string;
    bankRef?: string;
  }) => Promise<Order>;
  trackOrderById: (orderId: string) => Order | null;

  // Toast
  showToast: (title: string, message: string, type?: 'success' | 'info' | 'warning', productImage?: string) => void;
  dismissToast: (id: string) => void;

  // Quick View / Detail Navigation
  openProductDetail: (product: Product) => void;
  openQuickCheckout: (product: Product, weight?: string) => void;
  trackingLookupId: string;
  setTrackingLookupId: (orderId: string) => void;
  openOrderTracking: (orderId: string) => void;

  // Product Management (Admin -> Cloud Firestore Live Sync)
  updateProduct: (updatedProduct: Product) => Promise<boolean>;
  addProduct: (newProduct: Product) => Promise<boolean>;
  deleteProduct: (productId: string) => Promise<boolean>;

  // Media Folders Management (Admin -> Cloud Firestore Live Sync)
  mediaFolders: MediaFolder[];
  createMediaFolder: (name: string) => Promise<MediaFolder | null>;
  deleteMediaFolder: (folderId: string) => Promise<boolean>;
  clearMediaFolder: (folderId: string) => Promise<boolean>;
  addImagesToFolder: (folderId: string, files: File[]) => Promise<MediaFolderImage[]>;
  uploadLocalDirectoryAsFolder: (files: File[], fallbackFolderName?: string) => Promise<MediaFolder | null>;
  deleteImageFromFolder: (folderId: string, imageId: string) => Promise<boolean>;

  // Order & Customer Management (Admin)
  updateOrderStatus: (orderId: string, status: Order['status'], trackingNumber?: string, adminNotes?: string) => void;
  deleteOrder: (orderId: string) => void;
  adminNotes?: Record<string, string>;
  setAdminNotesForOrder: (orderId: string, note: string) => void;
  adminAlerts: AdminAlertRecord[];
  unreadAlertsCount: number;
  smtpEmailConfigured: boolean;
  smtpAuthError: string | null;
  acknowledgeAdminAlert: (orderId: string) => void;
  markCustomerNotified: (orderId: string) => void;

  // Financial Calculations
  getEffectivePrice: (item: CartItem) => number;
  cartCount: number;
  cartSubtotal: number;
  cartDiscount: number;
  cartShipping: number;
  cartTotal: number;
  freeShippingThreshold: number;
  freeShippingRemaining: number;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

function playAdminAlertChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [587.33, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.14);
      gain.gain.setValueAtTime(0.08, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.36);
    });
  } catch {
    // Browser autoplay guard or Web Audio unavailable
  }
}

function sanitizeFirestoreId(raw: string, prefix = 'id'): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return cleaned || `${prefix}-${Date.now().toString(36)}`;
}

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function clampStringArray(val: unknown, maxItems: number, maxItemLen: number, fallback: string[] = []): string[] {
  const arr = Array.isArray(val)
    ? val.map((item) => clampString(String(item ?? ''), maxItemLen)).filter(Boolean)
    : fallback;
  return arr.slice(0, maxItems);
}

function buildProductFirestoreFields(product: Product, uid: string) {
  const cleanId = sanitizeFirestoreId(product.id, 'prod');
  const price = Math.max(1, Math.min(1_000_000, Number(product.price) || 1));
  const originalPrice = Math.max(1, Math.min(1_000_000, Number(product.originalPrice) || Math.round(price * 1.25)));
  const weightOptions = clampStringArray(product.weightOptions, 10, 40, ['500g']);
  const finalWeights = weightOptions.length > 0 ? weightOptions : ['500g'];
  const defaultWeight = clampString(product.defaultWeight, 40) || finalWeights[0];

  const primaryImage = clampString(product.image, 250_000) || '/images/pure-honey-1.png';
  const rawGallery = clampStringArray(product.gallery, 8, 250_000, [primaryImage]);
  const dedupedGallery = Array.from(new Set([primaryImage, ...rawGallery])).slice(0, 8);

  return {
    id: cleanId,
    name: clampString(product.name, 160) || 'Banaya Product',
    tamilName: clampString(product.tamilName, 160),
    tagline: clampString(product.tagline, 300),
    category: clampString(product.category, 100) || 'Traditional Wellness',
    categorySlug: clampString(product.categorySlug, 100) || 'traditional-wellness',
    price,
    originalPrice,
    rating: Math.max(0, Math.min(5, Number(product.rating) || 4.9)),
    reviewsCount: Math.max(0, Math.min(1_000_000, Math.round(Number(product.reviewsCount) || 12))),
    inStock: product.inStock !== false,
    weightOptions: finalWeights,
    defaultWeight,
    badges: clampStringArray(product.badges, 10, 60),
    image: primaryImage,
    gallery: dedupedGallery,
    description: clampString(product.description, 3000),
    ingredients: clampStringArray(product.ingredients, 25, 200),
    keyBenefits: clampStringArray(product.keyBenefits, 20, 300),
    howToUse: clampString(product.howToUse, 1500),
    storageInfo: clampString(product.storageInfo, 1000),
    origin: clampString(product.origin, 200),
    isBestSeller: Boolean(product.isBestSeller),
    isNew: Boolean(product.isNew),
    updatedBy: uid
  };
}

function buildInitialSampleOrders(): Order[] {
  const byId = (id: string, fallbackIdx: number) =>
    PRODUCTS.find((p) => p.id === id) || PRODUCTS[fallbackIdx] || PRODUCTS[0];

  if (PRODUCTS.length === 0) return [];

  return [
    {
      id: 'STM-84920',
      date: '2026-11-10',
      items: [
        { product: byId('malai-thean', 2), quantity: 1, selectedWeight: '500g' },
        { product: byId('abc-malt', 12), quantity: 2, selectedWeight: '100g' }
      ],
      subtotal: 1700,
      discount: 170,
      shipping: 0,
      totalAmount: 1530,
      status: 'Delivered',
      customerName: 'Ananya Ramesh',
      phone: '+91 98401 23456',
      email: 'ananya.r@example.com',
      shippingAddress: '42, Lotus Lake Road, Anna Nagar',
      city: 'Chennai',
      postalCode: '600040',
      paymentMethod: 'UPI / Google Pay (UTR: 329048120)',
      trackingNumber: 'IND98427190IN'
    },
    {
      id: 'STM-85104',
      date: '2026-11-11',
      items: [
        { product: byId('pure-honey', 0), quantity: 2, selectedWeight: '500g' },
        { product: byId('gulkand', 5), quantity: 1, selectedWeight: '250g' }
      ],
      subtotal: 750,
      discount: 0,
      shipping: 0,
      totalAmount: 750,
      status: 'Processing',
      customerName: 'Dr. Senthil Kumar',
      phone: '+91 94432 87654',
      email: 'dr.senthil@apollo.org',
      shippingAddress: '15/B, Vaigai Avenue, K.K. Nagar',
      city: 'Madurai',
      postalCode: '625020',
      paymentMethod: 'Google Pay (Instant Verification)',
      trackingNumber: 'STM8831920IN'
    },
    {
      id: 'STM-85219',
      date: '2026-11-11',
      items: [
        { product: byId('mudavatukal-soup', 7), quantity: 3, selectedWeight: '100g' },
        { product: byId('karuppukavani-kanji', 6), quantity: 2, selectedWeight: '250g' }
      ],
      subtotal: 1240,
      discount: 100,
      shipping: 0,
      totalAmount: 1140,
      status: 'Shipped',
      customerName: 'Meenakshi Sundaram',
      phone: '+91 97890 11223',
      email: 'meenakshi.s@gmail.com',
      shippingAddress: '78, Cross Cut Road, Gandhipuram',
      city: 'Coimbatore',
      postalCode: '641012',
      paymentMethod: 'UPI / PhonePe',
      trackingNumber: 'IND7723910IN'
    }
  ];
}

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const version = localStorage.getItem(CATALOG_VERSION_KEY);
      const saved = localStorage.getItem('banaya_products');
      if (version === CURRENT_CATALOG_VERSION && saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sortCatalogByCanonicalOrder((parsed as Product[]).map(healLegacyProductImages));
        }
      }
      localStorage.setItem(CATALOG_VERSION_KEY, CURRENT_CATALOG_VERSION);
    } catch {
      // ignore localStorage read issues
    }
    return sortCatalogByCanonicalOrder(PRODUCTS.map(healLegacyProductImages));
  });

  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [selectedProductState, setSelectedProductState] = useState<Product | null>(null);
  const [trackingLookupId, setTrackingLookupId] = useState<string>('STM-84920');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('featured');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; discountFixed: number } | null>(null);
  const [serverSynced, setServerSynced] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Auth & Admin State (Setup Key + Optional Firebase Cloud Sync)
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isCloudAdmin, setIsCloudAdmin] = useState<boolean>(false);
  const [isPasskeyAdmin, setIsPasskeyAdmin] = useState<boolean>(false);
  const [passkeyAuthChecking, setPasskeyAuthChecking] = useState<boolean>(() => hasAdminSession());
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [emailPasswordProviderDisabled, setEmailPasswordProviderDisabled] = useState<boolean>(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [canAttemptFirstTimeSetup, setCanAttemptFirstTimeSetup] = useState<boolean>(false);
  const [adminAlerts, setAdminAlerts] = useState<AdminAlertRecord[]>([]);
  const [smtpEmailConfigured, setSmtpEmailConfigured] = useState<boolean>(false);
  const [smtpAuthError, setSmtpAuthError] = useState<string | null>(null);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const seededCollectionsRef = useRef<boolean>(false);
  const alertsHydratedRef = useRef<boolean>(false);
  const knownAlertIdsRef = useRef<Set<string>>(new Set());

  // Persistence for Cart
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('startone_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Persistence for Wishlist
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('startone_wishlist');
      return saved ? JSON.parse(saved) : ['malai-thean', 'desi-cow-ghee', 'abc-malt'];
    } catch {
      return ['malai-thean', 'desi-cow-ghee', 'abc-malt'];
    }
  });

  // Orders State
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('startone_orders');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return buildInitialSampleOrders();
  });

  // Admin notes State
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('banaya_admin_notes');
      return saved
        ? JSON.parse(saved)
        : {
            'STM-84920': 'Delivered via DTDC Courier. Customer praised Honey aroma.',
            'STM-85104': 'Customer requested fresh batch honey jar. Verified via WhatsApp.',
            'STM-85219': 'Joint pain soup ordered for elderly parents. Shipped priority.'
          };
    } catch {
      return {};
    }
  });

  // Media Folders State
  const [mediaFolders, setMediaFolders] = useState<MediaFolder[]>(() => {
    try {
      const saved = localStorage.getItem('banaya_media_folders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed as MediaFolder[];
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_MEDIA_FOLDERS;
  });

  const showToast = useCallback(
    (title: string, message: string, type: 'success' | 'info' | 'warning' = 'success', productImage?: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev.slice(-3), { id, title, message, type, productImage }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Verify persisted Setup Key on startup via server endpoint
  useEffect(() => {
    if (!hasAdminSession()) {
      setPasskeyAuthChecking(false);
      return;
    }
    const storedKey = getAdminSessionPasskey();
    if (!storedKey) {
      clearAdminSession();
      setPasskeyAuthChecking(false);
      return;
    }

    let cancelled = false;
    void fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey: storedKey })
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
          if (data?.ok) {
            setIsPasskeyAdmin(true);
            return;
          }
        }
        clearAdminSession();
        setIsPasskeyAdmin(false);
      })
      .catch(() => {
        if (!cancelled) {
          clearAdminSession();
          setIsPasskeyAdmin(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPasskeyAuthChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const unlockWithSetupKey = useCallback(
    async (setupKeyInput: string): Promise<boolean> => {
      const trimmed = setupKeyInput.trim();
      setAdminAuthError(null);
      setUnauthorizedDomain(null);

      if (!trimmed) {
        setAdminAuthError('Please enter your Administrator Setup Key.');
        return false;
      }

      try {
        const res = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passkey: trimmed })
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

        if (res.ok && data?.ok) {
          setAdminSessionPasskey(trimmed);
          setIsPasskeyAdmin(true);
          setAdminAuthError(null);
          showToast('Admin Portal Unlocked', 'Welcome back to Banaya Enterprises Admin.', 'success');
          return true;
        }

        clearAdminSession();
        setIsPasskeyAdmin(false);
        setAdminAuthError(data?.error || 'Invalid administrator setup key. Access denied.');
        return false;
      } catch {
        setAdminAuthError('Unable to verify setup key right now. Please try again.');
        return false;
      }
    },
    [showToast]
  );

  // Monitor Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setIsCloudAdmin(false);
        setPendingVerificationEmail(null);
        setAuthReady(true);
        return;
      }

      if (isVerifiedAdminEmail(user)) {
        setIsCloudAdmin(true);
        setAdminAuthError(null);
        setUnauthorizedDomain(null);
        setEmailPasswordProviderDisabled(false);
        setPendingVerificationEmail(null);
        setCanAttemptFirstTimeSetup(false);
        setAuthReady(true);
        return;
      }

      if (user.email && isAllowedAdminEmailString(user.email) && !user.emailVerified) {
        setIsCloudAdmin(false);
        setPendingVerificationEmail(user.email);
        setAuthReady(true);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        const hasAdminRole = Boolean(user.emailVerified && adminDoc.exists());
        setIsCloudAdmin(hasAdminRole);
        setPendingVerificationEmail(null);
        if (!hasAdminRole) {
          setAdminAuthError(
            `Signed in as ${user.email || 'unknown account'}. Only authorized store admin emails (${ADMIN_EMAILS.join(', ')}) can open the Admin Portal.`
          );
        }
      } catch {
        setIsCloudAdmin(false);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmailAdmin = useCallback(
    async (emailInput: string, passwordInput: string): Promise<boolean> => {
      const cleanEmail = emailInput.trim().toLowerCase();
      setAdminAuthError(null);
      setUnauthorizedDomain(null);
      setEmailPasswordProviderDisabled(false);
      setCanAttemptFirstTimeSetup(false);

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setAdminAuthError('Please enter a valid admin email address.');
        return false;
      }

      if (!passwordInput) {
        setAdminAuthError('Please enter your admin password.');
        return false;
      }

      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, passwordInput);
        const user = cred.user;

        let isAllowed = isVerifiedAdminEmail(user);
        if (!isAllowed && user.emailVerified) {
          const adminDoc = await getDoc(doc(db, 'admins', user.uid));
          isAllowed = adminDoc.exists();
        }

        if (isAllowed) {
          setIsCloudAdmin(true);
          setPendingVerificationEmail(null);
          showToast('Admin Signed In', `Welcome back (${cleanEmail}). Live store sync active.`, 'success');
          return true;
        }

        if (!user.emailVerified && isAllowedAdminEmailString(cleanEmail)) {
          setIsCloudAdmin(false);
          setPendingVerificationEmail(user.email || cleanEmail);
          setAdminAuthError(
            `Signed in, but ${cleanEmail} still needs a one-time email verification link to unlock live database publishing.`
          );
          return false;
        }

        await signOut(auth);
        setIsCloudAdmin(false);
        setAdminAuthError(
          `Access denied for ${cleanEmail}. Only authorized store admin accounts can open the Admin Portal.`
        );
        return false;
      } catch (error: unknown) {
        const errCode = (error as { code?: string })?.code || '';
        if (errCode === 'auth/operation-not-allowed') {
          setEmailPasswordProviderDisabled(true);
          setAdminAuthError(
            'Email/Password sign-in needs to be enabled once in Firebase Console Authentication settings.'
          );
        } else if (
          errCode === 'auth/user-not-found' ||
          errCode === 'auth/invalid-credential' ||
          errCode === 'auth/wrong-password'
        ) {
          if (isAllowedAdminEmailString(cleanEmail)) {
            setCanAttemptFirstTimeSetup(true);
          }
          setAdminAuthError(
            'Email or password did not match Firebase Auth. Check your password, click "Send Password Reset Email", or initialize the account if signing in for the first time.'
          );
        } else if (errCode === 'auth/too-many-requests') {
          setAdminAuthError('Too many failed attempts. Please wait a moment and try again.');
        } else {
          setAdminAuthError((error as Error)?.message || 'Unable to sign in with email and password.');
        }
        return false;
      }
    },
    [showToast]
  );

  const registerFirstAdminAccount = useCallback(
    async (emailInput: string, passwordInput: string): Promise<boolean> => {
      const cleanEmail = emailInput.trim().toLowerCase();
      setAdminAuthError(null);
      setEmailPasswordProviderDisabled(false);

      if (!isAllowedAdminEmailString(cleanEmail)) {
        setAdminAuthError(`Only authorized store admin emails (${ADMIN_EMAILS.join(', ')}) can be registered.`);
        return false;
      }
      if (!passwordInput || passwordInput.length < 6) {
        setAdminAuthError('Password must be at least 6 characters.');
        return false;
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordInput);
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // ignore throttled verification resend
        }
        setCanAttemptFirstTimeSetup(false);
        setPendingVerificationEmail(cred.user.email || cleanEmail);
        setAdminAuthError(
          `Admin account created. A verification link was sent to ${cleanEmail}. Open the link in Gmail, then click "I've Verified — Continue".`
        );
        showToast('Verification Email Sent', `Please verify ${cleanEmail} to activate live editing.`, 'info');
        return false;
      } catch (error: unknown) {
        const errCode = (error as { code?: string })?.code || '';
        if (errCode === 'auth/operation-not-allowed') {
          setEmailPasswordProviderDisabled(true);
          setAdminAuthError(
            'Enable Email/Password sign-in in Firebase Console Authentication settings first.'
          );
        } else if (errCode === 'auth/email-already-in-use') {
          setCanAttemptFirstTimeSetup(false);
          setAdminAuthError(
            `${cleanEmail} is already registered. Please enter the matching password or reset it in Firebase Console.`
          );
        } else {
          setAdminAuthError((error as Error)?.message || 'Failed to register admin account.');
        }
        return false;
      }
    },
    [showToast]
  );

  const resendAdminVerificationEmail = useCallback(async (): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) return false;
    try {
      await sendEmailVerification(user);
      showToast('Verification Sent', `Check ${user.email} inbox for the verification link.`, 'success');
      return true;
    } catch (error: unknown) {
      setAdminAuthError((error as Error)?.message || 'Could not send verification email right now.');
      return false;
    }
  }, [showToast]);

  const refreshAdminVerificationStatus = useCallback(async (): Promise<boolean> => {
    const user = auth.currentUser;
    if (!user) return false;
    try {
      await user.reload();
      await user.getIdToken(true);
      if (isVerifiedAdminEmail(user)) {
        setIsCloudAdmin(true);
        setPendingVerificationEmail(null);
        setAdminAuthError(null);
        showToast('Email Verified', 'Admin Portal unlocked with live cloud sync.', 'success');
        return true;
      }
      setAdminAuthError(
        `Still awaiting verification for ${user.email || 'admin account'}. Click the link in your Gmail inbox first.`
      );
      return false;
    } catch (error: unknown) {
      setAdminAuthError((error as Error)?.message || 'Could not refresh verification status.');
      return false;
    }
  }, [showToast]);

  const signInWithGoogleAdmin = useCallback(async (): Promise<boolean> => {
    setAdminAuthError(null);
    setUnauthorizedDomain(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;
      if (isVerifiedAdminEmail(user)) {
        setIsCloudAdmin(true);
        setPendingVerificationEmail(null);
        showToast('Cloud Admin Connected', 'Real-time live store sync is now active.', 'success');
        return true;
      }
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (user.emailVerified && adminDoc.exists()) {
        setIsCloudAdmin(true);
        setPendingVerificationEmail(null);
        showToast('Cloud Admin Connected', 'Real-time live store sync is now active.', 'success');
        return true;
      }
      setIsCloudAdmin(false);
      setAdminAuthError(
        `Signed in as ${user.email || 'unknown account'}. Only authorized store admin accounts (${ADMIN_EMAILS.join(', ')}) can open the Admin Portal.`
      );
      return false;
    } catch (error: unknown) {
      const errCode = (error as { code?: string })?.code || '';
      if (errCode === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setUnauthorizedDomain(host);
        setAdminAuthError(
          `This domain (${host}) needs to be allowlisted once in Firebase Authentication → Settings → Authorized domains.`
        );
      } else if (errCode === 'auth/popup-blocked') {
        setAdminAuthError('Browser blocked the Google sign-in popup. Please allow popups for this site and click Sign in again.');
      } else if (errCode === 'auth/popup-closed-by-user') {
        setAdminAuthError('Sign-in window was closed before completing login.');
      } else {
        setAdminAuthError((error as Error)?.message || 'Failed to sign in with Google.');
      }
      return false;
    }
  }, [showToast]);

  const signOutAdmin = useCallback(async (): Promise<void> => {
    clearAdminSession();
    setIsPasskeyAdmin(false);
    setIsCloudAdmin(false);
    setAdminAuthError(null);
    setUnauthorizedDomain(null);
    setEmailPasswordProviderDisabled(false);
    setPendingVerificationEmail(null);
    setCanAttemptFirstTimeSetup(false);
    try {
      await signOut(auth);
    } catch {
      // Ignore if signed in only with setup key
    }
    showToast('Portal Locked', 'Admin session locked securely.', 'info');
  }, [showToast]);

  const sendAdminPasswordReset = useCallback(
    async (emailInput: string): Promise<boolean> => {
      const cleanEmail = emailInput.trim().toLowerCase();
      setAdminAuthError(null);
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setAdminAuthError('Enter your admin email address first to receive a password reset link.');
        return false;
      }
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        showToast(
          'Password Reset Email Sent',
          `Open ${cleanEmail} inbox and click the Firebase link to set your new password.`,
          'success'
        );
        return true;
      } catch (error: unknown) {
        const errCode = (error as { code?: string })?.code || '';
        if (errCode === 'auth/user-not-found') {
          setAdminAuthError(
            `No password login exists yet for ${cleanEmail}. Sign in with Google first (then set a password in Admin Mail & Password), or use "Create Login" below.`
          );
          if (isAllowedAdminEmailString(cleanEmail)) {
            setCanAttemptFirstTimeSetup(true);
          }
        } else {
          setAdminAuthError((error as Error)?.message || 'Could not send password reset email.');
        }
        return false;
      }
    },
    [showToast]
  );

  const updateAdminPassword = useCallback(
    async (currentPasswordInput: string, newPasswordInput: string): Promise<boolean> => {
      const user = auth.currentUser;
      if (!user || !user.email) {
        showToast('Sign-In Required', 'Please sign in to the Admin Portal first.', 'warning');
        return false;
      }

      if (!newPasswordInput || newPasswordInput.length < 6) {
        showToast('Password Too Short', 'New password must be at least 6 characters.', 'warning');
        return false;
      }

      const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');

      try {
        if (!hasPasswordProvider) {
          const cred = EmailAuthProvider.credential(user.email, newPasswordInput);
          try {
            await linkWithCredential(user, cred);
          } catch (linkErr: unknown) {
            const linkCode = (linkErr as { code?: string })?.code || '';
            if (linkCode === 'auth/requires-recent-login') {
              await reauthenticateWithPopup(user, googleProvider);
              await linkWithCredential(user, cred);
            } else {
              throw linkErr;
            }
          }
          await user.reload();
          setFirebaseUser(auth.currentUser);
          showToast(
            'Admin Password Set',
            `You can now sign in with ${user.email} and your new password.`,
            'success'
          );
          return true;
        }

        if (currentPasswordInput) {
          const cred = EmailAuthProvider.credential(user.email, currentPasswordInput);
          await reauthenticateWithCredential(user, cred);
        }

        try {
          await updatePassword(user, newPasswordInput);
        } catch (updErr: unknown) {
          const updCode = (updErr as { code?: string })?.code || '';
          if (updCode === 'auth/requires-recent-login' && !currentPasswordInput) {
            if (user.providerData.some((p) => p.providerId === 'google.com')) {
              await reauthenticateWithPopup(user, googleProvider);
              await updatePassword(user, newPasswordInput);
            } else {
              throw new Error('Please enter your Current Password above to confirm this password change.');
            }
          } else {
            throw updErr;
          }
        }

        showToast('Password Updated', `Admin password updated for ${user.email}.`, 'success');
        return true;
      } catch (error: unknown) {
        const errCode = (error as { code?: string })?.code || '';
        if (errCode === 'auth/operation-not-allowed') {
          setEmailPasswordProviderDisabled(true);
          showToast(
            'Enable Email/Password in Firebase',
            'Enable Email/Password provider once in Firebase Console -> Authentication -> Sign-in method.',
            'warning'
          );
        } else if (errCode === 'auth/wrong-password' || errCode === 'auth/invalid-credential') {
          showToast(
            'Current Password Mismatch',
            'Current password did not match. Leave it blank if re-authenticating via Google, or use Reset Password.',
            'warning'
          );
        } else {
          showToast('Password Update Failed', (error as Error)?.message || 'Unable to update password.', 'warning');
        }
        return false;
      }
    },
    [showToast]
  );

  const updateAdminEmailAddress = useCallback(
    async (currentPasswordInput: string, newEmailInput: string): Promise<boolean> => {
      const user = auth.currentUser;
      if (!user || !user.email) {
        showToast('Sign-In Required', 'Please sign in to the Admin Portal first.', 'warning');
        return false;
      }

      const cleanNewEmail = clampString(newEmailInput.trim().toLowerCase(), 160);
      if (!cleanNewEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanNewEmail)) {
        showToast('Invalid Email', 'Please enter a valid admin email address.', 'warning');
        return false;
      }

      if (cleanNewEmail === user.email.toLowerCase()) {
        showToast('Same Email', `Your admin account already uses ${cleanNewEmail}.`, 'info');
        return true;
      }

      try {
        if (currentPasswordInput && user.providerData.some((p) => p.providerId === 'password')) {
          const cred = EmailAuthProvider.credential(user.email, currentPasswordInput);
          await reauthenticateWithCredential(user, cred);
        }

        // Preserve admin authorization for this UID in Firestore admins/{uid} before switching email
        const adminRef = doc(db, 'admins', user.uid);
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
          await updateDoc(adminRef, { email: cleanNewEmail });
        } else {
          await setDoc(adminRef, {
            uid: user.uid,
            email: cleanNewEmail,
            createdAt: serverTimestamp()
          });
        }

        try {
          await verifyBeforeUpdateEmail(user, cleanNewEmail);
        } catch (emailErr: unknown) {
          const emailCode = (emailErr as { code?: string })?.code || '';
          if (emailCode === 'auth/requires-recent-login') {
            if (user.providerData.some((p) => p.providerId === 'google.com')) {
              await reauthenticateWithPopup(user, googleProvider);
              await verifyBeforeUpdateEmail(user, cleanNewEmail);
            } else {
              throw new Error('Please enter your Current Password first to confirm changing your Admin Mail ID.');
            }
          } else {
            throw emailErr;
          }
        }

        showToast(
          'Verification Link Sent',
          `Open ${cleanNewEmail} inbox and click the confirmation link to switch your Admin Mail ID.`,
          'success'
        );
        return true;
      } catch (error: unknown) {
        showToast(
          'Mail ID Update Failed',
          (error as Error)?.message || 'Unable to update admin email address.',
          'warning'
        );
        return false;
      }
    },
    [showToast]
  );

  const clearAdminAuthError = useCallback(() => {
    setAdminAuthError(null);
    setUnauthorizedDomain(null);
    setEmailPasswordProviderDisabled(false);
  }, []);

  // Seed empty Firestore collections cleanly once an authorized admin connects
  const seedInitialFirestoreData = useCallback(async (uid: string) => {
    if (seededCollectionsRef.current) return;
    seededCollectionsRef.current = true;

    try {
      const productsSnap = await getDocs(collection(db, 'products'));
      if (productsSnap.empty) {
        const batch = writeBatch(db);
        for (const prod of PRODUCTS) {
          const clean = buildProductFirestoreFields(healLegacyProductImages(prod), uid);
          batch.set(doc(db, 'products', clean.id), {
            ...clean,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }

    try {
      const foldersSnap = await getDocs(collection(db, 'mediaFolders'));
      if (foldersSnap.empty) {
        for (const folder of DEFAULT_MEDIA_FOLDERS) {
          const cleanFolderId = sanitizeFirestoreId(folder.id, 'folder');
          await setDoc(doc(db, 'mediaFolders', cleanFolderId), {
            id: cleanFolderId,
            name: clampString(folder.name, 120),
            ownerUid: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          const imgBatch = writeBatch(db);
          for (const img of folder.images) {
            const cleanImgId = sanitizeFirestoreId(img.id, 'img');
            imgBatch.set(doc(db, 'mediaFolders', cleanFolderId, 'images', cleanImgId), {
              id: cleanImgId,
              folderId: cleanFolderId,
              name: clampString(img.name, 160),
              url: clampString(img.url, 300_000),
              ownerUid: uid,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          await imgBatch.commit();
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'mediaFolders');
    }

    try {
      const ordersSnap = await getDocs(collection(db, 'orders'));
      if (ordersSnap.empty) {
        const sampleOrders = buildInitialSampleOrders();
        const orderBatch = writeBatch(db);
        for (const ord of sampleOrders) {
          const cleanOrderId = sanitizeFirestoreId(ord.id, 'ord');
          const mappedStatus = ord.status === 'Delivered' || ord.status === 'Shipped' ? 'Confirmed' : ord.status;
          orderBatch.set(doc(db, 'orders', cleanOrderId), {
            id: cleanOrderId,
            receiptNumber: formatReceiptNumber(cleanOrderId),
            date: ord.date,
            items: ord.items.map((it) => ({
              quantity: it.quantity,
              selectedWeight: it.selectedWeight,
              product: {
                id: it.product.id,
                name: it.product.name,
                price: it.product.price,
                image: it.product.image
              }
            })),
            subtotal: ord.subtotal,
            discount: ord.discount,
            shipping: ord.shipping,
            totalAmount: ord.totalAmount,
            status: mappedStatus,
            customerName: ord.customerName,
            phone: ord.phone,
            email: ord.email || '',
            shippingAddress: ord.shippingAddress,
            city: ord.city,
            postalCode: ord.postalCode,
            paymentMethod: ord.paymentMethod,
            trackingNumber: ord.trackingNumber || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          orderBatch.set(doc(db, 'orderStatus', cleanOrderId), {
            orderId: cleanOrderId,
            receiptNumber: formatReceiptNumber(cleanOrderId),
            status: mappedStatus,
            paymentVerified: mappedStatus !== 'Processing',
            trackingNumber: ord.trackingNumber || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          orderBatch.set(doc(db, 'adminAlerts', cleanOrderId), {
            orderId: cleanOrderId,
            receiptNumber: formatReceiptNumber(cleanOrderId),
            customerName: ord.customerName,
            phone: ord.phone,
            email: ord.email || '',
            totalAmount: ord.totalAmount,
            paymentMethod: ord.paymentMethod,
            transactionId: ord.transactionId || '',
            itemsSummary: ord.items.map((it) => `${it.product.name} (${it.selectedWeight}) x${it.quantity}`).join(', ').slice(0, 600),
            alertStatus: mappedStatus === 'Processing' ? 'unread' : 'verified',
            customerNotified: mappedStatus !== 'Processing',
            emailSent: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
        await orderBatch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    }
  }, []);

  // Trigger one-time cloud seed if admin logs into brand-new Firestore database
  useEffect(() => {
    if (authReady && isCloudAdmin && firebaseUser) {
      void seedInitialFirestoreData(firebaseUser.uid);
    }
  }, [authReady, isCloudAdmin, firebaseUser, seedInitialFirestoreData]);

  // 1. Live Public Product Catalog Listener (All Visitors + Vercel + Dev)
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      broadcastChannelRef.current = channel;
      channel.onmessage = (event: MessageEvent<{ products?: Product[]; updatedAt?: number }>) => {
        if (Array.isArray(event.data?.products) && event.data.products.length > 0) {
          setProducts(sortCatalogByCanonicalOrder(event.data.products.map(healLegacyProductImages)));
          setLastSyncedAt(event.data.updatedAt || Date.now());
        }
      };
    }

    const unsubscribe = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        setServerSynced(true);
        setLastSyncedAt(Date.now());
        if (!snapshot.empty) {
          const liveProducts = snapshot.docs.map((docSnap) => {
            const d = docSnap.data() as Product;
            return healLegacyProductImages({
              ...d,
              id: d.id || docSnap.id
            });
          });
          setProducts(sortCatalogByCanonicalOrder(liveProducts));
        }
      },
      (error) => {
        setServerSynced(false);
        handleFirestoreError(error, OperationType.LIST, 'products');
      }
    );

    return () => {
      unsubscribe();
      broadcastChannelRef.current?.close();
    };
  }, []);

  // 2. Admin-Only Live Listeners (Media Folders, Orders, Notes — ONLY when authReady && isCloudAdmin)
  useEffect(() => {
    if (!authReady || !isCloudAdmin) return;

    const imageListeners = new Map<string, () => void>();
    const folderMetaMap = new Map<string, { id: string; name: string; createdAt: number }>();
    const folderImagesMap = new Map<string, MediaFolderImage[]>();

    const rebuildFolders = () => {
      const merged: MediaFolder[] = Array.from(folderMetaMap.values())
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((meta) => ({
          id: meta.id,
          name: meta.name,
          createdAt: meta.createdAt,
          images: folderImagesMap.get(meta.id) || []
        }));
      setMediaFolders(merged);
    };

    const unsubFolders = onSnapshot(
      collection(db, 'mediaFolders'),
      (snap) => {
        const currentIds = new Set<string>();
        snap.docs.forEach((docSnap) => {
          const d = docSnap.data() as { id?: string; name?: string; createdAt?: { toMillis?: () => number } };
          const folderId = d.id || docSnap.id;
          currentIds.add(folderId);
          folderMetaMap.set(folderId, {
            id: folderId,
            name: d.name || 'Folder',
            createdAt: typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : Date.now()
          });

          if (!imageListeners.has(folderId)) {
            const unsubImgs = onSnapshot(
              collection(db, 'mediaFolders', folderId, 'images'),
              (imgSnap) => {
                const imgs: MediaFolderImage[] = imgSnap.docs
                  .map((imgDoc) => {
                    const idata = imgDoc.data() as {
                      id?: string;
                      name?: string;
                      url?: string;
                      createdAt?: { toMillis?: () => number };
                    };
                    return {
                      id: idata.id || imgDoc.id,
                      name: idata.name || 'Product Photo',
                      url: idata.url || '/images/banaya_logo.png',
                      createdAt: typeof idata.createdAt?.toMillis === 'function' ? idata.createdAt.toMillis() : Date.now()
                    };
                  })
                  .sort((a, b) => a.createdAt - b.createdAt);
                folderImagesMap.set(folderId, imgs);
                rebuildFolders();
              },
              (err) => {
                handleFirestoreError(err, OperationType.LIST, `mediaFolders/${folderId}/images`);
              }
            );
            imageListeners.set(folderId, unsubImgs);
          }
        });

        // Cleanup removed folder listeners
        for (const [fId, unsub] of imageListeners.entries()) {
          if (!currentIds.has(fId)) {
            unsub();
            imageListeners.delete(fId);
            folderMetaMap.delete(fId);
            folderImagesMap.delete(fId);
          }
        }
        rebuildFolders();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'mediaFolders');
      }
    );

    const unsubOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        if (!snap.empty) {
          const liveOrders = snap.docs
            .map((docSnap) => docSnap.data() as Order)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          setOrders(liveOrders);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      }
    );

    const unsubNotes = onSnapshot(
      collection(db, 'adminNotes'),
      (snap) => {
        const notesObj: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { orderId?: string; note?: string };
          notesObj[data.orderId || d.id] = data.note || '';
        });
        setAdminNotes(notesObj);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'adminNotes');
      }
    );

    const unsubAlerts = onSnapshot(
      collection(db, 'adminAlerts'),
      (snap) => {
        const parsedAlerts: AdminAlertRecord[] = snap.docs
          .map((d) => {
            const data = d.data() as Partial<AdminAlertRecord> & { createdAt?: { toMillis?: () => number } };
            return {
              orderId: data.orderId || d.id,
              receiptNumber: data.receiptNumber || formatReceiptNumber(data.orderId || d.id),
              customerName: data.customerName || 'Customer',
              phone: data.phone || '',
              email: data.email || '',
              totalAmount: Number(data.totalAmount) || 0,
              paymentMethod: data.paymentMethod || 'Online Payment',
              transactionId: data.transactionId || '',
              itemsSummary: data.itemsSummary || '',
              alertStatus: (data.alertStatus as AdminAlertRecord['alertStatus']) || 'unread',
              customerNotified: Boolean(data.customerNotified),
              emailSent: Boolean(data.emailSent),
              createdAtMs: typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : Date.now()
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        if (alertsHydratedRef.current) {
          const brandNewUnread = parsedAlerts.filter(
            (a) => a.alertStatus === 'unread' && !knownAlertIdsRef.current.has(a.orderId)
          );
          if (brandNewUnread.length > 0) {
            playAdminAlertChime();
            const latest = brandNewUnread[0];
            showToast(
              `New Order Receipt Alert (${latest.receiptNumber})`,
              `${latest.customerName} paid ₹${latest.totalAmount.toLocaleString('en-IN')} via ${latest.paymentMethod}.`,
              'success'
            );
          }
        } else {
          alertsHydratedRef.current = true;
        }

        knownAlertIdsRef.current = new Set(parsedAlerts.map((a) => a.orderId));
        setAdminAlerts(parsedAlerts);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'adminAlerts');
      }
    );

    void fetch('/api/notifications/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((info: { smtpConfigured?: boolean; smtpAuthError?: string | null } | null) => {
        if (info && typeof info.smtpConfigured === 'boolean') {
          setSmtpEmailConfigured(info.smtpConfigured);
        }
        if (info && 'smtpAuthError' in info) {
          setSmtpAuthError(info.smtpAuthError || null);
        }
      })
      .catch(() => {
        // ignore if server endpoint unavailable in static hosting
      });

    return () => {
      unsubFolders();
      unsubOrders();
      unsubNotes();
      unsubAlerts();
      alertsHydratedRef.current = false;
      imageListeners.forEach((unsub) => unsub());
      imageListeners.clear();
    };
  }, [authReady, isCloudAdmin, showToast]);

  // 2b. Hydrate orders, folders & notes from Express /api/store when unlocked via Setup Key without Cloud Sync
  useEffect(() => {
    if (!isPasskeyAdmin || isCloudAdmin) return;
    let cancelled = false;

    void fetch('/api/store')
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) return null;
        return res.json();
      })
      .then(
        (
          data: {
            products?: Product[];
            orders?: Order[];
            adminNotes?: Record<string, string>;
            mediaFolders?: MediaFolder[];
            updatedAt?: number;
          } | null
        ) => {
          if (cancelled || !data) return;
          if (Array.isArray(data.orders)) {
            setOrders(data.orders);
          }
          if (data.adminNotes && typeof data.adminNotes === 'object') {
            setAdminNotes(data.adminNotes);
          }
          if (Array.isArray(data.mediaFolders)) {
            setMediaFolders(data.mediaFolders);
          }
          if (Array.isArray(data.products) && data.products.length > 0 && !serverSynced) {
            setProducts(sortCatalogByCanonicalOrder(data.products.map(healLegacyProductImages)));
          }
          if (typeof data.updatedAt === 'number') {
            setLastSyncedAt(data.updatedAt);
          }
        }
      )
      .catch(() => {
        // Static Vercel deployment relies on Firestore when Cloud Sync is connected
      });

    return () => {
      cancelled = true;
    };
  }, [isPasskeyAdmin, isCloudAdmin, serverSynced]);

  // Local cache fallback (never throws if quota reached)
  useEffect(() => {
    try {
      localStorage.setItem('banaya_products', JSON.stringify(products));
    } catch {
      // ignore quota limits since Firestore holds authoritative catalog
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem('banaya_admin_notes', JSON.stringify(adminNotes));
    } catch {
      // ignore
    }
  }, [adminNotes]);

  useEffect(() => {
    try {
      localStorage.setItem('banaya_media_folders', JSON.stringify(mediaFolders));
    } catch {
      // ignore
    }
  }, [mediaFolders]);

  useEffect(() => {
    try {
      localStorage.setItem('startone_cart', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem('startone_wishlist', JSON.stringify(wishlist));
    } catch {
      // ignore
    }
  }, [wishlist]);

  useEffect(() => {
    try {
      localStorage.setItem('startone_orders', JSON.stringify(orders));
    } catch {
      // ignore
    }
  }, [orders]);

  // Synchronize Cart product snapshots whenever catalog rates/images update
  useEffect(() => {
    setCart((prevCart) => {
      let changed = false;
      const nextCart = prevCart.map((item) => {
        const latest = products.find((p) => p.id === item.product.id);
        if (
          latest &&
          (latest.price !== item.product.price ||
            latest.originalPrice !== item.product.originalPrice ||
            latest.image !== item.product.image ||
            latest.name !== item.product.name)
        ) {
          changed = true;
          return { ...item, product: latest };
        }
        return item;
      });
      return changed ? nextCart : prevCart;
    });
  }, [products]);

  // Keep selectedProduct synced with live catalog updates
  const selectedProduct = useMemo(() => {
    if (!selectedProductState) return null;
    return products.find((p) => p.id === selectedProductState.id) || selectedProductState;
  }, [selectedProductState, products]);

  const setSelectedProduct = (product: Product | null) => {
    setSelectedProductState(product);
  };

  const addToCart = (product: Product, quantity = 1, weight?: string) => {
    const latest = products.find((p) => p.id === product.id) || product;
    if (!latest.inStock) {
      showToast('Out of Stock', `${latest.name} is currently out of stock.`, 'warning', latest.image);
      return;
    }
    const selectedWeight = weight || latest.defaultWeight;

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product.id === latest.id && item.selectedWeight === selectedWeight
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity
        };
        return updated;
      }
      return [...prev, { product: latest, quantity, selectedWeight }];
    });

    showToast('Added to Cart', `${latest.name} (${selectedWeight}) has been added to your bag.`, 'success', latest.image);
  };

  const removeFromCart = (productId: string, weight: string) => {
    setCart((prev) => prev.filter((item) => !(item.product.id === productId && item.selectedWeight === weight)));
    showToast('Removed', 'Item was removed from your bag.', 'info');
  };

  const updateQuantity = (productId: string, weight: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId, weight);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId && item.selectedWeight === weight ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const toggleWishlist = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    setWishlist((prev) => {
      const exists = prev.includes(productId);
      if (exists) {
        showToast('Removed from Wishlist', `${product?.name || 'Item'} was removed from your wishlist.`, 'info');
        return prev.filter((id) => id !== productId);
      }
      showToast('Saved to Wishlist', `${product?.name || 'Item'} added to your wishlist.`, 'success', product?.image);
      return [...prev, productId];
    });
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  const applyCoupon = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode === 'BANAYANA10' || cleanCode === 'STARTONE10') {
      setAppliedCoupon({ code: cleanCode, discountPercent: 10, discountFixed: 0 });
      showToast('Coupon Applied!', '10% discount applied to your order.', 'success');
      return { success: true, message: '10% OFF coupon applied successfully!' };
    }
    if (cleanCode === 'NATURAL15') {
      if (cartSubtotal < 999) {
        return { success: false, message: 'NATURAL15 requires a minimum order of ₹999' };
      }
      setAppliedCoupon({ code: 'NATURAL15', discountPercent: 15, discountFixed: 0 });
      showToast('Coupon Applied!', '15% discount applied to your order.', 'success');
      return { success: true, message: '15% OFF coupon applied successfully!' };
    }
    if (cleanCode === 'FREESHIP') {
      setAppliedCoupon({ code: 'FREESHIP', discountPercent: 0, discountFixed: 0 });
      showToast('Coupon Applied!', 'Free shipping voucher applied.', 'success');
      return { success: true, message: 'Free shipping voucher applied!' };
    }
    return { success: false, message: 'Invalid coupon code. Try BANAYANA10 or NATURAL15' };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    showToast('Coupon Removed', 'Promo code removed from cart.', 'info');
  };

  const openProductDetail = (product: Product) => {
    setSelectedProductState(product);
    setActiveModal('quickView');
  };

  const openQuickCheckout = (product: Product, weight?: string) => {
    const latest = products.find((p) => p.id === product.id) || product;
    if (!latest.inStock) {
      showToast('Out of Stock', `${latest.name} is currently out of stock.`, 'warning', latest.image);
      return;
    }
    addToCart(latest, 1, weight);
    setActiveModal('checkout');
  };

  const openOrderTracking = (orderId: string) => {
    setTrackingLookupId(orderId);
    setActiveModal('trackOrder');
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getEffectivePrice = (item: CartItem) => {
    const latest = products.find((p) => p.id === item.product.id) || item.product;
    return getPriceForProductWeight(latest, item.selectedWeight).price;
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + getEffectivePrice(item) * item.quantity, 0);

  const freeShippingThreshold = 499;
  const isFreeShippingByValue = cartSubtotal >= freeShippingThreshold;
  const isFreeShippingByCoupon = appliedCoupon?.code === 'FREESHIP';
  const cartShipping = cartSubtotal === 0 || isFreeShippingByValue || isFreeShippingByCoupon ? 0 : 60;

  let cartDiscount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountPercent > 0) {
      cartDiscount = Math.round((cartSubtotal * appliedCoupon.discountPercent) / 100);
    } else if (appliedCoupon.discountFixed > 0 && !isFreeShippingByValue) {
      cartDiscount = appliedCoupon.discountFixed;
    }
  }

  const cartTotal = Math.max(0, cartSubtotal - cartDiscount + cartShipping);
  const freeShippingRemaining = Math.max(0, freeShippingThreshold - cartSubtotal);

  const placeOrder = async (details: {
    customerName: string;
    phone: string;
    email: string;
    shippingAddress: string;
    city: string;
    postalCode: string;
    paymentMethod: string;
    transactionId?: string;
    bankRef?: string;
  }): Promise<Order> => {
    const orderNumber = Math.floor(10000 + Math.random() * 90000);
    const trackingCode = `BNY${Math.floor(10000000 + Math.random() * 90000000)}IN`;
    const submittedTxnId = clampString((details.transactionId || details.bankRef || '').trim(), 120);
    const submittedBankRef = clampString((details.bankRef || details.transactionId || '').trim(), 120);
    const cleanId = sanitizeFirestoreId(`BNY-${orderNumber}`, 'BNY');
    const receiptNumber = formatReceiptNumber(cleanId);
    const itemsSummary = clampString(
      cart.map((it) => `${it.product.name} (${it.selectedWeight}) x${it.quantity}`).join(', '),
      600
    );

    const newOrder: Order = {
      id: cleanId,
      receiptNumber,
      date: new Date().toISOString().split('T')[0],
      items: [...cart],
      subtotal: cartSubtotal,
      discount: cartDiscount,
      shipping: cartShipping,
      totalAmount: cartTotal,
      status: 'Processing',
      customerName: clampString(details.customerName, 160) || 'Customer',
      phone: clampString(details.phone, 40) || '0000000000',
      email: clampString(details.email, 160),
      shippingAddress: clampString(details.shippingAddress, 400) || 'Address Provided',
      city: clampString(details.city, 100) || 'Tamil Nadu',
      postalCode: clampString(details.postalCode, 20) || '600001',
      paymentMethod: clampString(details.paymentMethod, 160) || 'Razorpay',
      trackingNumber: trackingCode,
      transactionId: submittedTxnId,
      bankRef: submittedBankRef
    };

    // Push order, non-PII live tracker, and admin alert receipt atomically to Firestore
    const firestoreOrderPayload = {
      id: newOrder.id,
      receiptNumber,
      date: newOrder.date,
      items: newOrder.items.slice(0, 30).map((it) => ({
        quantity: it.quantity,
        selectedWeight: clampString(it.selectedWeight, 40),
        product: {
          id: it.product.id,
          name: clampString(it.product.name, 160),
          price: Number(it.product.price) || 0,
          image: clampString(it.product.image, 250_000)
        }
      })),
      subtotal: Number(newOrder.subtotal) || 0,
      discount: Number(newOrder.discount) || 0,
      shipping: Number(newOrder.shipping) || 0,
      totalAmount: Number(newOrder.totalAmount) || 0,
      status: 'Processing',
      customerName: newOrder.customerName,
      phone: newOrder.phone,
      email: newOrder.email || '',
      shippingAddress: newOrder.shippingAddress,
      city: newOrder.city,
      postalCode: newOrder.postalCode,
      paymentMethod: newOrder.paymentMethod,
      trackingNumber: newOrder.trackingNumber || '',
      transactionId: newOrder.transactionId || '',
      bankRef: newOrder.bankRef || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const publicStatusPayload = {
      orderId: cleanId,
      receiptNumber,
      status: 'Processing',
      paymentVerified: false,
      trackingNumber: newOrder.trackingNumber || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const adminAlertPayload = {
      orderId: cleanId,
      receiptNumber,
      customerName: newOrder.customerName,
      phone: newOrder.phone,
      email: newOrder.email || '',
      totalAmount: Number(newOrder.totalAmount) || 0,
      paymentMethod: newOrder.paymentMethod,
      transactionId: newOrder.transactionId || '',
      itemsSummary,
      alertStatus: 'unread',
      customerNotified: false,
      emailSent: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'orders', cleanId), firestoreOrderPayload);
    batch.set(doc(db, 'orderStatus', cleanId), publicStatusPayload);
    batch.set(doc(db, 'adminAlerts', cleanId), adminAlertPayload);

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${cleanId}`);
    }

    setOrders((prev) => [newOrder, ...prev]);
    clearCart();
    setAppliedCoupon(null);

    // Dispatch automatic backend receipt alert (records server receipt log + auto-emails if SMTP configured)
    void fetch('/api/notifications/order-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder)
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { smtpConfigured?: boolean; smtpAuthError?: string | null } | null) => {
        if (data && typeof data.smtpConfigured === 'boolean') {
          setSmtpEmailConfigured(data.smtpConfigured);
        }
        if (data && 'smtpAuthError' in data) {
          setSmtpAuthError(data.smtpAuthError || null);
        }
      })
      .catch(() => {
        // Static deployments rely on Firestore real-time adminAlerts listener
      });

    return newOrder;
  };

  const trackOrderById = (orderId: string): Order | null => {
    const cleanId = orderId.trim().toUpperCase();
    return orders.find((o) => o.id.toUpperCase() === cleanId || o.trackingNumber.toUpperCase() === cleanId) || null;
  };

  const saveProductToFirestore = async (product: Product, isNewCreate: boolean): Promise<boolean> => {
    const uid = auth.currentUser?.uid;
    const passkey = getAdminSessionPasskey();
    if ((!uid || !isCloudAdmin) && !isPasskeyAdmin) {
      showToast('Admin Unlock Required', 'Please unlock the Admin Portal with your Setup Key first.', 'warning');
      return false;
    }

    const healed = healLegacyProductImages(product);
    const fields = buildProductFirestoreFields(healed, uid || 'setup-key-admin');

    if (calculateGalleryByteSize(fields.gallery) > MAX_PRODUCT_GALLERY_BYTES) {
      showToast(
        'Too Many High-Res Photos',
        'Please keep under 6 uploaded photos per product or remove unused gallery slots before saving.',
        'warning'
      );
      return false;
    }

    const prevProducts = products;
    const existsInState = prevProducts.some((p) => p.id === fields.id);
    const optimisticProduct: Product = {
      ...healed,
      ...fields
    };
    const nextProducts = sortCatalogByCanonicalOrder(
      existsInState && !isNewCreate
        ? prevProducts.map((p) => (p.id === fields.id ? optimisticProduct : p))
        : [optimisticProduct, ...prevProducts.filter((p) => p.id !== fields.id)]
    );
    setProducts(nextProducts);
    broadcastChannelRef.current?.postMessage({ products: nextProducts, updatedAt: Date.now() });

    if (!uid || !isCloudAdmin) {
      try {
        const res = await fetch(
          isNewCreate ? '/api/products' : `/api/products/${encodeURIComponent(fields.id)}`,
          {
            method: isNewCreate ? 'POST' : 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-passkey': passkey
            },
            body: JSON.stringify(optimisticProduct)
          }
        );
        if (res.status === 401) {
          clearAdminSession();
          setIsPasskeyAdmin(false);
          setProducts(prevProducts);
          showToast('Session Expired', 'Please re-enter your Administrator Setup Key.', 'warning');
          return false;
        }
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) {
          setProducts(prevProducts);
          showToast(
            'Cloud Sync Required',
            'Click "Connect Cloud Sync" in the Admin sidebar to publish edits live to all visitor devices.',
            'warning'
          );
          return false;
        }
        const data = (await res.json()) as { products?: Product[]; updatedAt?: number };
        if (Array.isArray(data.products) && data.products.length > 0) {
          const healedCatalog = sortCatalogByCanonicalOrder(data.products.map(healLegacyProductImages));
          setProducts(healedCatalog);
          broadcastChannelRef.current?.postMessage({ products: healedCatalog, updatedAt: Date.now() });
        }
        setServerSynced(true);
        setLastSyncedAt(data.updatedAt || Date.now());
        showToast(
          isNewCreate ? 'Product Published Live' : 'Website Updated',
          `${fields.name} (₹${fields.price}) saved successfully.`,
          'success',
          fields.image
        );
        return true;
      } catch {
        setProducts(prevProducts);
        showToast(
          'Cloud Sync Required',
          'Click "Connect Cloud Sync" in the Admin sidebar to save edits to the live database.',
          'warning'
        );
        return false;
      }
    }

    const docRef = doc(db, 'products', fields.id);
    const docPath = `products/${fields.id}`;

    try {
      const existingSnap = await getDoc(docRef);
      if (existingSnap.exists()) {
        const { id: _ignoreId, ...updatableFields } = fields;
        await updateDoc(docRef, {
          ...updatableFields,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(docRef, {
          ...fields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      if (passkey) {
        void fetch(isNewCreate ? '/api/products' : `/api/products/${encodeURIComponent(fields.id)}`, {
          method: isNewCreate ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-admin-passkey': passkey },
          body: JSON.stringify(optimisticProduct)
        }).catch(() => {});
      }

      setServerSynced(true);
      setLastSyncedAt(Date.now());
      showToast(
        isNewCreate ? 'Product Published Live' : 'Live Website Updated',
        `${fields.name} (₹${fields.price}) is now live across all visitor devices.`,
        'success',
        fields.image
      );
      return true;
    } catch (error) {
      setProducts(prevProducts);
      showToast(
        'Publish Failed',
        error instanceof Error && error.message.includes('Missing or insufficient permissions')
          ? 'Please connect Google Cloud Sync to publish changes to Firestore.'
          : 'Could not save changes to the cloud database. Please try again.',
        'warning'
      );
      handleFirestoreError(error, existingSnapOperation(isNewCreate), docPath);
    }
  };

  function existingSnapOperation(isNewCreate: boolean): OperationType {
    return isNewCreate ? OperationType.CREATE : OperationType.UPDATE;
  }

  const updateProduct = async (updatedProduct: Product): Promise<boolean> => {
    try {
      return await saveProductToFirestore(updatedProduct, false);
    } catch {
      return false;
    }
  };

  const addProduct = async (newProduct: Product): Promise<boolean> => {
    try {
      return await saveProductToFirestore(newProduct, true);
    } catch {
      return false;
    }
  };

  const deleteProduct = async (productId: string): Promise<boolean> => {
    const uid = auth.currentUser?.uid;
    const passkey = getAdminSessionPasskey();
    if ((!uid || !isCloudAdmin) && !isPasskeyAdmin) {
      showToast('Admin Unlock Required', 'Please unlock the Admin Portal with your Setup Key.', 'warning');
      return false;
    }
    const prod = products.find((p) => p.id === productId);
    const cleanId = sanitizeFirestoreId(productId, 'prod');
    const prevProducts = products;
    const nextProducts = prevProducts.filter((p) => p.id !== cleanId);
    setProducts(nextProducts);

    if (!uid || !isCloudAdmin) {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(cleanId)}`, {
          method: 'DELETE',
          headers: { 'x-admin-passkey': passkey }
        });
        if (!res.ok) {
          setProducts(prevProducts);
          showToast(
            'Cloud Sync Required',
            'Click "Connect Cloud Sync" in the Admin sidebar to delete products from the live database.',
            'warning'
          );
          return false;
        }
        broadcastChannelRef.current?.postMessage({ products: nextProducts, updatedAt: Date.now() });
        showToast('Removed from Website', `${prod?.name || 'Product'} removed from catalog.`, 'info');
        return true;
      } catch {
        setProducts(prevProducts);
        showToast('Delete Failed', 'Could not delete product right now.', 'warning');
        return false;
      }
    }

    try {
      await deleteDoc(doc(db, 'products', cleanId));
      if (passkey) {
        void fetch(`/api/products/${encodeURIComponent(cleanId)}`, {
          method: 'DELETE',
          headers: { 'x-admin-passkey': passkey }
        }).catch(() => {});
      }
      broadcastChannelRef.current?.postMessage({ products: nextProducts, updatedAt: Date.now() });
      showToast('Removed from Live Website', `${prod?.name || 'Product'} removed from live catalog.`, 'info');
      return true;
    } catch (error) {
      setProducts(prevProducts);
      showToast('Delete Failed', 'Could not delete product from cloud database.', 'warning');
      handleFirestoreError(error, OperationType.DELETE, `products/${cleanId}`);
    }
  };

  // Media Folders Management (Firestore Subcollection + Server API fallback)
  const createMediaFolder = async (name: string): Promise<MediaFolder | null> => {
    const cleanName = clampString(name, 120);
    if (!cleanName) return null;

    const uid = auth.currentUser?.uid;
    const passkey = getAdminSessionPasskey();
    if ((!uid || !isCloudAdmin) && !isPasskeyAdmin) {
      showToast('Admin Unlock Required', 'Please unlock the Admin Portal with your Setup Key.', 'warning');
      return null;
    }

    const existing = mediaFolders.find((f) => f.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
      showToast('Folder Ready', `Using existing folder "${existing.name}".`, 'info');
      return existing;
    }

    if (!uid || !isCloudAdmin) {
      try {
        const res = await fetch('/api/media/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-passkey': passkey },
          body: JSON.stringify({ name: cleanName })
        });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) {
          showToast(
            'Cloud Sync Required',
            'Click "Connect Cloud Sync" in the Admin sidebar to save image folders to Firebase.',
            'warning'
          );
          return null;
        }
        const data = (await res.json()) as { folder?: MediaFolder; mediaFolders?: MediaFolder[] };
        if (Array.isArray(data.mediaFolders)) {
          setMediaFolders(data.mediaFolders);
        } else if (data.folder) {
          setMediaFolders((prev) => [data.folder!, ...prev]);
        }
        showToast('Folder Created', `"${cleanName}" saved to your image library.`, 'success');
        return data.folder || null;
      } catch {
        showToast('Folder Error', 'Could not create folder.', 'warning');
        return null;
      }
    }

    const folderId = sanitizeFirestoreId(`folder-${cleanName.toLowerCase()}-${Date.now().toString(36)}`, 'folder');
    const created: MediaFolder = {
      id: folderId,
      name: cleanName,
      images: [],
      createdAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'mediaFolders', folderId), {
        id: folderId,
        name: cleanName,
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setMediaFolders((prev) => [...prev.filter((f) => f.id !== folderId), created]);
      showToast('Folder Created', `"${cleanName}" saved to your cloud library.`, 'success');
      return created;
    } catch (error) {
      showToast('Folder Error', 'Could not create folder in cloud library.', 'warning');
      handleFirestoreError(error, OperationType.CREATE, `mediaFolders/${folderId}`);
    }
  };

  const deleteMediaFolder = async (folderId: string): Promise<boolean> => {
    const uid = auth.currentUser?.uid;
    const passkey = getAdminSessionPasskey();
    if ((!uid || !isCloudAdmin) && !isPasskeyAdmin) {
      showToast('Admin Unlock Required', 'Please unlock the Admin Portal to delete folders.', 'warning');
      return false;
    }
    const cleanFolderId = sanitizeFirestoreId(folderId, 'folder');
    const target = mediaFolders.find((f) => f.id === cleanFolderId);
    const prevFolders = mediaFolders;
    setMediaFolders((prev) => prev.filter((f) => f.id !== cleanFolderId));

    if (!uid || !isCloudAdmin) {
      try {
        const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}`, {
          method: 'DELETE',
          headers: { 'x-admin-passkey': passkey }
        });
        if (!res.ok) {
          setMediaFolders(prevFolders);
          showToast('Cloud Sync Required', 'Click "Connect Cloud Sync" to delete folders in cloud storage.', 'warning');
          return false;
        }
        showToast('Folder Deleted', `"${target?.name || 'Folder'}" deleted permanently.`, 'info');
        return true;
      } catch {
        setMediaFolders(prevFolders);
        return false;
      }
    }

    try {
      const imgsSnap = await getDocs(collection(db, 'mediaFolders', cleanFolderId, 'images'));
      if (!imgsSnap.empty) {
        const batch = writeBatch(db);
        imgsSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'mediaFolders', cleanFolderId));
      showToast('Folder Deleted', `"${target?.name || 'Folder'}" deleted permanently.`, 'info');
      return true;
    } catch (error) {
      setMediaFolders(prevFolders);
      handleFirestoreError(error, OperationType.DELETE, `mediaFolders/${cleanFolderId}`);
    }
  };

  const clearMediaFolder = async (folderId: string): Promise<boolean> => {
    const uid = auth.currentUser?.uid;
    const passkey = getAdminSessionPasskey();
    if ((!uid || !isCloudAdmin) && !isPasskeyAdmin) {
      showToast('Admin Unlock Required', 'Please unlock the Admin Portal to clear folders.', 'warning');
      return false;
    }
    const cleanFolderId = sanitizeFirestoreId(folderId, 'folder');
    const target = mediaFolders.find((f) => f.id === cleanFolderId);
    const prevFolders = mediaFolders;
    setMediaFolders((prev) => prev.map((f) => (f.id === cleanFolderId ? { ...f, images: [] } : f)));

    if (!uid || !isCloudAdmin) {
      try {
        const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}/images`, {
          method: 'DELETE',
          headers: { 'x-admin-passkey': passkey }
        });
        if (!res.ok) {
          setMediaFolders(prevFolders);
          showToast('Cloud Sync Required', 'Click "Connect Cloud Sync" to clear cloud folders.', 'warning');
          return false;
        }
        showToast('Folder Cleared', `All images removed from "${target?.name || 'folder'}".`, 'info');
        return true;
      } catch {
        setMediaFolders(prevFolders);
        return false;
      }
    }

    try {
      const imgsSnap = await getDocs(collection(db, 'mediaFolders', cleanFolderId, 'images'));
      if (!imgsSnap.empty) {
        const batch = writeBatch(db);
        imgsSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      showToast('Folder Cleared', `All images removed from "${target?.name || 'folder'}".`, 'info');
      return true;
    } catch (error) {
      setMediaFolders(prevFolders);
      handleFirestoreError(error, OperationType.DELETE, `mediaFolders/${cleanFolderId}/images`);
    }
  };

  const addImagesToFolder = async (folderId: string, files: File[]): Promise<MediaFolderImage[]> => {
    const uid = auth.currentUser?.uid;
    const passkey = getAdminSessionPasskey();
    if ((!uid || !isCloudAdmin) && !isPasskeyAdmin) {
      showToast('Admin Unlock Required', 'Please unlock the Admin Portal to upload folder photos.', 'warning');
      return [];
    }

    const cleanFolderId = sanitizeFirestoreId(folderId, 'folder');
    const imageFiles = files
      .filter((file) => {
        if (file.type && file.type.startsWith('image/')) return true;
        return /\.(png|jpe?g|webp|gif|jfif|bmp|avif)$/i.test(file.name);
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (imageFiles.length === 0) {
      showToast('No Images Found', 'Please select JPG, PNG, or WEBP image files.', 'warning');
      return [];
    }

    if (!uid || !isCloudAdmin) {
      const itemsPayload: Array<{ dataUrl: string; filename: string }> = [];
      for (const file of imageFiles) {
        try {
          const dataUrl = await optimizeImageToDataUrl(file);
          itemsPayload.push({ dataUrl, filename: file.name });
        } catch {
          // skip unreadable image
        }
      }
      if (itemsPayload.length === 0) {
        showToast('Upload Failed', 'Could not read selected image files.', 'warning');
        return [];
      }
      try {
        const res = await fetch(`/api/media/folders/${encodeURIComponent(folderId)}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-passkey': passkey },
          body: JSON.stringify({ items: itemsPayload })
        });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) {
          showToast(
            'Cloud Sync Required',
            'Click "Connect Cloud Sync" in the Admin sidebar to upload folder images.',
            'warning'
          );
          return [];
        }
        const data = (await res.json()) as { addedImages?: MediaFolderImage[]; mediaFolders?: MediaFolder[] };
        if (Array.isArray(data.mediaFolders)) {
          setMediaFolders(data.mediaFolders);
        }
        const added = data.addedImages || [];
        if (added.length > 0) {
          showToast(
            'Photos Added to Folder',
            `${added.length} ${added.length === 1 ? 'photo' : 'photos'} saved cleanly.`,
            'success',
            added[0].url
          );
        }
        return added;
      } catch {
        showToast('Upload Failed', 'Could not save selected images to folder.', 'warning');
        return [];
      }
    }

    // Ensure parent folder exists before creating subcollection image docs
    const folderRef = doc(db, 'mediaFolders', cleanFolderId);
    const folderSnap = await getDoc(folderRef);
    if (!folderSnap.exists()) {
      await setDoc(folderRef, {
        id: cleanFolderId,
        name: 'Product Photos',
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    const uploadedItems: MediaFolderImage[] = [];
    for (let i = 0; i < imageFiles.length; i += 1) {
      const file = imageFiles[i];
      try {
        const optimizedDataUrl = await optimizeImageToDataUrl(file);
        const imgId = sanitizeFirestoreId(`img-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`, 'img');
        const cleanLabel =
          clampString(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), 160) || `Photo ${i + 1}`;

        await setDoc(doc(db, 'mediaFolders', cleanFolderId, 'images', imgId), {
          id: imgId,
          folderId: cleanFolderId,
          name: cleanLabel,
          url: clampString(optimizedDataUrl, 300_000),
          ownerUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        uploadedItems.push({
          id: imgId,
          name: cleanLabel,
          url: optimizedDataUrl,
          createdAt: Date.now()
        });
      } catch (err) {
        console.warn('Skipped folder image upload:', file.name, err);
      }
    }

    if (uploadedItems.length > 0) {
      showToast(
        'Photos Added to Cloud Folder',
        `${uploadedItems.length} ${uploadedItems.length === 1 ? 'photo' : 'photos'} saved cleanly.`,
        'success',
        uploadedItems[0].url
      );
    } else {
      showToast('Upload Failed', 'Could not save selected images to folder.', 'warning');
    }

    return uploadedItems;
  };

  const uploadLocalDirectoryAsFolder = async (
    files: File[],
    fallbackFolderName?: string
  ): Promise<MediaFolder | null> => {
    const imageFiles = files.filter((file) => {
      if (file.type && file.type.startsWith('image/')) return true;
      return /\.(png|jpe?g|webp|gif|jfif|bmp|avif)$/i.test(file.name);
    });

    if (imageFiles.length === 0) {
      showToast('No Images Found', 'Please choose a folder containing JPG, PNG, or WEBP photos.', 'warning');
      return null;
    }

    const groups = new Map<string, File[]>();
    for (const file of imageFiles) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
      const parts = rel.split('/').filter(Boolean);
      const groupName =
        parts.length >= 3
          ? parts[parts.length - 2].trim()
          : parts.length === 2
            ? parts[0].trim()
            : fallbackFolderName || `Uploaded Folder ${new Date().toLocaleDateString('en-IN')}`;
      const list = groups.get(groupName) || [];
      list.push(file);
      groups.set(groupName, list);
    }

    let lastFolder: MediaFolder | null = null;
    const sortedNames = Array.from(groups.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    for (const name of sortedNames) {
      const folderFiles = groups.get(name) || [];
      if (folderFiles.length === 0) continue;
      const folder = await createMediaFolder(name);
      if (!folder) continue;
      await addImagesToFolder(folder.id, folderFiles);
      lastFolder = folder;
    }

    return lastFolder;
  };

  const deleteImageFromFolder = async (folderId: string, imageId: string): Promise<boolean> => {
    const uid = auth.currentUser?.uid;
    const passkey = getAdminSessionPasskey();
    if ((!uid || !isCloudAdmin) && !isPasskeyAdmin) {
      showToast('Admin Unlock Required', 'Please unlock the Admin Portal to delete folder images.', 'warning');
      return false;
    }
    const cleanFolderId = sanitizeFirestoreId(folderId, 'folder');
    const cleanImageId = sanitizeFirestoreId(imageId, 'img');
    const prevFolders = mediaFolders;
    setMediaFolders((prev) =>
      prev.map((f) =>
        f.id === cleanFolderId || f.id === folderId
          ? { ...f, images: f.images.filter((img) => img.id !== cleanImageId && img.id !== imageId) }
          : f
      )
    );

    if (!uid || !isCloudAdmin) {
      try {
        const res = await fetch(
          `/api/media/folders/${encodeURIComponent(folderId)}/images/${encodeURIComponent(imageId)}`,
          {
            method: 'DELETE',
            headers: { 'x-admin-passkey': passkey }
          }
        );
        if (!res.ok) {
          setMediaFolders(prevFolders);
          showToast('Cloud Sync Required', 'Click "Connect Cloud Sync" to delete folder images.', 'warning');
          return false;
        }
        showToast('Image Deleted', 'Photo removed from folder.', 'info');
        return true;
      } catch {
        setMediaFolders(prevFolders);
        return false;
      }
    }

    try {
      await deleteDoc(doc(db, 'mediaFolders', cleanFolderId, 'images', cleanImageId));
      showToast('Image Deleted', 'Photo removed from cloud folder.', 'info');
      return true;
    } catch (error) {
      setMediaFolders(prevFolders);
      handleFirestoreError(error, OperationType.DELETE, `mediaFolders/${cleanFolderId}/images/${cleanImageId}`);
    }
  };

  // Order & Customer Management (Admin -> Cloud Firestore + Server API)
  const updateOrderStatus = (orderId: string, status: Order['status'], trackingNumber?: string, note?: string) => {
    const cleanOrderId = sanitizeFirestoreId(orderId, 'ord');
    const existingOrder = orders.find((o) => o.id === orderId);
    const resolvedTracking = clampString(
      trackingNumber !== undefined ? trackingNumber : existingOrder?.trackingNumber || '',
      100
    );
    const passkey = getAdminSessionPasskey();

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status,
              trackingNumber: trackingNumber !== undefined ? trackingNumber : o.trackingNumber
            }
          : o
      )
    );

    if (note !== undefined) {
      setAdminNotes((prev) => ({ ...prev, [orderId]: note }));
      const uid = auth.currentUser?.uid;
      if (uid && isCloudAdmin) {
        const noteRef = doc(db, 'adminNotes', cleanOrderId);
        void getDoc(noteRef).then((snap) => {
          const cleanNote = clampString(note, 1000);
          if (snap.exists()) {
            return updateDoc(noteRef, { note: cleanNote, updatedBy: uid, updatedAt: serverTimestamp() });
          }
          return setDoc(noteRef, {
            orderId: cleanOrderId,
            note: cleanNote,
            updatedBy: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }).catch((err) => {
          handleFirestoreError(err, OperationType.WRITE, `adminNotes/${cleanOrderId}`);
        });
      }
    }

    if (isCloudAdmin) {
      const paymentVerified = status !== 'Processing';
      void updateDoc(doc(db, 'orders', cleanOrderId), {
        status,
        trackingNumber: resolvedTracking,
        updatedAt: serverTimestamp()
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `orders/${cleanOrderId}`);
      });

      const statusRef = doc(db, 'orderStatus', cleanOrderId);
      void getDoc(statusRef)
        .then((snap) => {
          if (snap.exists()) {
            return updateDoc(statusRef, {
              status,
              paymentVerified,
              trackingNumber: resolvedTracking,
              updatedAt: serverTimestamp()
            });
          }
          return setDoc(statusRef, {
            orderId: cleanOrderId,
            receiptNumber: formatReceiptNumber(cleanOrderId),
            status,
            paymentVerified,
            trackingNumber: resolvedTracking,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        })
        .catch((err) => {
          handleFirestoreError(err, OperationType.WRITE, `orderStatus/${cleanOrderId}`);
        });

      const alertRef = doc(db, 'adminAlerts', cleanOrderId);
      void getDoc(alertRef)
        .then((snap) => {
          if (snap.exists()) {
            return updateDoc(alertRef, {
              alertStatus: paymentVerified ? 'verified' : 'acknowledged',
              customerNotified: paymentVerified,
              updatedAt: serverTimestamp()
            });
          }
          return null;
        })
        .catch(() => {
          // ignore if alert doc not yet present
        });

      if (paymentVerified && existingOrder) {
        const updatedOrderObj: Order = {
          ...existingOrder,
          receiptNumber: existingOrder.receiptNumber || formatReceiptNumber(cleanOrderId),
          status,
          trackingNumber: resolvedTracking
        };
        void fetch('/api/notifications/order-confirmed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedOrderObj)
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { smtpConfigured?: boolean; smtpAuthError?: string | null } | null) => {
            if (data && typeof data.smtpConfigured === 'boolean') {
              setSmtpEmailConfigured(data.smtpConfigured);
            }
            if (data && 'smtpAuthError' in data) {
              setSmtpAuthError(data.smtpAuthError || null);
            }
          })
          .catch(() => {
            // Live /orderStatus snapshot still pushes confirmation straight to customer UI
          });
      }
      if (passkey) {
        void fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-admin-passkey': passkey },
          body: JSON.stringify({ status, trackingNumber: resolvedTracking, note })
        }).catch(() => {});
      }
    } else if (isPasskeyAdmin && passkey) {
      void fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-passkey': passkey },
        body: JSON.stringify({ status, trackingNumber: resolvedTracking, note })
      }).catch(() => {});

      if (status !== 'Processing' && existingOrder) {
        const updatedOrderObj: Order = {
          ...existingOrder,
          receiptNumber: existingOrder.receiptNumber || formatReceiptNumber(cleanOrderId),
          status,
          trackingNumber: resolvedTracking
        };
        void fetch('/api/notifications/order-confirmed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedOrderObj)
        }).catch(() => {});
      }
    }

    showToast(
      status === 'Confirmed' ? 'Payment Verified & Customer Notified' : 'Order Updated',
      status === 'Confirmed'
        ? `Order ${orderId} confirmed. Customer live tracking & receipt updated.`
        : `Order ${orderId} updated to "${status}".`,
      'success'
    );
  };

  const acknowledgeAdminAlert = (orderId: string) => {
    const cleanOrderId = sanitizeFirestoreId(orderId, 'ord');
    setAdminAlerts((prev) =>
      prev.map((a) => (a.orderId === cleanOrderId && a.alertStatus === 'unread' ? { ...a, alertStatus: 'acknowledged' } : a))
    );
    if (isCloudAdmin) {
      void updateDoc(doc(db, 'adminAlerts', cleanOrderId), {
        alertStatus: 'acknowledged',
        updatedAt: serverTimestamp()
      }).catch(() => {
        // ignore
      });
    }
  };

  const markCustomerNotified = (orderId: string) => {
    const cleanOrderId = sanitizeFirestoreId(orderId, 'ord');
    setAdminAlerts((prev) =>
      prev.map((a) => (a.orderId === cleanOrderId ? { ...a, customerNotified: true } : a))
    );
    if (isCloudAdmin) {
      void updateDoc(doc(db, 'adminAlerts', cleanOrderId), {
        customerNotified: true,
        updatedAt: serverTimestamp()
      }).catch(() => {
        // ignore
      });
    }
  };

  const deleteOrder = (orderId: string) => {
    const cleanOrderId = sanitizeFirestoreId(orderId, 'ord');
    const passkey = getAdminSessionPasskey();
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setAdminAlerts((prev) => prev.filter((a) => a.orderId !== cleanOrderId));
    if (isCloudAdmin) {
      void deleteDoc(doc(db, 'orders', cleanOrderId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, `orders/${cleanOrderId}`);
      });
      void deleteDoc(doc(db, 'orderStatus', cleanOrderId)).catch(() => {
        // ignore if status doc absent
      });
      void deleteDoc(doc(db, 'adminAlerts', cleanOrderId)).catch(() => {
        // ignore if alert doc absent
      });
    }
    if (passkey) {
      void fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
        headers: { 'x-admin-passkey': passkey }
      }).catch(() => {});
    }
    showToast('Order Removed', `Order ${orderId} deleted from records.`, 'info');
  };

  const setAdminNotesForOrder = (orderId: string, note: string) => {
    const cleanOrderId = sanitizeFirestoreId(orderId, 'ord');
    const passkey = getAdminSessionPasskey();
    setAdminNotes((prev) => ({ ...prev, [orderId]: note }));
    const uid = auth.currentUser?.uid;
    if (uid && isCloudAdmin) {
      const noteRef = doc(db, 'adminNotes', cleanOrderId);
      void getDoc(noteRef).then((snap) => {
        const cleanNote = clampString(note, 1000);
        if (snap.exists()) {
          return updateDoc(noteRef, { note: cleanNote, updatedBy: uid, updatedAt: serverTimestamp() });
        }
        return setDoc(noteRef, {
          orderId: cleanOrderId,
          note: cleanNote,
          updatedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `adminNotes/${cleanOrderId}`);
      });
    }
    if (passkey) {
      void fetch(`/api/admin-notes/${encodeURIComponent(orderId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-passkey': passkey },
        body: JSON.stringify({ note })
      }).catch(() => {});
    }
  };

  const unreadAlertsCount = useMemo(
    () => adminAlerts.filter((a) => a.alertStatus === 'unread').length,
    [adminAlerts]
  );

  return (
    <ShopContext.Provider
      value={{
        products,
        cart,
        wishlist,
        orders,
        activeModal,
        selectedProduct,
        searchQuery,
        selectedCategory,
        sortBy,
        toasts,
        appliedCoupon,
        serverSynced,
        lastSyncedAt,
        authReady,
        firebaseUser,
        isCloudAdmin,
        isPasskeyAdmin,
        passkeyAuthChecking,
        adminAuthError,
        unauthorizedDomain,
        emailPasswordProviderDisabled,
        pendingVerificationEmail,
        canAttemptFirstTimeSetup,
        unlockWithSetupKey,
        signInWithEmailAdmin,
        registerFirstAdminAccount,
        sendAdminPasswordReset,
        updateAdminPassword,
        updateAdminEmailAddress,
        resendAdminVerificationEmail,
        refreshAdminVerificationStatus,
        signInWithGoogleAdmin,
        signOutAdmin,
        clearAdminAuthError,
        setActiveModal,
        setSelectedProduct,
        setSearchQuery,
        setSelectedCategory,
        setSortBy,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        applyCoupon,
        removeCoupon,
        toggleWishlist,
        isInWishlist,
        placeOrder,
        trackOrderById,
        showToast,
        dismissToast,
        openProductDetail,
        openQuickCheckout,
        trackingLookupId,
        setTrackingLookupId,
        openOrderTracking,
        updateProduct,
        addProduct,
        deleteProduct,
        mediaFolders,
        createMediaFolder,
        deleteMediaFolder,
        clearMediaFolder,
        addImagesToFolder,
        uploadLocalDirectoryAsFolder,
        deleteImageFromFolder,
        updateOrderStatus,
        deleteOrder,
        adminNotes,
        setAdminNotesForOrder,
        adminAlerts,
        unreadAlertsCount,
        smtpEmailConfigured,
        smtpAuthError,
        acknowledgeAdminAlert,
        markCustomerNotified,
        getEffectivePrice,
        cartCount,
        cartSubtotal,
        cartDiscount,
        cartShipping,
        cartTotal,
        freeShippingThreshold,
        freeShippingRemaining
      }}
    >
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
};
