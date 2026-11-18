import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  LayoutDashboard,
  Package,
  FolderOpen,
  ShoppingBag,
  Users,
  Search,
  Plus,
  Trash2,
  Upload,
  FolderUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  LogOut,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  ImagePlus,
  Eye,
  EyeOff,
  Mail,
  Lock,
  BellRing,
  FileText,
  Download,
  Printer,
  CheckCircle2
} from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Product, Order } from '../types';
import { CATEGORIES } from '../data/categories';
import { ADMIN_EMAIL, ADMIN_EMAILS, FIREBASE_PROJECT_ID } from '../firebase';
import { BANAYA_CONTACT_EMAIL } from '../config/storeContact';
import { getPriceForProductWeight } from '../utils/pricing';
import {
  downloadOrderReceipt,
  formatReceiptNumber,
  buildAdminReceiptMailtoUrl,
  buildCustomerConfirmationMailtoUrl
} from '../utils/receipt';
import {
  uploadProductImage,
  calculateGalleryByteSize,
  MAX_PRODUCT_GALLERY_BYTES
} from '../utils/imageUpload';
import { handleProductImageError, handleProductImageLoad } from '../utils/imageFallback';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AdminTab = 'overview' | 'products' | 'folders' | 'orders' | 'customers';

const ORDER_STATUSES: Order['status'][] = [
  'Processing',
  'Confirmed',
  'Shipped',
  'Out for Delivery',
  'Delivered'
];

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const {
    authReady,
    firebaseUser,
    isCloudAdmin,
    adminAuthError,
    unauthorizedDomain,
    emailPasswordProviderDisabled,
    pendingVerificationEmail,
    canAttemptFirstTimeSetup,
    signInWithEmailAdmin,
    registerFirstAdminAccount,
    resendAdminVerificationEmail,
    refreshAdminVerificationStatus,
    signInWithGoogleAdmin,
    signOutAdmin,
    clearAdminAuthError,
    serverSynced,
    lastSyncedAt,
    products,
    orders,
    adminNotes,
    mediaFolders,
    updateProduct,
    addProduct,
    deleteProduct,
    createMediaFolder,
    deleteMediaFolder,
    clearMediaFolder,
    addImagesToFolder,
    uploadLocalDirectoryAsFolder,
    deleteImageFromFolder,
    updateOrderStatus,
    deleteOrder,
    adminAlerts,
    unreadAlertsCount,
    smtpEmailConfigured,
    smtpAuthError,
    acknowledgeAdminAlert,
    markCustomerNotified,
    showToast
  } = useShop();

  const [activeTab, setActiveTab] = useState<AdminTab>('products');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [domainCopied, setDomainCopied] = useState(false);

  // Products Tab State
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [inlinePrices, setInlinePrices] = useState<Record<string, string>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<string | null>(null);
  const [lastSavedBanner, setLastSavedBanner] = useState<{ name: string; image: string } | null>(null);

  // Product Editor Sub-Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [previewGalleryIdx, setPreviewGalleryIdx] = useState(0);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [pickerFolderId, setPickerFolderId] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Image Folders Tab State
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploadingFolder, setIsUploadingFolder] = useState(false);
  const [targetProductId, setTargetProductId] = useState<string>('');
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete-folder' | 'clear-folder' | 'delete-image';
    folderId: string;
    imageId?: string;
  } | null>(null);

  // Orders Tab State
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderDraftStatus, setOrderDraftStatus] = useState<Order['status']>('Processing');
  const [orderDraftTracking, setOrderDraftTracking] = useState('');
  const [orderDraftNote, setOrderDraftNote] = useState('');
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  // Customers Tab State
  const [customerSearch, setCustomerSearch] = useState('');

  // File Input Refs
  const primaryUploadRef = useRef<HTMLInputElement | null>(null);
  const multiGalleryUploadRef = useRef<HTMLInputElement | null>(null);
  const folderFilesUploadRef = useRef<HTMLInputElement | null>(null);
  const folderDirUploadRef = useRef<HTMLInputElement | null>(null);

  // Keep selected folder and target product synchronized
  useEffect(() => {
    if (mediaFolders.length > 0 && !mediaFolders.some((f) => f.id === selectedFolderId)) {
      setSelectedFolderId(mediaFolders[0].id);
    }
    if (mediaFolders.length > 0 && !mediaFolders.some((f) => f.id === pickerFolderId)) {
      setPickerFolderId(mediaFolders[0].id);
    }
  }, [mediaFolders, selectedFolderId, pickerFolderId]);

  useEffect(() => {
    if (products.length > 0 && !products.some((p) => p.id === targetProductId)) {
      setTargetProductId(products[0].id);
    }
  }, [products, targetProductId]);

  // Derived Analytics & Filtered Lists
  const totalRevenue = useMemo(
    () => orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0),
    [orders]
  );

  const pendingOrdersCount = useMemo(
    () => orders.filter((o) => o.status === 'Processing' || o.status === 'Confirmed').length,
    [orders]
  );

  const outOfStockCount = useMemo(
    () => products.filter((p) => !p.inStock).length,
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCat = categoryFilter === 'all' || p.categorySlug === categoryFilter;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.tamilName || '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [products, productSearch, categoryFilter]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.phone.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        (o.trackingNumber || '').toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, orderStatusFilter]);

  const customers = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        phone: string;
        email: string;
        city: string;
        ordersCount: number;
        totalSpend: number;
        lastOrderDate: string;
      }
    >();

    for (const ord of orders) {
      const key = (ord.phone || ord.email || ord.customerName).trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.ordersCount += 1;
        existing.totalSpend += Number(ord.totalAmount) || 0;
        if (ord.date > existing.lastOrderDate) existing.lastOrderDate = ord.date;
      } else {
        map.set(key, {
          key,
          name: ord.customerName,
          phone: ord.phone,
          email: ord.email || '',
          city: ord.city,
          ordersCount: 1,
          totalSpend: Number(ord.totalAmount) || 0,
          lastOrderDate: ord.date
        });
      }
    }

    const q = customerSearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [orders, customerSearch]);

  const selectedFolder = useMemo(
    () => mediaFolders.find((f) => f.id === selectedFolderId) || mediaFolders[0] || null,
    [mediaFolders, selectedFolderId]
  );

  const pickerFolder = useMemo(
    () => mediaFolders.find((f) => f.id === pickerFolderId) || mediaFolders[0] || null,
    [mediaFolders, pickerFolderId]
  );

  const editingGallery = useMemo(() => {
    if (!editingProduct) return [];
    const primary = editingProduct.image?.trim() || '';
    const rest = (editingProduct.gallery || []).filter((g) => g && g.trim() && g !== primary);
    return primary ? [primary, ...rest] : rest;
  }, [editingProduct]);

  const galleryBytes = useMemo(
    () => calculateGalleryByteSize(editingGallery),
    [editingGallery]
  );

  if (!isOpen) return null;

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    try {
      await signInWithEmailAdmin(loginEmail, loginPassword);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleFirstTimeRegister = async () => {
    setIsSigningIn(true);
    try {
      await registerFirstAdminAccount(loginEmail, loginPassword);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleRefreshVerification = async () => {
    setIsCheckingVerification(true);
    try {
      await refreshAdminVerificationStatus();
    } finally {
      setIsCheckingVerification(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signInWithGoogleAdmin();
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleCopyDomain = async () => {
    if (!unauthorizedDomain) return;
    try {
      await navigator.clipboard.writeText(unauthorizedDomain);
      setDomainCopied(true);
      setTimeout(() => setDomainCopied(false), 2500);
    } catch {
      showToast('Copy Domain', `Copy this hostname manually: ${unauthorizedDomain}`, 'info');
    }
  };

  const handleViewLiveStore = () => {
    onClose();
    setTimeout(() => {
      document.getElementById('shop-products')?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  };

  const openEditProductModal = (prod: Product) => {
    const normalizedGallery = Array.from(
      new Set([prod.image, ...(prod.gallery || [])].filter(Boolean))
    );
    setEditingProduct({
      ...prod,
      gallery: normalizedGallery.length > 0 ? normalizedGallery : [prod.image]
    });
    setIsAddingProduct(false);
    setPreviewGalleryIdx(0);
    setShowFolderPicker(false);
  };

  const openAddProductModal = () => {
    const defaultCat = CATEGORIES[0];
    const newProd: Product = {
      id: `banaya-${Date.now().toString(36)}`,
      name: '',
      tamilName: '',
      tagline: '100% Pure & Natural Traditional Harvest',
      category: defaultCat.name,
      categorySlug: defaultCat.slug,
      price: 299,
      originalPrice: 399,
      rating: 4.9,
      reviewsCount: 15,
      inStock: true,
      weightOptions: ['250g', '500g', '1kg'],
      defaultWeight: '500g',
      badges: ['100% Pure', 'Traditional'],
      image: '/images/pure-honey-1.png',
      gallery: ['/images/pure-honey-1.png'],
      description: 'Harvested and packed in small batches to preserve natural aroma and potency.',
      ingredients: ['100% Natural Ingredients'],
      keyBenefits: ['Rich in natural antioxidants', 'Zero preservatives or added sugar'],
      howToUse: 'Use daily as part of a balanced traditional wellness routine.',
      storageInfo: 'Store in a cool, dry place away from direct sunlight.',
      origin: 'Tamil Nadu, India',
      isBestSeller: false,
      isNew: true
    };
    setEditingProduct(newProd);
    setIsAddingProduct(true);
    setPreviewGalleryIdx(0);
    setShowFolderPicker(false);
  };

  const handlePrimaryPhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !editingProduct) return;
    setIsUploadingImage(true);
    try {
      const optimizedUrl = await uploadProductImage(files[0]);
      setEditingProduct((prev) => {
        if (!prev) return prev;
        const others = (prev.gallery || []).filter((g) => g && g !== prev.image && g !== optimizedUrl);
        return {
          ...prev,
          image: optimizedUrl,
          gallery: [optimizedUrl, ...others]
        };
      });
      setPreviewGalleryIdx(0);
      showToast('Main Photo Ready', 'Click "Update Live Website" below to publish this photo live.', 'info', optimizedUrl);
    } catch (err) {
      showToast('Upload Error', (err as Error)?.message || 'Failed to read selected photo.', 'warning');
    } finally {
      setIsUploadingImage(false);
      if (primaryUploadRef.current) primaryUploadRef.current.value = '';
    }
  };

  const handleMultipleGalleryUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !editingProduct) return;
    setIsUploadingImage(true);
    try {
      const fileArray = Array.from(files);
      const uploadedUrls: string[] = [];
      for (const file of fileArray) {
        try {
          const url = await uploadProductImage(file);
          uploadedUrls.push(url);
        } catch {
          // skip unreadable individual image
        }
      }
      if (uploadedUrls.length > 0) {
        setEditingProduct((prev) => {
          if (!prev) return prev;
          const existing = Array.from(new Set([prev.image, ...(prev.gallery || [])].filter(Boolean)));
          const merged = Array.from(new Set([...existing, ...uploadedUrls])).slice(0, 8);
          return {
            ...prev,
            image: merged[0] || uploadedUrls[0],
            gallery: merged
          };
        });
        showToast(
          `${uploadedUrls.length} ${uploadedUrls.length === 1 ? 'Photo' : 'Photos'} Added`,
          'Click "Update Live Website" to publish these photos to customers.',
          'info',
          uploadedUrls[0]
        );
      }
    } finally {
      setIsUploadingImage(false);
      if (multiGalleryUploadRef.current) multiGalleryUploadRef.current.value = '';
    }
  };

  const handleSetMainGalleryPhoto = (url: string) => {
    if (!editingProduct) return;
    const reordered = [url, ...editingGallery.filter((g) => g !== url)];
    setEditingProduct({
      ...editingProduct,
      image: url,
      gallery: reordered
    });
    setPreviewGalleryIdx(0);
  };

  const handleMoveGalleryPhoto = (index: number, direction: -1 | 1) => {
    if (!editingProduct) return;
    const target = index + direction;
    if (target < 0 || target >= editingGallery.length) return;
    const copy = [...editingGallery];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setEditingProduct({
      ...editingProduct,
      image: copy[0] || editingProduct.image,
      gallery: copy
    });
    setPreviewGalleryIdx(target);
  };

  const handleRemoveGalleryPhoto = (url: string) => {
    if (!editingProduct) return;
    if (editingGallery.length <= 1) {
      showToast('Photo Required', 'Every product requires at least 1 main photo.', 'warning');
      return;
    }
    const next = editingGallery.filter((g) => g !== url);
    setEditingProduct({
      ...editingProduct,
      image: next[0],
      gallery: next
    });
    setPreviewGalleryIdx(0);
  };

  const handlePickFolderPhoto = (url: string, asMain: boolean) => {
    if (!editingProduct) return;
    if (asMain) {
      const merged = [url, ...editingGallery.filter((g) => g !== url)].slice(0, 8);
      setEditingProduct({
        ...editingProduct,
        image: url,
        gallery: merged
      });
      setPreviewGalleryIdx(0);
    } else {
      const merged = Array.from(new Set([...editingGallery, url])).slice(0, 8);
      setEditingProduct({
        ...editingProduct,
        gallery: merged
      });
      setPreviewGalleryIdx(Math.max(0, merged.indexOf(url)));
    }
  };

  const handleSaveProductModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editingProduct.name.trim()) {
      showToast('Name Required', 'Please enter a product name before publishing.', 'warning');
      return;
    }
    if (galleryBytes > MAX_PRODUCT_GALLERY_BYTES) {
      showToast(
        'Gallery Too Large',
        'Please remove 1 or 2 photos so the gallery stays fast for mobile shoppers.',
        'warning'
      );
      return;
    }

    const cleanGallery = editingGallery.length > 0 ? editingGallery : [editingProduct.image];
    const cleanWeights = editingProduct.weightOptions.filter(Boolean);
    const payload: Product = {
      ...editingProduct,
      image: cleanGallery[0],
      gallery: cleanGallery,
      weightOptions: cleanWeights.length > 0 ? cleanWeights : ['500g'],
      defaultWeight: editingProduct.defaultWeight || cleanWeights[0] || '500g',
      price: Math.max(1, Number(editingProduct.price) || 1),
      originalPrice: Math.max(1, Number(editingProduct.originalPrice) || Number(editingProduct.price) || 1)
    };

    setIsSavingProduct(true);
    try {
      const ok = isAddingProduct ? await addProduct(payload) : await updateProduct(payload);
      if (ok) {
        setLastSavedBanner({ name: payload.name, image: payload.image });
        setEditingProduct(null);
        setIsAddingProduct(false);
      }
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleInlinePriceUpdate = async (prod: Product) => {
    const raw = inlinePrices[prod.id];
    const parsed = Number(raw);
    if (!raw || Number.isNaN(parsed) || parsed <= 0 || parsed === prod.price) return;
    setSavingRowId(prod.id);
    try {
      const ok = await updateProduct({ ...prod, price: Math.round(parsed) });
      if (ok) {
        setLastSavedBanner({ name: prod.name, image: prod.image });
        setInlinePrices((prev) => {
          const copy = { ...prev };
          delete copy[prod.id];
          return copy;
        });
      }
    } finally {
      setSavingRowId(null);
    }
  };

  const handleToggleStock = async (prod: Product) => {
    setSavingRowId(prod.id);
    try {
      await updateProduct({ ...prod, inStock: !prod.inStock });
    } finally {
      setSavingRowId(null);
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = await createMediaFolder(newFolderName.trim());
    if (created) {
      setSelectedFolderId(created.id);
      setNewFolderName('');
    }
  };

  const handleApplyFolderPhotoToProduct = async (url: string, mode: 'main' | 'gallery') => {
    const target = products.find((p) => p.id === targetProductId);
    if (!target) return;
    const nextGallery =
      mode === 'main'
        ? [url, ...target.gallery.filter((g) => g !== url)].slice(0, 8)
        : Array.from(new Set([...target.gallery, url])).slice(0, 8);
    const updated: Product = {
      ...target,
      image: mode === 'main' ? url : target.image,
      gallery: nextGallery
    };
    const ok = await updateProduct(updated);
    if (ok) {
      setLastSavedBanner({ name: target.name, image: updated.image });
    }
  };

  const openOrderEditor = (ord: Order) => {
    setEditingOrder(ord);
    setOrderDraftStatus(ord.status);
    setOrderDraftTracking(ord.trackingNumber || '');
    setOrderDraftNote(adminNotes?.[ord.id] || '');
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    updateOrderStatus(editingOrder.id, orderDraftStatus, orderDraftTracking, orderDraftNote);
    setEditingOrder(null);
  };

  // ==================== LOGIN SCREEN ====================
  if (!isCloudAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden my-auto">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close admin portal"
            className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <img
                src="/images/banaya_logo.png"
                alt="Banaya Enterprises"
                className="w-11 h-11 rounded-lg object-contain border border-slate-200 bg-slate-50 p-1"
              />
              <div>
                <h2 className="text-lg font-semibold text-slate-900 leading-tight">
                  Banaya Admin Portal
                </h2>
                <p className="text-xs text-slate-500">
                  Authorized administrator sign-in required
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5 space-y-4">
              {firebaseUser && !isCloudAdmin && !pendingVerificationEmail && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1.5">
                  <p className="font-medium">
                    Signed in as {firebaseUser.email || 'unauthorized account'}
                  </p>
                  <p className="text-amber-800">
                    Authorized store admins:{' '}
                    <span className="font-mono font-medium">{ADMIN_EMAILS.join(', ')}</span>
                  </p>
                </div>
              )}

              {pendingVerificationEmail && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3 text-xs text-amber-950">
                  <p className="font-semibold">Verify {pendingVerificationEmail}</p>
                  <p className="text-amber-900 leading-relaxed">
                    Open your <span className="font-mono">{pendingVerificationEmail}</span> inbox and click the Firebase verification link, then click Continue below.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isCheckingVerification}
                      onClick={() => void handleRefreshVerification()}
                      className="h-8 px-3 rounded-md bg-[#1B3624] hover:bg-[#14291b] text-white font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isCheckingVerification ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>I&apos;ve Verified &mdash; Continue</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void resendAdminVerificationEmail()}
                      className="h-8 px-3 rounded-md border border-amber-300 bg-white hover:bg-amber-100/60 text-amber-900 font-medium cursor-pointer"
                    >
                      Resend Link
                    </button>
                  </div>
                </div>
              )}

              {adminAuthError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <p>{adminAuthError}</p>
                    <button
                      type="button"
                      onClick={clearAdminAuthError}
                      className="text-red-700 underline hover:no-underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {emailPasswordProviderDisabled && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">
                    1-Time Firebase Setup: Enable Email/Password Sign-In
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-600 leading-relaxed">
                    <li>Open Firebase Console Authentication Sign-in methods.</li>
                    <li>Select <span className="font-medium text-slate-900">Email/Password</span>, toggle <span className="font-medium text-slate-900">Enable</span>, and click <span className="font-medium text-slate-900">Save</span>.</li>
                    <li>Return here and sign in with <span className="font-mono text-slate-900">{loginEmail || ADMIN_EMAIL}</span>.</li>
                  </ol>
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#1B3624] font-medium hover:underline pt-1"
                  >
                    Enable Email/Password in Firebase Console
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {canAttemptFirstTimeSetup && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 text-xs text-slate-700">
                  <p className="font-medium text-slate-900">
                    First time setting up {loginEmail || ADMIN_EMAIL}?
                  </p>
                  <p className="text-slate-600">
                    If you haven&apos;t registered this admin login in Firebase Authentication yet, initialize it once with your entered credentials:
                  </p>
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={() => void handleFirstTimeRegister()}
                    className="h-8 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-medium cursor-pointer"
                  >
                    Create {loginEmail || ADMIN_EMAIL} Login
                  </button>
                </div>
              )}

              {unauthorizedDomain && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">
                    1-Time Domain Allowlist Step Needed
                  </p>
                  <p className="leading-relaxed">
                    Add your live hostname to Firebase Console under{' '}
                    <span className="font-medium">Authentication &rarr; Settings &rarr; Authorized domains</span>:
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                    <code className="flex-1 font-mono text-[11px] text-slate-900 truncate">
                      {unauthorizedDomain}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyDomain}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium transition-colors"
                    >
                      {domainCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {domainCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#1B3624] font-medium hover:underline"
                  >
                    Open Firebase Authentication Settings
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <form onSubmit={handleEmailSignIn} className="space-y-3.5">
                <div>
                  <label htmlFor="admin-email-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Admin Mail ID
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-email-input"
                      type="email"
                      required
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder={ADMIN_EMAIL}
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1B3624]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="admin-password-input" className="block text-xs font-medium text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-password-input"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter admin password"
                      className="w-full h-10 pl-9 pr-10 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#1B3624]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!authReady || isSigningIn}
                  className="w-full h-10 rounded-lg bg-[#1B3624] hover:bg-[#14291b] disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {!authReady || isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{!authReady ? 'Checking session...' : 'Signing in...'}</span>
                    </>
                  ) : (
                    <span>Sign In to Admin Portal</span>
                  )}
                </button>
              </form>

              <div className="relative flex items-center py-1">
                <div className="flex-1 border-t border-slate-200" />
                <span className="px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  or
                </span>
                <div className="flex-1 border-t border-slate-200" />
              </div>

              <button
                type="button"
                disabled={!authReady || isSigningIn}
                onClick={handleGoogleSignIn}
                className="w-full h-10 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Sign in with Google (Authorized Admin)</span>
              </button>

              {firebaseUser && (
                <button
                  type="button"
                  onClick={() => void signOutAdmin()}
                  className="w-full h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors"
                >
                  Sign Out ({firebaseUser.email})
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== MAIN ADMIN WORKSPACE ====================
  const navItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    count?: number;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'products', label: 'Products & Photos', icon: <Package className="w-4 h-4" />, count: products.length },
    { id: 'folders', label: 'Image Folders', icon: <FolderOpen className="w-4 h-4" />, count: mediaFolders.length },
    {
      id: 'orders',
      label: 'Orders',
      icon: <ShoppingBag className="w-4 h-4" />,
      count: orders.length,
      badge: unreadAlertsCount
    },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" />, count: customers.length }
  ];

  const activeNavLabel = navItems.find((item) => item.id === activeTab)?.label || 'Overview';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-[1440px] h-full sm:h-[92vh] bg-white sm:rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col lg:flex-row">
        {/* LEFT SIDEBAR */}
        <aside className="lg:w-60 shrink-0 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col">
          <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/images/banaya_logo.png"
                alt="Banaya"
                className="w-7 h-7 rounded-md object-contain bg-white border border-slate-200 p-0.5 shrink-0"
              />
              <span className="text-sm font-semibold text-slate-900 truncate">
                Banaya Admin
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin"
              className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-200/70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="p-2 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:flex-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#1B3624] text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold tabular-nums">
                        {item.badge} new
                      </span>
                    )}
                    {item.count !== undefined && (
                      <span
                        className={`text-xs font-mono tabular-nums ${
                          isActive ? 'text-emerald-200' : 'text-slate-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Cloud Status & Account */}
          <div className="hidden lg:block p-3.5 border-t border-slate-200 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                <span
                  className={`w-2 h-2 rounded-full ${
                    serverSynced ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                {serverSynced ? 'Cloud Live Sync' : 'Connecting...'}
              </span>
              {lastSyncedAt && (
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {new Date(lastSyncedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
              <span className="text-xs text-slate-600 truncate" title={firebaseUser?.email || ''}>
                {firebaseUser?.email || ADMIN_EMAIL}
              </span>
              <button
                type="button"
                onClick={() => void signOutAdmin()}
                title="Sign Out"
                className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {/* Top Header */}
          <header className="h-14 shrink-0 border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 bg-white">
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="text-slate-400 hidden sm:inline">Admin</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{activeNavLabel}</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleViewLiveStore}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span>View Live Website</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void signOutAdmin()}
                className="lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hidden lg:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Scrollable Workspace Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Live Sync Confirmation Banner */}
            {lastSavedBanner && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={lastSavedBanner.image}
                    alt={lastSavedBanner.name}
                    className="w-9 h-9 rounded-md object-contain bg-white border border-emerald-200 p-0.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-emerald-950 truncate">
                      {lastSavedBanner.name} updated on live website
                    </p>
                    <p className="text-xs text-emerald-700">
                      Synced automatically across all browsers and customer devices.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleViewLiveStore}
                    className="px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    View Live Website
                  </button>
                  <button
                    type="button"
                    onClick={() => setLastSavedBanner(null)}
                    className="p-1 text-emerald-700 hover:text-emerald-900"
                    aria-label="Dismiss banner"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
                    <p className="text-xs font-medium text-slate-500">Total Sales</p>
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                      &#8377;{totalRevenue.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
                    <p className="text-xs font-medium text-slate-500">Total Orders</p>
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {orders.length}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
                    <p className="text-xs font-medium text-slate-500">Pending Fulfillment</p>
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {pendingOrdersCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
                    <p className="text-xs font-medium text-slate-500">Catalog Products</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                        {products.length}
                      </p>
                      <span className="text-xs text-slate-500 tabular-nums">
                        ({outOfStockCount} out of stock)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Live Order & Payment Receipt Alerts Feed */}
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <BellRing className={`w-4 h-4 ${unreadAlertsCount > 0 ? 'text-amber-600' : 'text-emerald-700'}`} />
                      <h2 className="text-sm font-semibold text-slate-900">
                        Live Order &amp; Payment Receipt Alerts
                      </h2>
                      {unreadAlertsCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold tabular-nums">
                          {unreadAlertsCount} unread
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {smtpEmailConfigured
                        ? `Auto-SMTP Email Active (${BANAYA_CONTACT_EMAIL})`
                        : smtpAuthError
                          ? `Gmail App Password Needed · Portal Alerts Active (${BANAYA_CONTACT_EMAIL})`
                          : `Portal Real-Time Alerts Active · Target: ${BANAYA_CONTACT_EMAIL}`}
                    </span>
                  </div>

                  {smtpAuthError && (
                    <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          <span className="font-semibold">Auto-Email paused:</span> {smtpAuthError} Real-time portal alerts, live customer tracking, and 1-click Email/WhatsApp receipt dispatch remain active.
                        </p>
                      </div>
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-amber-300 text-amber-900 font-medium hover:bg-amber-100/70 shrink-0"
                      >
                        <span>Get App Password</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {adminAlerts.length > 0 ? (
                    <div className="divide-y divide-slate-200">
                      {adminAlerts.slice(0, 5).map((alert) => {
                        const matchedOrder = orders.find((o) => o.id === alert.orderId);
                        return (
                          <div
                            key={alert.orderId}
                            className={`p-4 flex flex-wrap items-center justify-between gap-3 ${
                              alert.alertStatus === 'unread' ? 'bg-amber-50/40' : 'bg-white'
                            }`}
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono font-semibold text-slate-900">
                                  {alert.receiptNumber}
                                </span>
                                <span className="text-slate-400">&middot;</span>
                                <span className="font-medium text-slate-800">
                                  {alert.customerName}
                                </span>
                                <span className="font-semibold text-[#1B3624] tabular-nums">
                                  &#8377;{alert.totalAmount.toLocaleString('en-IN')}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                    alert.alertStatus === 'verified'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : alert.alertStatus === 'acknowledged'
                                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {alert.alertStatus === 'verified'
                                    ? 'Verified & Customer Notified'
                                    : alert.alertStatus === 'acknowledged'
                                      ? 'Alert Read'
                                      : 'New Payment Alert'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate max-w-2xl">
                                {alert.itemsSummary} · UTR:{' '}
                                <span className="font-mono text-slate-700">{alert.transactionId || 'Submitted'}</span>
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {matchedOrder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    acknowledgeAdminAlert(alert.orderId);
                                    setReceiptOrder(matchedOrder);
                                  }}
                                  className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>Receipt</span>
                                </button>
                              )}
                              {alert.alertStatus !== 'verified' && matchedOrder && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateOrderStatus(matchedOrder.id, 'Confirmed', matchedOrder.trackingNumber)
                                  }
                                  className="px-2.5 py-1.5 rounded-md bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium cursor-pointer"
                                >
                                  Verify &amp; Notify Customer
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-500">
                      New customer order receipts and payment alerts appear here automatically in real time.
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Recent Orders</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('orders')}
                      className="text-xs font-medium text-[#1B3624] hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-4">Order</th>
                          <th className="py-2.5 px-4">Customer</th>
                          <th className="py-2.5 px-4">Items</th>
                          <th className="py-2.5 px-4">Amount</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {orders.slice(0, 6).map((ord) => (
                          <tr key={ord.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900">
                              {ord.id}
                            </td>
                            <td className="py-3 px-4 text-slate-700">{ord.customerName}</td>
                            <td className="py-3 px-4 text-slate-500 tabular-nums">
                              {ord.items.reduce((s, it) => s + it.quantity, 0)}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-900 tabular-nums">
                              &#8377;{ord.totalAmount.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4 text-xs font-medium text-slate-700">
                              {ord.status}
                            </td>
                            <td className="py-3 px-4 text-right space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setReceiptOrder(ord)}
                                className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                Receipt
                              </button>
                              <button
                                type="button"
                                onClick={() => openOrderEditor(ord)}
                                className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                Manage
                              </button>
                            </td>
                          </tr>
                        ))}
                        {orders.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                              No orders recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 2. PRODUCTS & PHOTOS TAB */}
            {activeTab === 'products' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Search products..."
                        className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                      />
                    </div>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-slate-400"
                    >
                      <option value="all">All Categories</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.slug}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={openAddProductModal}
                    className="h-9 px-4 rounded-lg bg-[#1B3624] hover:bg-[#14291b] text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Product</span>
                  </button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Product</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Default Pack</th>
                          <th className="py-3 px-4">Live Price (&#8377;)</th>
                          <th className="py-3 px-4">Stock</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredProducts.map((prod) => {
                          const draftPrice = inlinePrices[prod.id];
                          const currentPriceVal = draftPrice !== undefined ? draftPrice : String(prod.price);
                          const priceDirty =
                            draftPrice !== undefined &&
                            draftPrice.trim() !== '' &&
                            Number(draftPrice) !== prod.price;
                          const isSavingRow = savingRowId === prod.id;
                          const galleryCount = Array.from(
                            new Set([prod.image, ...(prod.gallery || [])].filter(Boolean))
                          ).length;

                          return (
                            <tr key={prod.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3 min-w-[220px]">
                                  <img
                                    src={prod.image}
                                    alt={prod.name}
                                    onLoad={handleProductImageLoad}
                                    onError={(e) => handleProductImageError(e, prod)}
                                    className="w-12 h-12 rounded-md object-contain bg-slate-50 border border-slate-200 p-0.5 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-900 truncate">{prod.name}</p>
                                    <p className="text-xs text-slate-500 truncate">
                                      {prod.tamilName ? `${prod.tamilName} · ` : ''}
                                      <span className="tabular-nums">
                                        {galleryCount} {galleryCount === 1 ? 'photo' : 'photos'}
                                      </span>
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                {prod.category}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap tabular-nums">
                                {prod.defaultWeight}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    value={currentPriceVal}
                                    onChange={(e) =>
                                      setInlinePrices((prev) => ({ ...prev, [prod.id]: e.target.value }))
                                    }
                                    className="w-20 h-8 px-2 rounded border border-slate-200 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-slate-400"
                                  />
                                  {priceDirty && (
                                    <button
                                      type="button"
                                      disabled={isSavingRow}
                                      onClick={() => void handleInlinePriceUpdate(prod)}
                                      className="h-8 px-2.5 rounded bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium cursor-pointer"
                                    >
                                      {isSavingRow ? '...' : 'Update'}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled={isSavingRow}
                                  onClick={() => void handleToggleStock(prod)}
                                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                                    prod.inStock
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                      : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {prod.inStock ? 'In Stock' : 'Out of Stock'}
                                </button>
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEditProductModal(prod)}
                                    className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 transition-colors cursor-pointer"
                                  >
                                    Edit &amp; Photos
                                  </button>

                                  {confirmDeleteProductId === prod.id ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await deleteProduct(prod.id);
                                          setConfirmDeleteProductId(null);
                                        }}
                                        className="px-2 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                                      >
                                        Delete
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteProductId(null)}
                                        className="px-2 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                                      >
                                        Cancel
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteProductId(prod.id)}
                                      aria-label={`Delete ${prod.name}`}
                                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredProducts.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                              No matching products found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 3. IMAGE FOLDERS TAB */}
            {activeTab === 'folders' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Sidebar: Folders */}
                <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                  <form onSubmit={handleCreateFolderSubmit} className="flex gap-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="New folder name..."
                      className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                    />
                    <button
                      type="submit"
                      className="h-9 px-3 rounded-lg bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium cursor-pointer shrink-0"
                    >
                      Create
                    </button>
                  </form>

                  <input
                    ref={folderDirUploadRef}
                    type="file"
                    multiple
                    {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      setIsUploadingFolder(true);
                      try {
                        const created = await uploadLocalDirectoryAsFolder(Array.from(files));
                        if (created) setSelectedFolderId(created.id);
                      } finally {
                        setIsUploadingFolder(false);
                        if (folderDirUploadRef.current) folderDirUploadRef.current.value = '';
                      }
                    }}
                  />

                  <button
                    type="button"
                    disabled={isUploadingFolder}
                    onClick={() => folderDirUploadRef.current?.click()}
                    className="w-full h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {isUploadingFolder ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Uploading folder...</span>
                      </>
                    ) : (
                      <>
                        <FolderUp className="w-3.5 h-3.5" />
                        <span>Upload Local Folder</span>
                      </>
                    )}
                  </button>

                  <div className="border-t border-slate-200 pt-3 space-y-1 max-h-[55vh] overflow-y-auto">
                    {mediaFolders.map((folder) => {
                      const active = selectedFolder?.id === folder.id;
                      return (
                        <div
                          key={folder.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            active
                              ? 'bg-slate-100 text-slate-900 font-medium'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFolderId(folder.id);
                              setConfirmAction(null);
                            }}
                            className="flex-1 flex items-center justify-between text-left min-w-0 cursor-pointer"
                          >
                            <span className="truncate">{folder.name}</span>
                            <span className="text-xs font-mono tabular-nums text-slate-400 ml-2">
                              {folder.images.length}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                    {mediaFolders.length === 0 && (
                      <p className="text-xs text-slate-500 py-4 text-center">
                        No folders created yet.
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Panel: Selected Folder Contents */}
                <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                  {selectedFolder ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            {selectedFolder.name}
                          </h2>
                          <p className="text-xs text-slate-500 tabular-nums">
                            {selectedFolder.images.length}{' '}
                            {selectedFolder.images.length === 1 ? 'photo' : 'photos'} stored in cloud
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={folderFilesUploadRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={async (e) => {
                              const files = e.target.files;
                              if (!files || files.length === 0) return;
                              setIsUploadingFolder(true);
                              try {
                                await addImagesToFolder(selectedFolder.id, Array.from(files));
                              } finally {
                                setIsUploadingFolder(false);
                                if (folderFilesUploadRef.current) folderFilesUploadRef.current.value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={isUploadingFolder}
                            onClick={() => folderFilesUploadRef.current?.click()}
                            className="h-8 px-3 rounded-md bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Add Photos</span>
                          </button>

                          {selectedFolder.images.length > 0 && (
                            confirmAction?.type === 'clear-folder' && confirmAction.folderId === selectedFolder.id ? (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await clearMediaFolder(selectedFolder.id);
                                    setConfirmAction(null);
                                  }}
                                  className="h-8 px-2.5 rounded bg-amber-600 text-white text-xs font-medium"
                                >
                                  Confirm Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAction(null)}
                                  className="h-8 px-2 rounded border border-slate-200 text-xs text-slate-600"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({ type: 'clear-folder', folderId: selectedFolder.id })
                                }
                                className="h-8 px-2.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700"
                              >
                                Clear Photos
                              </button>
                            )
                          )}

                          {confirmAction?.type === 'delete-folder' && confirmAction.folderId === selectedFolder.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteMediaFolder(selectedFolder.id);
                                  setConfirmAction(null);
                                }}
                                className="h-8 px-2.5 rounded bg-red-600 text-white text-xs font-medium"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmAction(null)}
                                className="h-8 px-2 rounded border border-slate-200 text-xs text-slate-600"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({ type: 'delete-folder', folderId: selectedFolder.id })
                              }
                              className="h-8 px-2.5 rounded-md border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Delete Folder
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick Assign Bar */}
                      <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <label htmlFor="folder-target-product" className="text-xs font-medium text-slate-600">
                          Apply photo directly to live product:
                        </label>
                        <select
                          id="folder-target-product"
                          value={targetProductId}
                          onChange={(e) => setTargetProductId(e.target.value)}
                          className="h-8 px-2.5 rounded border border-slate-200 bg-white text-xs text-slate-800 flex-1 min-w-[200px]"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Grid */}
                      {selectedFolder.images.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {selectedFolder.images.map((img) => {
                            const isDeletingImg =
                              confirmAction?.type === 'delete-image' && confirmAction.imageId === img.id;
                            return (
                              <div
                                key={img.id}
                                className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col"
                              >
                                <div className="aspect-square bg-slate-50 p-2 flex items-center justify-center border-b border-slate-200">
                                  <img
                                    src={img.url}
                                    alt={img.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <div className="p-2.5 space-y-2 flex-1 flex flex-col justify-between">
                                  <p className="text-xs text-slate-700 truncate" title={img.name}>
                                    {img.name}
                                  </p>
                                  <div className="flex flex-col gap-1.5">
                                    <div className="grid grid-cols-2 gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void handleApplyFolderPhotoToProduct(img.url, 'main')}
                                        className="py-1 rounded bg-[#1B3624] hover:bg-[#14291b] text-white text-[11px] font-medium cursor-pointer"
                                      >
                                        Set Main
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleApplyFolderPhotoToProduct(img.url, 'gallery')}
                                        className="py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium cursor-pointer"
                                      >
                                        + Gallery
                                      </button>
                                    </div>
                                    {isDeletingImg ? (
                                      <div className="flex items-center gap-1 pt-0.5">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await deleteImageFromFolder(selectedFolder.id, img.id);
                                            setConfirmAction(null);
                                          }}
                                          className="flex-1 py-1 rounded bg-red-600 text-white text-[11px] font-medium"
                                        >
                                          Delete
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmAction(null)}
                                          className="flex-1 py-1 rounded border border-slate-200 text-slate-600 text-[11px]"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmAction({
                                            type: 'delete-image',
                                            folderId: selectedFolder.id,
                                            imageId: img.id
                                          })
                                        }
                                        className="text-[11px] text-slate-400 hover:text-red-600 text-left"
                                      >
                                        Remove photo
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg text-sm text-slate-500">
                          No photos in this folder yet. Click &ldquo;Add Photos&rdquo; above to upload.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-12 text-center text-sm text-slate-500">
                      Create a folder on the left to start organizing product images.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. ORDERS TAB */}
            {activeTab === 'orders' && (
              <div className="space-y-4">
                {/* Admin Receipt Dispatch & Unread Alerts Summary */}
                <div
                  className={`rounded-lg border p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
                    smtpAuthError
                      ? 'border-amber-200 bg-amber-50/70'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <BellRing
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        smtpAuthError || unreadAlertsCount > 0 ? 'text-amber-600' : 'text-emerald-700'
                      }`}
                    />
                    <div className="space-y-1 min-w-0">
                      <strong className="text-slate-900 block">
                        Automatic Admin &amp; Customer Receipt Desk ({BANAYA_CONTACT_EMAIL})
                      </strong>
                      <span className="text-slate-700 block leading-relaxed">
                        {smtpEmailConfigured
                          ? 'Auto-SMTP email dispatch is active for both admin alerts and verified customer receipts.'
                          : smtpAuthError
                            ? `${smtpAuthError} Real-time portal alerts, live customer tracking, and 1-click Receipt Email/WhatsApp below remain fully operational.`
                            : 'Real-time Admin Portal alerts & customer tracking sync are active. Configure SMTP_USER/SMTP_PASS env secrets to also push automated Gmail emails, or use 1-click Receipt Email below.'}
                      </span>
                      {smtpAuthError && (
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#1B3624] font-semibold hover:underline"
                        >
                          <span>Create 16-character Google App Password</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {unreadAlertsCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 border border-amber-200 text-amber-900 font-semibold tabular-nums shrink-0">
                      {unreadAlertsCount} New Payment Alert{unreadAlertsCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search orders, customer, phone..."
                      className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-slate-400"
                  >
                    <option value="all">All Statuses</option>
                    {ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Order &amp; Receipt</th>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">Payment / UTR</th>
                          <th className="py-3 px-4">Total</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredOrders.map((ord) => {
                          const txnRef = ord.transactionId || ord.bankRef || '';
                          const isPendingVerification = ord.status === 'Processing';
                          const receiptNo = ord.receiptNumber || formatReceiptNumber(ord.id);
                          const alertRecord = adminAlerts.find((a) => a.orderId === ord.id);
                          return (
                            <tr
                              key={ord.id}
                              className={
                                alertRecord?.alertStatus === 'unread'
                                  ? 'bg-amber-50/35 hover:bg-amber-50/60'
                                  : 'hover:bg-slate-50/70'
                              }
                            >
                              <td className="py-3 px-4">
                                <div className="font-mono text-xs font-medium text-slate-900">
                                  {ord.id}
                                </div>
                                <div className="font-mono text-[11px] text-emerald-700">
                                  {receiptNo}
                                </div>
                                <div className="font-mono text-[11px] text-slate-400">
                                  {ord.trackingNumber || '—'}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                                {ord.date}
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-slate-900 font-medium">{ord.customerName}</p>
                                <p className="text-xs text-slate-500">{ord.phone}</p>
                                {ord.email && (
                                  <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{ord.email}</p>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-xs text-slate-700 truncate max-w-[180px]" title={ord.paymentMethod}>
                                  {ord.paymentMethod}
                                </p>
                                <p className="font-mono text-xs font-medium text-slate-900">
                                  {txnRef || 'No UTR'}
                                </p>
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900 tabular-nums">
                                &#8377;{ord.totalAmount.toLocaleString('en-IN')}
                              </td>
                              <td className="py-3 px-4 text-xs font-medium">
                                {isPendingVerification ? (
                                  <span className="text-amber-700 font-semibold">
                                    Verification Pending
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-semibold">
                                    {ord.status}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  {isPendingVerification && (
                                    <button
                                      type="button"
                                      onClick={() => updateOrderStatus(ord.id, 'Confirmed', ord.trackingNumber)}
                                      className="px-2.5 py-1.5 rounded-md bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium cursor-pointer"
                                    >
                                      Verify &amp; Notify Customer
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      acknowledgeAdminAlert(ord.id);
                                      setReceiptOrder(ord);
                                    }}
                                    className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>Receipt</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      acknowledgeAdminAlert(ord.id);
                                      openOrderEditor(ord);
                                    }}
                                    className="px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 cursor-pointer"
                                  >
                                    Update
                                  </button>
                                  {confirmDeleteOrderId === ord.id ? (
                                    <span className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          deleteOrder(ord.id);
                                          setConfirmDeleteOrderId(null);
                                        }}
                                        className="px-2 py-1 rounded bg-red-600 text-white text-xs font-medium"
                                      >
                                        Delete
                                      </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteOrderId(null)}
                                      className="px-2 py-1 rounded border border-slate-200 text-xs text-slate-600"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteOrderId(ord.id)}
                                    aria-label={`Delete order ${ord.id}`}
                                    className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredOrders.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                              No matching orders found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 5. CUSTOMERS TAB */}
            {activeTab === 'customers' && (
              <div className="space-y-4">
                <div className="relative max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customers by name, city, phone..."
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Customer</th>
                          <th className="py-3 px-4">City</th>
                          <th className="py-3 px-4">Orders</th>
                          <th className="py-3 px-4">Total Spend</th>
                          <th className="py-3 px-4">Last Order</th>
                          <th className="py-3 px-4 text-right">Contact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {customers.map((cust) => {
                          const cleanPhone = cust.phone.replace(/[^\d]/g, '');
                          return (
                            <tr key={cust.key} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4">
                                <p className="font-medium text-slate-900">{cust.name}</p>
                                <p className="text-xs text-slate-500">{cust.phone}</p>
                              </td>
                              <td className="py-3 px-4 text-slate-600">{cust.city}</td>
                              <td className="py-3 px-4 tabular-nums text-slate-700">
                                {cust.ordersCount}
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900 tabular-nums">
                                &#8377;{cust.totalSpend.toLocaleString('en-IN')}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                                {cust.lastOrderDate}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {cleanPhone && (
                                  <a
                                    href={`https://wa.me/${cleanPhone}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    <span>WhatsApp</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {customers.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                              No customer records yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== PRODUCT & PHOTO EDITOR SUB-MODAL ==================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveProductModal}
            className="w-full max-w-5xl h-full sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Editor Header */}
            <div className="h-14 shrink-0 px-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-base font-semibold text-slate-900 truncate">
                  {isAddingProduct ? 'Add New Product' : 'Edit Product & Photos'}
                </h2>
                {!isAddingProduct && products.length > 1 && (
                  <select
                    value={editingProduct.id}
                    onChange={(e) => {
                      const next = products.find((p) => p.id === e.target.value);
                      if (next) openEditProductModal(next);
                    }}
                    className="hidden sm:block h-8 px-2.5 rounded-md border border-slate-200 text-xs text-slate-700 bg-slate-50 max-w-[210px]"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setIsAddingProduct(false);
                }}
                aria-label="Close editor"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Editor Body: 2-Column Split */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
              {/* Left Form Fields */}
              <div className="lg:col-span-7 p-5 sm:p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-slate-200">
                {/* SECTION 1: PHOTOS */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">1. Product Photos</h3>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {Math.round(galleryBytes / 1024)} KB / {Math.round(MAX_PRODUCT_GALLERY_BYTES / 1024)} KB
                    </span>
                  </div>

                  {/* Main Photo Row */}
                  <div className="flex items-start gap-4">
                    <img
                      src={editingProduct.image}
                      alt={editingProduct.name || 'Product preview'}
                      onLoad={handleProductImageLoad}
                      onError={(e) => handleProductImageError(e, editingProduct)}
                      className="w-20 h-20 rounded-lg object-contain bg-slate-50 border border-slate-200 p-1 shrink-0"
                    />
                    <div className="flex-1 space-y-2.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={primaryUploadRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void handlePrimaryPhotoUpload(e.target.files)}
                        />
                        <button
                          type="button"
                          disabled={isUploadingImage}
                          onClick={() => primaryUploadRef.current?.click()}
                          className="h-8 px-3 rounded-md bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {isUploadingImage ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>Upload Main Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowFolderPicker((v) => !v)}
                          className="h-8 px-3 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>{showFolderPicker ? 'Hide Folders' : 'Choose from Folders'}</span>
                        </button>
                      </div>

                      <input
                        type="text"
                        value={editingProduct.image}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            image: e.target.value,
                            gallery: [
                              e.target.value,
                              ...(editingProduct.gallery || []).filter((g) => g !== editingProduct.image)
                            ]
                          })
                        }
                        placeholder="Image path or URL (e.g. /images/malai-thean-1.webp)"
                        className="w-full h-8 px-2.5 rounded-md border border-slate-200 text-xs font-mono text-slate-700 focus:outline-none focus:border-slate-400"
                      />
                    </div>
                  </div>

                  {/* Inline Folder Picker */}
                  {showFolderPicker && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {mediaFolders.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setPickerFolderId(f.id)}
                            className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                              pickerFolder?.id === f.id
                                ? 'bg-[#1B3624] text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {f.name} ({f.images.length})
                          </button>
                        ))}
                      </div>
                      {pickerFolder && pickerFolder.images.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                          {pickerFolder.images.map((img) => (
                            <div
                              key={img.id}
                              className="rounded border border-slate-200 bg-white p-1.5 space-y-1.5"
                            >
                              <img
                                src={img.url}
                                alt={img.name}
                                className="w-full h-16 object-contain bg-slate-50 rounded"
                              />
                              <div className="grid grid-cols-2 gap-1">
                                <button
                                  type="button"
                                  onClick={() => handlePickFolderPhoto(img.url, true)}
                                  className="py-0.5 rounded bg-[#1B3624] text-white text-[10px] font-medium"
                                >
                                  Main
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePickFolderPhoto(img.url, false)}
                                  className="py-0.5 rounded border border-slate-200 text-slate-700 text-[10px] font-medium"
                                >
                                  + Gallery
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 py-2">
                          No images inside this folder yet.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Gallery Photos Grid */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        Gallery Photos ({editingGallery.length}/8)
                      </span>
                      <div>
                        <input
                          ref={multiGalleryUploadRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => void handleMultipleGalleryUpload(e.target.files)}
                        />
                        <button
                          type="button"
                          disabled={isUploadingImage}
                          onClick={() => multiGalleryUploadRef.current?.click()}
                          className="h-7 px-2.5 rounded border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span>Add Gallery Photos</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {editingGallery.map((url, idx) => (
                        <div
                          key={`${url.slice(0, 32)}-${idx}`}
                          className={`rounded-lg border p-2 space-y-2 bg-white ${
                            idx === 0 ? 'border-[#1B3624]' : 'border-slate-200'
                          }`}
                        >
                          <div className="relative aspect-square bg-slate-50 rounded overflow-hidden flex items-center justify-center">
                            <img
                              src={url}
                              alt={`Gallery ${idx + 1}`}
                              className="w-full h-full object-contain p-1"
                            />
                            <span
                              className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                idx === 0
                                  ? 'bg-[#1B3624] text-white'
                                  : 'bg-white/90 border border-slate-200 text-slate-700'
                              }`}
                            >
                              {idx === 0 ? 'Main' : `#${idx + 1}`}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveGalleryPhoto(idx, -1)}
                                className="p-1 rounded border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50"
                                title="Move left"
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === editingGallery.length - 1}
                                onClick={() => handleMoveGalleryPhoto(idx, 1)}
                                className="p-1 rounded border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-50"
                                title="Move right"
                              >
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>

                            {idx > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleSetMainGalleryPhoto(url)}
                                className="text-[11px] font-medium text-[#1B3624] hover:underline"
                              >
                                Make Main
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Primary</span>
                            )}
                          </div>

                          {editingGallery.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryPhoto(url)}
                              className="w-full py-1 rounded border border-slate-200 text-[11px] text-red-600 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {/* SECTION 2: PRICING & INVENTORY */}
                <section className="space-y-4 pt-5 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">2. Pricing &amp; Stock</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Selling Price (&#8377;)
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={editingProduct.price}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            price: Number(e.target.value)
                          })
                        }
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Original MRP (&#8377;)
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={editingProduct.originalPrice}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            originalPrice: Number(e.target.value)
                          })
                        }
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm font-mono tabular-nums text-slate-900"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Default Pack
                      </label>
                      <input
                        type="text"
                        value={editingProduct.defaultWeight}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            defaultWeight: e.target.value
                          })
                        }
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Available Pack Weights (comma separated)
                    </label>
                    <input
                      type="text"
                      value={editingProduct.weightOptions.join(', ')}
                      onChange={(e) => {
                        const opts = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        setEditingProduct({
                          ...editingProduct,
                          weightOptions: opts.length > 0 ? opts : ['500g']
                        });
                      }}
                      placeholder="250g, 500g, 1kg"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-slate-700">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingProduct.inStock}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, inStock: e.target.checked })
                        }
                        className="rounded border-slate-300 text-[#1B3624]"
                      />
                      <span>In Stock (Available to Buy)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.isBestSeller)}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, isBestSeller: e.target.checked })
                        }
                        className="rounded border-slate-300 text-[#1B3624]"
                      />
                      <span>Best Seller</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.isNew)}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, isNew: e.target.checked })
                        }
                        className="rounded border-slate-300 text-[#1B3624]"
                      />
                      <span>New Arrival</span>
                    </label>
                  </div>
                </section>

                {/* SECTION 3: PRODUCT DETAILS */}
                <section className="space-y-3.5 pt-5 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">3. Product Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Product Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingProduct.name}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, name: e.target.value })
                        }
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Tamil Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={editingProduct.tamilName || ''}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, tamilName: e.target.value })
                        }
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Category
                      </label>
                      <select
                        value={editingProduct.categorySlug}
                        onChange={(e) => {
                          const cat = CATEGORIES.find((c) => c.slug === e.target.value);
                          if (cat) {
                            setEditingProduct({
                              ...editingProduct,
                              category: cat.name,
                              categorySlug: cat.slug
                            });
                          }
                        }}
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 bg-white"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.id} value={cat.slug}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Short Tagline
                      </label>
                      <input
                        type="text"
                        value={editingProduct.tagline}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, tagline: e.target.value })
                        }
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={editingProduct.description}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, description: e.target.value })
                      }
                      className="w-full p-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Key Benefits (one per line)
                    </label>
                    <textarea
                      rows={3}
                      value={editingProduct.keyBenefits.join('\n')}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          keyBenefits: e.target.value
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean)
                        })
                      }
                      className="w-full p-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                    />
                  </div>
                </section>
              </div>

              {/* Right Column: Live Customer Card Preview */}
              <div className="lg:col-span-5 p-5 sm:p-6 bg-slate-50">
                <div className="sticky top-0 space-y-3">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Live Storefront Preview
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="aspect-square bg-white p-4 flex items-center justify-center border-b border-slate-100">
                      <img
                        src={editingGallery[previewGalleryIdx] || editingProduct.image}
                        alt={editingProduct.name || 'Preview'}
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {editingGallery.length > 1 && (
                      <div className="px-4 pt-3 flex items-center gap-2 overflow-x-auto">
                        {editingGallery.map((g, i) => (
                          <button
                            key={`${g.slice(0, 20)}-${i}`}
                            type="button"
                            onClick={() => setPreviewGalleryIdx(i)}
                            className={`w-11 h-11 rounded border p-0.5 shrink-0 ${
                              previewGalleryIdx === i
                                ? 'border-[#1B3624]'
                                : 'border-slate-200 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={g} alt="" className="w-full h-full object-contain" />
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-4 space-y-2.5">
                      <p className="text-xs text-slate-500">{editingProduct.category}</p>
                      <div>
                        <h4 className="text-base font-semibold text-slate-900">
                          {editingProduct.name || 'Product Name'}
                        </h4>
                        {editingProduct.tamilName && (
                          <p className="text-xs text-slate-500">{editingProduct.tamilName}</p>
                        )}
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-semibold text-slate-900 tabular-nums">
                          &#8377;{editingProduct.price || 0}
                        </span>
                        {editingProduct.originalPrice > editingProduct.price && (
                          <>
                            <span className="text-sm text-slate-400 line-through tabular-nums">
                              &#8377;{editingProduct.originalPrice}
                            </span>
                            <span className="text-xs font-medium text-emerald-700 tabular-nums">
                              {Math.round(
                                ((editingProduct.originalPrice - editingProduct.price) /
                                  editingProduct.originalPrice) *
                                  100
                              )}
                              % off
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {editingProduct.weightOptions.map((w) => (
                          <span
                            key={w}
                            className={`px-2 py-0.5 rounded text-xs border ${
                              w === editingProduct.defaultWeight
                                ? 'border-[#1B3624] bg-emerald-50 text-[#1B3624] font-medium'
                                : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            {w}
                          </span>
                        ))}
                      </div>

                      <div className="pt-2">
                        <div className="w-full h-9 rounded-lg bg-[#1B3624] text-white text-xs font-medium flex items-center justify-center">
                          {editingProduct.inStock ? 'Add to Cart' : 'Out of Stock'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Editor Sticky Footer */}
            <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Changes save to Cloud Firestore and appear live across all customer devices.
              </p>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    setIsAddingProduct(false);
                  }}
                  className="h-9 px-4 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct || isUploadingImage}
                  className="h-9 px-5 rounded-lg bg-[#1B3624] hover:bg-[#14291b] disabled:opacity-60 text-white text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
                >
                  {isSavingProduct ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <span>{isAddingProduct ? 'Publish New Product' : 'Update Live Website'}</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ==================== ORDER EDITOR SUB-MODAL ==================== */}
      {editingOrder && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveOrder}
            className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Order {editingOrder.id}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingOrder.customerName} &middot; {editingOrder.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Order Total</span>
                  <strong className="text-slate-900 tabular-nums">&#8377;{editingOrder.totalAmount.toLocaleString('en-IN')}</strong>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Payment Method</span>
                  <span className="font-medium text-slate-800 text-right">{editingOrder.paymentMethod}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Customer UTR / Txn ID</span>
                  <code className="font-mono font-semibold text-slate-900">
                    {editingOrder.transactionId || editingOrder.bankRef || 'Not provided'}
                  </code>
                </div>
                {editingOrder.status === 'Processing' && (
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-amber-700 font-medium">Awaiting Payment Verification</span>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderDraftStatus('Confirmed');
                        updateOrderStatus(editingOrder.id, 'Confirmed', orderDraftTracking, orderDraftNote);
                        setEditingOrder(null);
                      }}
                      className="px-2.5 py-1 rounded bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium cursor-pointer"
                    >
                      Verify &amp; Confirm Now
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Order Status
                </label>
                <select
                  value={orderDraftStatus}
                  onChange={(e) => setOrderDraftStatus(e.target.value as Order['status'])}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-900"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Courier / Tracking Number
                </label>
                <input
                  type="text"
                  value={orderDraftTracking}
                  onChange={(e) => setOrderDraftTracking(e.target.value)}
                  placeholder="e.g. IND98427190IN"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Internal Admin Note
                </label>
                <textarea
                  rows={3}
                  value={orderDraftNote}
                  onChange={(e) => setOrderDraftNote(e.target.value)}
                  className="w-full p-3 rounded-lg border border-slate-200 text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <a
                href={`https://wa.me/${editingOrder.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                  `Hello ${editingOrder.customerName}, your Banaya Enterprises order ${editingOrder.id} status is now: ${orderDraftStatus}${
                    orderDraftTracking ? ` (Tracking: ${orderDraftTracking})` : ''
                  }.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3624] hover:underline"
              >
                <span>Notify on WhatsApp</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium"
                >
                  Save Order
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      {/* ==================== OFFICIAL RECEIPT PREVIEW MODAL ==================== */}
      {receiptOrder && (
        <div
          onClick={() => setReceiptOrder(null)}
          className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden my-auto"
          >
            {/* Header */}
            <div className="px-5 py-4 bg-[#064E3B] text-white flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold">
                  Official Order &amp; Payment Receipt
                </p>
                <h3 className="text-base font-bold font-mono">
                  {receiptOrder.receiptNumber || formatReceiptNumber(receiptOrder.id)} &middot; {receiptOrder.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="p-1.5 rounded-lg text-emerald-100 hover:bg-emerald-800 cursor-pointer"
                aria-label="Close receipt preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs sm:text-sm max-h-[75vh] overflow-y-auto">
              <div
                className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${
                  receiptOrder.status === 'Processing'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {receiptOrder.status === 'Processing'
                      ? 'Payment Submitted — Awaiting Admin Verification'
                      : `Payment Verified & Order ${receiptOrder.status}`}
                  </span>
                </div>
                {receiptOrder.status === 'Processing' && (
                  <button
                    type="button"
                    onClick={() => {
                      updateOrderStatus(receiptOrder.id, 'Confirmed', receiptOrder.trackingNumber);
                      setReceiptOrder({ ...receiptOrder, status: 'Confirmed' });
                    }}
                    className="px-3 py-1.5 rounded-md bg-[#1B3624] hover:bg-[#14291b] text-white text-xs font-medium cursor-pointer"
                  >
                    Verify Payment &amp; Notify Customer
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Customer Details</span>
                  <p className="font-semibold text-slate-900 text-sm">{receiptOrder.customerName}</p>
                  <p className="text-slate-600">{receiptOrder.phone}</p>
                  {receiptOrder.email && <p className="text-slate-600">{receiptOrder.email}</p>}
                  <p className="text-slate-600">
                    {receiptOrder.shippingAddress}, {receiptOrder.city} - {receiptOrder.postalCode}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">Payment Reference</span>
                  <p className="text-slate-700">
                    <strong>Method:</strong> {receiptOrder.paymentMethod}
                  </p>
                  <p className="text-slate-700">
                    <strong>UTR / Txn ID:</strong>{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      {receiptOrder.transactionId || receiptOrder.bankRef || 'Submitted'}
                    </span>
                  </p>
                  <p className="text-slate-700">
                    <strong>Tracking No:</strong>{' '}
                    <span className="font-mono">{receiptOrder.trackingNumber}</span>
                  </p>
                  <p className="text-slate-700">
                    <strong>Date:</strong> {receiptOrder.date}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {receiptOrder.items.map((item, idx) => {
                      const unitPrice = getPriceForProductWeight(item.product, item.selectedWeight).price;
                      return (
                        <tr key={idx}>
                          <td className="py-2.5 px-3 text-slate-900 font-medium">
                            {item.product.name}{' '}
                            <span className="text-slate-500 font-normal">({item.selectedWeight})</span>
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-700 tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                            &#8377;{(unitPrice * item.quantity).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between font-bold text-slate-950 text-sm">
                  <span>Total Amount</span>
                  <span className="tabular-nums">&#8377;{receiptOrder.totalAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadOrderReceipt(receiptOrder)}
                  className="h-9 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={buildAdminReceiptMailtoUrl(receiptOrder)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-medium inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Admin Copy ({BANAYA_CONTACT_EMAIL})</span>
                </a>
                {receiptOrder.email && (
                  <a
                    href={buildCustomerConfirmationMailtoUrl(receiptOrder)}
                    onClick={() => markCustomerNotified(receiptOrder.id)}
                    className="h-9 px-3 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white font-medium inline-flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email Customer Receipt</span>
                  </a>
                )}
                {receiptOrder.phone && (
                  <a
                    href={`https://wa.me/${receiptOrder.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                      `Hello ${receiptOrder.customerName}, your Banaya Enterprises order ${receiptOrder.id} (Receipt: ${
                        receiptOrder.receiptNumber || formatReceiptNumber(receiptOrder.id)
                      }) is ${receiptOrder.status === 'Processing' ? 'recorded & awaiting verification' : `${receiptOrder.status} (Payment Verified)`}. Tracking: ${
                        receiptOrder.trackingNumber
                      }. Total: Rs.${receiptOrder.totalAmount}.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => markCustomerNotified(receiptOrder.id)}
                    className="h-9 px-3 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white font-medium inline-flex items-center gap-1.5"
                  >
                    <span>WhatsApp Customer</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
