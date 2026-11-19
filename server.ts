import dotenv from 'dotenv';
dotenv.config({ override: true });
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import { sortCatalogByCanonicalOrder } from './src/utils/catalogOrder';
import { DEFAULT_MEDIA_FOLDERS } from './src/data/defaultMediaFolders';
import type { MediaFolder, MediaFolderImage } from './src/types';

interface StoredProduct {
  id: string;
  name: string;
  tamilName?: string;
  tagline: string;
  category: string;
  categorySlug: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewsCount: number;
  inStock: boolean;
  weightOptions: string[];
  defaultWeight: string;
  badges: string[];
  image: string;
  gallery: string[];
  description: string;
  ingredients: string[];
  keyBenefits: string[];
  howToUse: string;
  storageInfo?: string;
  origin: string;
  isBestSeller?: boolean;
  isNew?: boolean;
}

interface StoredOrder {
  id: string;
  receiptNumber?: string;
  date: string;
  items: Array<{
    product: StoredProduct;
    quantity: number;
    selectedWeight: string;
  }>;
  subtotal: number;
  discount: number;
  shipping: number;
  totalAmount: number;
  status: 'Processing' | 'Confirmed' | 'Shipped' | 'Out for Delivery' | 'Delivered';
  customerName: string;
  phone: string;
  email: string;
  shippingAddress: string;
  city: string;
  postalCode: string;
  paymentMethod: string;
  trackingNumber: string;
  transactionId?: string;
  bankRef?: string;
}

interface ReceiptDispatchLog {
  orderId: string;
  receiptNumber: string;
  eventType: 'order-receipt' | 'order-confirmed';
  adminEmailTarget: string;
  customerEmailTarget: string;
  adminEmailSent: boolean;
  customerEmailSent: boolean;
  portalAlertRecorded: boolean;
  dispatchedAt: string;
}

interface StoreState {
  products: StoredProduct[];
  orders: StoredOrder[];
  adminNotes: Record<string, string>;
  mediaFolders: MediaFolder[];
  receiptLogs?: ReceiptDispatchLog[];
  updatedAt: number;
}

function parseCliPort(): number | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (args[i].startsWith('--port=')) {
      const parsed = Number(args[i].slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

const PORT = parseCliPort() || Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DEFAULT_PRODUCTS_PATH = path.join(ROOT_DIR, 'src', 'data', 'products.json');
const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || 'banayana00123';
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'banayaenterprise100@gmail.com';

interface SmtpRuntimeStatus {
  verified: boolean | null;
  authError: string | null;
  checkedCredentialHash: string;
}

const smtpRuntimeStatus: SmtpRuntimeStatus = {
  verified: null,
  authError: null,
  checkedCredentialHash: ''
};

function sanitizeEnvSecret(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getSmtpTransporter() {
  const user = sanitizeEnvSecret(process.env.SMTP_USER);
  let pass = sanitizeEnvSecret(process.env.SMTP_PASS);
  const host = (sanitizeEnvSecret(process.env.SMTP_HOST) || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT) || 465;

  if (!user || !pass || pass === 'MY_SMTP_PASS') return null;
  if (host.toLowerCase().includes('gmail')) {
    pass = pass.replace(/\s+/g, '');
  }

  const credHash = crypto.createHash('sha256').update(`${host}:${port}:${user}:${pass}`).digest('hex').slice(0, 16);
  if (smtpRuntimeStatus.checkedCredentialHash !== credHash) {
    smtpRuntimeStatus.verified = null;
    smtpRuntimeStatus.authError = null;
    smtpRuntimeStatus.checkedCredentialHash = credHash;
  }

  return {
    user,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    })
  };
}

function formatSmtpAuthHint(err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const code = (err as { code?: string; responseCode?: number } | null)?.code || '';
  const responseCode = (err as { responseCode?: number } | null)?.responseCode;

  if (
    responseCode === 535 ||
    code === 'EAUTH' ||
    rawMessage.includes('535') ||
    rawMessage.toLowerCase().includes('username and password not accepted')
  ) {
    return 'Gmail rejected SMTP_PASS (535-5.7.8): Google requires a 16-character App Password (from Google Account -> Security -> 2-Step Verification -> App Passwords), not your regular Gmail password.';
  }
  return 'SMTP server connection unavailable; real-time portal alerts & 1-click Email/WhatsApp remain active.';
}

async function ensureSmtpReady(smtp: NonNullable<ReturnType<typeof getSmtpTransporter>>): Promise<boolean> {
  if (smtpRuntimeStatus.verified === true) return true;
  if (smtpRuntimeStatus.verified === false) return false;

  try {
    await smtp.transporter.verify();
    smtpRuntimeStatus.verified = true;
    smtpRuntimeStatus.authError = null;
    return true;
  } catch (err) {
    smtpRuntimeStatus.verified = false;
    smtpRuntimeStatus.authError = formatSmtpAuthHint(err);
    console.info('[SMTP Notice]', smtpRuntimeStatus.authError);
    return false;
  }
}

async function trySendSmtpMail(
  smtp: NonNullable<ReturnType<typeof getSmtpTransporter>>,
  mailOptions: SendMailOptions
): Promise<boolean> {
  if (smtpRuntimeStatus.verified === false) return false;
  try {
    await smtp.transporter.sendMail(mailOptions);
    smtpRuntimeStatus.verified = true;
    smtpRuntimeStatus.authError = null;
    return true;
  } catch (err) {
    smtpRuntimeStatus.verified = false;
    smtpRuntimeStatus.authError = formatSmtpAuthHint(err);
    console.info('[SMTP Notice]', smtpRuntimeStatus.authError);
    return false;
  }
}

function escapeServerHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildServerReceiptHtml(order: StoredOrder, isConfirmed: boolean): string {
  const receiptNo = order.receiptNumber || `RCP-${order.id}`;
  const txnRef = (order.transactionId || order.bankRef || '').trim() || 'Submitted';
  const rows = (order.items || [])
    .map((item, idx) => {
      const unitPrice = Number(item.product?.price) || 0;
      const qty = Number(item.quantity) || 1;
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${idx + 1}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;"><strong>${escapeServerHtml(item.product?.name || 'Product')}</strong> (${escapeServerHtml(item.selectedWeight)})</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${qty}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">&#8377;${(unitPrice * qty).toLocaleString('en-IN')}</td>
      </tr>`;
    })
    .join('');

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#064E3B;color:#fff;padding:20px 24px;">
      <h2 style="margin:0;font-size:20px;">Banaya Enterprises — Official Order Receipt</h2>
      <p style="margin:6px 0 0;font-size:12px;color:#d1fae5;">Receipt: ${escapeServerHtml(receiptNo)} &middot; Order ID: ${escapeServerHtml(order.id)}</p>
    </div>
    <div style="padding:14px 24px;background:${isConfirmed ? '#ecfdf5' : '#fffbeb'};border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;color:${isConfirmed ? '#065f46' : '#92400e'};">
      ${isConfirmed ? `PAYMENT VERIFIED & ORDER CONFIRMED (${escapeServerHtml(order.status)})` : 'NEW ORDER & PAYMENT SUBMITTED — VERIFICATION PENDING'}
    </div>
    <div style="padding:20px 24px;font-size:13px;color:#1e293b;">
      <p style="margin:0 0 8px;"><strong>Customer:</strong> ${escapeServerHtml(order.customerName)} (${escapeServerHtml(order.phone)})</p>
      <p style="margin:0 0 8px;"><strong>Delivery Address:</strong> ${escapeServerHtml(order.shippingAddress)}, ${escapeServerHtml(order.city)} - ${escapeServerHtml(order.postalCode)}</p>
      <p style="margin:0 0 8px;"><strong>Payment Method:</strong> ${escapeServerHtml(order.paymentMethod)} &middot; <strong>UTR / Txn Ref:</strong> ${escapeServerHtml(txnRef)}</p>
      <p style="margin:0 0 16px;"><strong>Tracking No:</strong> ${escapeServerHtml(order.trackingNumber || 'Pending')}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">#</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;">Item</th>
            <th style="padding:8px 10px;text-align:center;border-bottom:1px solid #e2e8f0;">Qty</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:16px 0 0;font-size:16px;font-weight:700;text-align:right;">Total Paid: &#8377;${Number(order.totalAmount || 0).toLocaleString('en-IN')}</p>
    </div>
  </div>`;
}

const isRunningTsx =
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  (process.env._ || '').includes('tsx');

const isDev =
  process.env.NODE_ENV === 'development' ||
  process.env.npm_lifecycle_event === 'dev' ||
  isRunningTsx ||
  !fs.existsSync(path.join(DIST_DIR, 'index.html'));

const isProduction = !isDev;

function resolveWritableDir(primaryDir: string, fallbackDir: string): string {
  try {
    fs.mkdirSync(primaryDir, { recursive: true });
    const testFile = path.join(primaryDir, '.write-check');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return primaryDir;
  } catch {
    fs.mkdirSync(fallbackDir, { recursive: true });
    return fallbackDir;
  }
}

const DATA_DIR = resolveWritableDir(
  path.join(ROOT_DIR, 'data'),
  path.join('/tmp', 'banaya-data')
);

const UPLOADS_DIR = resolveWritableDir(
  path.join(ROOT_DIR, 'public', 'uploads'),
  path.join('/tmp', 'banaya-uploads')
);

const STORE_FILE = path.join(DATA_DIR, 'store.json');

function loadDefaultProducts(): StoredProduct[] {
  try {
    if (fs.existsSync(DEFAULT_PRODUCTS_PATH)) {
      const raw = fs.readFileSync(DEFAULT_PRODUCTS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as StoredProduct[];
      }
    }
  } catch (err) {
    console.error('Failed to read default products.json:', err);
  }
  return [];
}

function createInitialOrders(products: StoredProduct[]): StoredOrder[] {
  const byId = (id: string, fallbackIdx: number) =>
    products.find((p) => p.id === id) || products[fallbackIdx] || products[0];

  if (products.length === 0) return [];

  return [
    {
      id: 'STM-84920',
      date: '2026-11-10',
      items: [
        { product: byId('malai-thean', 2), quantity: 1, selectedWeight: '500g' },
        { product: byId('abc-malt', 6), quantity: 2, selectedWeight: '100g' }
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
        { product: byId('gulkand', 3), quantity: 1, selectedWeight: '250g' }
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
        { product: byId('mudavatukal-soup', 9), quantity: 3, selectedWeight: '100g' },
        { product: byId('karuppukavani-kanji', 10), quantity: 2, selectedWeight: '250g' }
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

function uploadUrlExistsOnDisk(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('/uploads/')) return true;
  const filename = path.basename(url);
  const candidates = [
    path.join(UPLOADS_DIR, filename),
    path.join(ROOT_DIR, 'public', 'uploads', filename),
    path.join(DIST_DIR, 'uploads', filename)
  ];
  return candidates.some((filePath) => fs.existsSync(filePath));
}

function sanitizeLoadedStoreState(state: StoreState, defaultProducts: StoredProduct[]): StoreState {
  const fallbackMap = new Map(defaultProducts.map((p) => [p.id, p]));
  const sanitizedProducts = sortCatalogByCanonicalOrder(state.products).map((p) => {
    const def = fallbackMap.get(p.id);
    const validImage = uploadUrlExistsOnDisk(p.image) ? p.image : (def?.image || '/images/banaya_logo.png');
    const rawGallery = Array.isArray(p.gallery) ? p.gallery : [];
    const validGallery = rawGallery.filter((g) => uploadUrlExistsOnDisk(g));
    const mergedGallery = Array.from(new Set([validImage, ...validGallery]));
    return {
      ...p,
      image: validImage,
      gallery: mergedGallery
    };
  });

  const sanitizedFolders = state.mediaFolders.map((folder) => ({
    ...folder,
    images: (folder.images || []).filter((img) => uploadUrlExistsOnDisk(img.url))
  }));

  return {
    ...state,
    products: sanitizedProducts,
    mediaFolders: sanitizedFolders
  };
}

function loadInitialStore(): StoreState {
  const defaultProducts = loadDefaultProducts();
  const repoStoreFile = path.join(ROOT_DIR, 'data', 'store.json');
  const candidateFiles = STORE_FILE === repoStoreFile ? [STORE_FILE] : [STORE_FILE, repoStoreFile];

  for (const filePath of candidateFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<StoreState>;
        return sanitizeLoadedStoreState({
          products: Array.isArray(parsed.products) && parsed.products.length > 0
            ? sortCatalogByCanonicalOrder(parsed.products)
            : sortCatalogByCanonicalOrder(defaultProducts),
          orders: Array.isArray(parsed.orders) ? parsed.orders : createInitialOrders(defaultProducts),
          adminNotes: parsed.adminNotes && typeof parsed.adminNotes === 'object' ? parsed.adminNotes : {},
          mediaFolders: Array.isArray(parsed.mediaFolders)
            ? parsed.mediaFolders
            : JSON.parse(JSON.stringify(DEFAULT_MEDIA_FOLDERS)) as MediaFolder[],
          receiptLogs: Array.isArray(parsed.receiptLogs) ? parsed.receiptLogs : [],
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
        }, defaultProducts);
      }
    } catch (err) {
      console.error(`Failed to load ${filePath}, trying next fallback:`, err);
    }
  }

  return sanitizeLoadedStoreState({
    products: sortCatalogByCanonicalOrder(defaultProducts),
    orders: createInitialOrders(defaultProducts),
    adminNotes: {
      'STM-84920': 'Delivered via DTDC Courier. Customer praised Honey aroma.',
      'STM-85104': 'Customer requested fresh batch honey jar. Verified via WhatsApp.',
      'STM-85219': 'Joint pain soup ordered for elderly parents. Shipped priority.'
    },
    mediaFolders: JSON.parse(JSON.stringify(DEFAULT_MEDIA_FOLDERS)) as MediaFolder[],
    receiptLogs: [],
    updatedAt: Date.now()
  }, defaultProducts);
}

let storeState: StoreState = loadInitialStore();
const sseClients = new Set<Response>();

function persistStore(syncProductsSeed = false): void {
  storeState.updatedAt = Date.now();
  const tempFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(storeState, null, 2), 'utf8');
  fs.renameSync(tempFile, STORE_FILE);

  // Mirror product catalog into src/data/products.json whenever writable so publishing carries edits automatically
  if (syncProductsSeed) {
    try {
      fs.writeFileSync(DEFAULT_PRODUCTS_PATH, JSON.stringify(storeState.products, null, 2) + '\n', 'utf8');
    } catch (err) {
      console.warn('Could not mirror products to src/data/products.json:', err);
    }
  }
}

function broadcastStoreUpdate(reason: string): void {
  const payload = JSON.stringify({
    reason,
    products: storeState.products,
    orders: storeState.orders,
    adminNotes: storeState.adminNotes,
    mediaFolders: storeState.mediaFolders,
    updatedAt: storeState.updatedAt
  });

  for (const client of sseClients) {
    try {
      client.write(`event: store-update\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const passkey = req.header('x-admin-passkey');
  if (passkey !== ADMIN_PASSKEY) {
    res.status(401).json({ error: 'Unauthorized: invalid admin passkey' });
    return;
  }
  next();
}

async function startServer(): Promise<void> {
  const app = express();

  app.use(express.json({ limit: '50mb' }));

  // Serve uploaded product images cleanly in both dev & production (with bundled fallbacks)
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
  const publicUploadsDir = path.join(ROOT_DIR, 'public', 'uploads');
  if (UPLOADS_DIR !== publicUploadsDir && fs.existsSync(publicUploadsDir)) {
    app.use('/uploads', express.static(publicUploadsDir, { maxAge: '7d' }));
  }
  const distUploadsDir = path.join(DIST_DIR, 'uploads');
  if (fs.existsSync(distUploadsDir)) {
    app.use('/uploads', express.static(distUploadsDir, { maxAge: '7d' }));
  }
  // Never fall through to SPA index.html when an upload file does not exist
  app.use('/uploads', (_req: Request, res: Response) => {
    res.status(404).end();
  });

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, updatedAt: storeState.updatedAt });
  });

  // Verify admin passkey server-side without exposing passkey in client UI
  app.post('/api/admin/verify', (req: Request, res: Response) => {
    const bodyPasskey = typeof req.body?.passkey === 'string' ? req.body.passkey : '';
    const headerPasskey = req.header('x-admin-passkey') || '';
    const candidate = bodyPasskey || headerPasskey;
    if (candidate === ADMIN_PASSKEY) {
      res.json({ ok: true });
      return;
    }
    res.status(401).json({ error: 'Invalid administrator passkey' });
  });

  // Read full live storefront state
  app.get('/api/store', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      products: storeState.products,
      orders: storeState.orders,
      adminNotes: storeState.adminNotes,
      mediaFolders: storeState.mediaFolders,
      updatedAt: storeState.updatedAt
    });
  });

  // Live Server-Sent Events stream for automatic website updates
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(
      `event: connected\ndata: ${JSON.stringify({ updatedAt: storeState.updatedAt })}\n\n`
    );

    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  function saveDataUrlToUploads(dataUrl: string, filename?: string): string {
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!match) {
      throw new Error('UNSUPPORTED_FORMAT');
    }

    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error('TOO_LARGE');
    }

    const safeBase = (filename || 'product')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toLowerCase()
      .slice(0, 40) || 'product';
    const uniqueName = `${safeBase}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    const destPath = path.join(UPLOADS_DIR, uniqueName);

    fs.writeFileSync(destPath, buffer);
    return `/uploads/${uniqueName}`;
  }

  function cleanupUnusedUpload(url: string): void {
    if (!url || !url.startsWith('/uploads/')) return;
    const isStillUsedByProduct = storeState.products.some(
      (p) => p.image === url || (Array.isArray(p.gallery) && p.gallery.includes(url))
    );
    const isStillUsedByFolder = storeState.mediaFolders.some((f) =>
      f.images.some((img) => img.url === url)
    );
    const isStillUsedByOrder = storeState.orders.some((o) =>
      o.items.some((it) => it.product?.image === url || (Array.isArray(it.product?.gallery) && it.product.gallery.includes(url)))
    );
    if (isStillUsedByProduct || isStillUsedByFolder || isStillUsedByOrder) return;

    const filename = path.basename(url);
    const targetPath = path.join(UPLOADS_DIR, filename);
    if (targetPath.startsWith(UPLOADS_DIR) && fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (err) {
        console.warn('Could not delete unused upload file:', err);
      }
    }
  }

  function normalizeIncomingProduct(incoming: StoredProduct): StoredProduct {
    const cleanImage = typeof incoming.image === 'string' && incoming.image.trim()
      ? incoming.image.trim()
      : '/images/banaya_logo.png';
    const rawGallery = Array.isArray(incoming.gallery)
      ? incoming.gallery.map((g) => (typeof g === 'string' ? g.trim() : '')).filter(Boolean)
      : [];
    const dedupedGallery = Array.from(new Set([cleanImage, ...rawGallery]));
    return {
      ...incoming,
      image: cleanImage,
      gallery: dedupedGallery
    };
  }

  // Upload product image to persistent uploads folder
  app.post('/api/upload', requireAdmin, (req: Request, res: Response) => {
    try {
      const { dataUrl, filename } = req.body as { dataUrl?: string; filename?: string };
      if (!dataUrl || typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Missing image dataUrl' });
        return;
      }

      const url = saveDataUrlToUploads(dataUrl, filename);
      res.json({ url });
    } catch (err) {
      if (err instanceof Error && err.message === 'UNSUPPORTED_FORMAT') {
        res.status(400).json({ error: 'Unsupported image format' });
        return;
      }
      if (err instanceof Error && err.message === 'TOO_LARGE') {
        res.status(413).json({ error: 'Image too large (max 10MB)' });
        return;
      }
      console.error('Image upload error:', err);
      res.status(500).json({ error: 'Failed to save uploaded image' });
    }
  });

  // Create a new image folder
  app.post('/api/media/folders', requireAdmin, (req: Request, res: Response) => {
    try {
      const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!rawName) {
        res.status(400).json({ error: 'Folder name is required' });
        return;
      }

      const existing = storeState.mediaFolders.find(
        (f) => f.name.toLowerCase() === rawName.toLowerCase()
      );
      if (existing) {
        res.json({
          folder: existing,
          mediaFolders: storeState.mediaFolders,
          updatedAt: storeState.updatedAt
        });
        return;
      }

      const slug = rawName
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'folder';

      const newFolder: MediaFolder = {
        id: `folder-${slug}-${Date.now().toString().slice(-4)}`,
        name: rawName,
        images: [],
        createdAt: Date.now()
      };

      storeState.mediaFolders = [newFolder, ...storeState.mediaFolders];
      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.status(201).json({
        folder: newFolder,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Create media folder error:', err);
      res.status(500).json({ error: 'Failed to create image folder' });
    }
  });

  // Delete an image folder
  app.delete('/api/media/folders/:folderId', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId } = req.params;
      const targetFolder = storeState.mediaFolders.find((f) => f.id === folderId);
      if (!targetFolder) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      storeState.mediaFolders = storeState.mediaFolders.filter((f) => f.id !== folderId);
      for (const img of targetFolder.images) {
        cleanupUnusedUpload(img.url);
      }

      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.json({
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Delete media folder error:', err);
      res.status(500).json({ error: 'Failed to delete image folder' });
    }
  });

  // Add one or multiple images to a specific folder
  app.post('/api/media/folders/:folderId/images', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId } = req.params;
      const folderIdx = storeState.mediaFolders.findIndex((f) => f.id === folderId);
      if (folderIdx < 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      const body = req.body as {
        dataUrl?: string;
        filename?: string;
        url?: string;
        items?: Array<{ dataUrl?: string; filename?: string; url?: string }>;
      };

      const rawItems = Array.isArray(body?.items)
        ? body.items
        : body?.dataUrl || body?.url
          ? [{ dataUrl: body.dataUrl, filename: body.filename, url: body.url }]
          : [];

      if (rawItems.length === 0) {
        res.status(400).json({ error: 'No image data provided' });
        return;
      }

      const addedImages: MediaFolderImage[] = [];
      for (const item of rawItems) {
        let resolvedUrl = '';
        if (typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:image/')) {
          resolvedUrl = saveDataUrlToUploads(item.dataUrl, item.filename);
        } else if (typeof item.url === 'string' && item.url.trim()) {
          resolvedUrl = item.url.trim();
        } else {
          continue;
        }

        const displayName = (item.filename || 'Uploaded Image')
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim() || 'Product Photo';

        addedImages.push({
          id: `img-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          name: displayName,
          url: resolvedUrl,
          createdAt: Date.now()
        });
      }

      if (addedImages.length === 0) {
        res.status(400).json({ error: 'No valid images in request' });
        return;
      }

      const target = storeState.mediaFolders[folderIdx];
      const updatedFolder: MediaFolder = {
        ...target,
        images: [...addedImages, ...target.images]
      };
      storeState.mediaFolders = storeState.mediaFolders.map((f, idx) =>
        idx === folderIdx ? updatedFolder : f
      );

      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.status(201).json({
        folder: updatedFolder,
        addedImages,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'UNSUPPORTED_FORMAT') {
        res.status(400).json({ error: 'Unsupported image format' });
        return;
      }
      if (err instanceof Error && err.message === 'TOO_LARGE') {
        res.status(413).json({ error: 'Image too large (max 10MB)' });
        return;
      }
      console.error('Add folder images error:', err);
      res.status(500).json({ error: 'Failed to add images to folder' });
    }
  });

  // Clear all images inside a folder without deleting the folder itself
  app.delete('/api/media/folders/:folderId/images', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId } = req.params;
      const folderIdx = storeState.mediaFolders.findIndex((f) => f.id === folderId);
      if (folderIdx < 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      const targetFolder = storeState.mediaFolders[folderIdx];
      const removedImages = [...targetFolder.images];
      const updatedFolder: MediaFolder = {
        ...targetFolder,
        images: []
      };

      storeState.mediaFolders = storeState.mediaFolders.map((f, idx) =>
        idx === folderIdx ? updatedFolder : f
      );

      for (const img of removedImages) {
        cleanupUnusedUpload(img.url);
      }

      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.json({
        folder: updatedFolder,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Clear folder images error:', err);
      res.status(500).json({ error: 'Failed to clear folder images' });
    }
  });

  // Delete a single image from a folder
  app.delete('/api/media/folders/:folderId/images/:imageId', requireAdmin, (req: Request, res: Response) => {
    try {
      const { folderId, imageId } = req.params;
      const folderIdx = storeState.mediaFolders.findIndex((f) => f.id === folderId);
      if (folderIdx < 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }

      const targetFolder = storeState.mediaFolders[folderIdx];
      const targetImage = targetFolder.images.find((img) => img.id === imageId);
      if (!targetImage) {
        res.status(404).json({ error: 'Image not found in folder' });
        return;
      }

      const updatedFolder: MediaFolder = {
        ...targetFolder,
        images: targetFolder.images.filter((img) => img.id !== imageId)
      };

      storeState.mediaFolders = storeState.mediaFolders.map((f, idx) =>
        idx === folderIdx ? updatedFolder : f
      );

      cleanupUnusedUpload(targetImage.url);
      persistStore(false);
      broadcastStoreUpdate('media-updated');

      res.json({
        folder: updatedFolder,
        mediaFolders: storeState.mediaFolders,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Delete folder image error:', err);
      res.status(500).json({ error: 'Failed to delete image from folder' });
    }
  });

  // Update existing product (price, image, gallery, stock, etc.)
  app.put('/api/products/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rawIncoming = req.body as StoredProduct;
      if (!rawIncoming || !rawIncoming.id || !rawIncoming.name) {
        res.status(400).json({ error: 'Invalid product payload' });
        return;
      }

      const incoming = normalizeIncomingProduct(rawIncoming);
      const existingIdx = storeState.products.findIndex((p) => p.id === id);
      if (existingIdx >= 0) {
        storeState.products[existingIdx] = incoming;
      } else {
        storeState.products.unshift(incoming);
      }

      persistStore(true);
      broadcastStoreUpdate('product-updated');

      res.json({
        product: incoming,
        products: storeState.products,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Product update error:', err);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  // Create new product
  app.post('/api/products', requireAdmin, (req: Request, res: Response) => {
    try {
      const rawIncoming = req.body as StoredProduct;
      if (!rawIncoming || !rawIncoming.id || !rawIncoming.name) {
        res.status(400).json({ error: 'Invalid product payload' });
        return;
      }

      const incoming = normalizeIncomingProduct(rawIncoming);
      const deduped = storeState.products.filter((p) => p.id !== incoming.id);
      storeState.products = sortCatalogByCanonicalOrder([incoming, ...deduped]);

      persistStore(true);
      broadcastStoreUpdate('product-added');

      res.status(201).json({
        product: incoming,
        products: storeState.products,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Product create error:', err);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  // Delete product
  app.delete('/api/products/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      storeState.products = storeState.products.filter((p) => p.id !== id);

      persistStore(true);
      broadcastStoreUpdate('product-deleted');

      res.json({
        products: storeState.products,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Product delete error:', err);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  // Create customer order
  app.post('/api/orders', (req: Request, res: Response) => {
    try {
      const order = req.body as StoredOrder;
      if (!order || !order.id) {
        res.status(400).json({ error: 'Invalid order payload' });
        return;
      }

      storeState.orders = [order, ...storeState.orders.filter((o) => o.id !== order.id)];
      persistStore(false);
      broadcastStoreUpdate('order-created');

      res.status(201).json({ order, updatedAt: storeState.updatedAt });
    } catch (err) {
      console.error('Order create error:', err);
      res.status(500).json({ error: 'Failed to save order' });
    }
  });

  // Update order status / tracking / admin note
  app.put('/api/orders/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, trackingNumber, note } = req.body as {
        status?: StoredOrder['status'];
        trackingNumber?: string;
        note?: string;
      };

      storeState.orders = storeState.orders.map((o) => {
        if (o.id !== id) return o;
        return {
          ...o,
          status: status || o.status,
          trackingNumber: trackingNumber !== undefined ? trackingNumber : o.trackingNumber
        };
      });

      if (note !== undefined) {
        storeState.adminNotes[id] = note;
      }

      persistStore(false);
      broadcastStoreUpdate('order-updated');

      res.json({
        orders: storeState.orders,
        adminNotes: storeState.adminNotes,
        updatedAt: storeState.updatedAt
      });
    } catch (err) {
      console.error('Order update error:', err);
      res.status(500).json({ error: 'Failed to update order' });
    }
  });

  // Delete order
  app.delete('/api/orders/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      storeState.orders = storeState.orders.filter((o) => o.id !== id);
      persistStore(false);
      broadcastStoreUpdate('order-deleted');

      res.json({ orders: storeState.orders, updatedAt: storeState.updatedAt });
    } catch (err) {
      console.error('Order delete error:', err);
      res.status(500).json({ error: 'Failed to delete order' });
    }
  });

  // Update admin note for an order
  app.put('/api/admin-notes/:orderId', requireAdmin, (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { note } = req.body as { note?: string };
      storeState.adminNotes[orderId] = note || '';
      persistStore(false);
      broadcastStoreUpdate('note-updated');
      res.json({ adminNotes: storeState.adminNotes, updatedAt: storeState.updatedAt });
    } catch (err) {
      console.error('Admin note update error:', err);
      res.status(500).json({ error: 'Failed to save admin note' });
    }
  });

  // Check notification / SMTP delivery capability
  app.get('/api/notifications/status', async (_req: Request, res: Response) => {
    const smtp = getSmtpTransporter();
    let smtpReady = false;
    if (smtp) {
      smtpReady = await ensureSmtpReady(smtp);
    }
    res.json({
      smtpConfigured: smtpReady,
      smtpCredentialsPresent: Boolean(smtp),
      smtpAuthError: smtp ? smtpRuntimeStatus.authError : null,
      adminAlertEmail: ADMIN_ALERT_EMAIL,
      recentDispatches: (storeState.receiptLogs || []).slice(0, 20)
    });
  });

  // Automatically record & dispatch receipt + admin alert on customer order payment
  app.post('/api/notifications/order-receipt', async (req: Request, res: Response) => {
    try {
      const order = req.body as StoredOrder;
      if (!order || !order.id) {
        res.status(400).json({ error: 'Invalid order payload for receipt dispatch' });
        return;
      }

      const receiptNumber = order.receiptNumber || `RCP-${order.id}`;
      const normalizedOrder: StoredOrder = { ...order, receiptNumber };
      storeState.orders = [normalizedOrder, ...storeState.orders.filter((o) => o.id !== order.id)];

      let adminEmailSent = false;
      let customerEmailSent = false;
      const smtp = getSmtpTransporter();
      let smtpReady = false;

      if (smtp) {
        smtpReady = await ensureSmtpReady(smtp);
        if (smtpReady) {
          const html = buildServerReceiptHtml(normalizedOrder, false);
          adminEmailSent = await trySendSmtpMail(smtp, {
            from: `"Banaya Enterprises Orders" <${smtp.user}>`,
            to: ADMIN_ALERT_EMAIL,
            subject: `[Admin Alert] New Order & Payment Receipt ${receiptNumber} (₹${normalizedOrder.totalAmount})`,
            html
          });

          if (adminEmailSent && normalizedOrder.email && normalizedOrder.email.includes('@')) {
            customerEmailSent = await trySendSmtpMail(smtp, {
              from: `"Banaya Enterprises" <${smtp.user}>`,
              to: normalizedOrder.email,
              subject: `Order & Payment Receipt ${receiptNumber} — Banaya Enterprises`,
              html
            });
          }
        }
      }

      const logEntry: ReceiptDispatchLog = {
        orderId: normalizedOrder.id,
        receiptNumber,
        eventType: 'order-receipt',
        adminEmailTarget: ADMIN_ALERT_EMAIL,
        customerEmailTarget: normalizedOrder.email || '',
        adminEmailSent,
        customerEmailSent,
        portalAlertRecorded: true,
        dispatchedAt: new Date().toISOString()
      };

      storeState.receiptLogs = [logEntry, ...(storeState.receiptLogs || [])].slice(0, 100);
      persistStore(false);
      broadcastStoreUpdate('order-receipt-dispatched');

      res.status(201).json({
        ok: true,
        receiptNumber,
        smtpConfigured: Boolean(smtp && smtpRuntimeStatus.verified === true),
        smtpAuthError: smtp ? smtpRuntimeStatus.authError : null,
        adminEmailSent,
        customerEmailSent,
        portalAlertRecorded: true
      });
    } catch (err) {
      console.error('Order receipt notification error:', err);
      res.status(500).json({ error: 'Failed to process order receipt alert' });
    }
  });

  // Automatically dispatch verified order confirmation & receipt to customer (and admin copy)
  app.post('/api/notifications/order-confirmed', async (req: Request, res: Response) => {
    try {
      const order = req.body as StoredOrder;
      if (!order || !order.id) {
        res.status(400).json({ error: 'Invalid order payload for confirmation dispatch' });
        return;
      }

      const receiptNumber = order.receiptNumber || `RCP-${order.id}`;
      const normalizedOrder: StoredOrder = { ...order, receiptNumber };
      let adminEmailSent = false;
      let customerEmailSent = false;
      const smtp = getSmtpTransporter();

      if (smtp) {
        const smtpReady = await ensureSmtpReady(smtp);
        if (smtpReady) {
          const html = buildServerReceiptHtml(normalizedOrder, true);
          if (normalizedOrder.email && normalizedOrder.email.includes('@')) {
            customerEmailSent = await trySendSmtpMail(smtp, {
              from: `"Banaya Enterprises" <${smtp.user}>`,
              to: normalizedOrder.email,
              subject: `Order Confirmed & Payment Verified (${normalizedOrder.id} / ${receiptNumber})`,
              html
            });
          }
          if (smtpRuntimeStatus.verified !== false) {
            adminEmailSent = await trySendSmtpMail(smtp, {
              from: `"Banaya Enterprises Orders" <${smtp.user}>`,
              to: ADMIN_ALERT_EMAIL,
              subject: `[Order Confirmed] ${normalizedOrder.id} (${receiptNumber}) — Status: ${normalizedOrder.status}`,
              html
            });
          }
        }
      }

      const logEntry: ReceiptDispatchLog = {
        orderId: normalizedOrder.id,
        receiptNumber,
        eventType: 'order-confirmed',
        adminEmailTarget: ADMIN_ALERT_EMAIL,
        customerEmailTarget: normalizedOrder.email || '',
        adminEmailSent,
        customerEmailSent,
        portalAlertRecorded: true,
        dispatchedAt: new Date().toISOString()
      };

      storeState.receiptLogs = [logEntry, ...(storeState.receiptLogs || [])].slice(0, 100);
      persistStore(false);
      broadcastStoreUpdate('order-confirmed-dispatched');

      res.json({
        ok: true,
        receiptNumber,
        smtpConfigured: Boolean(smtp && smtpRuntimeStatus.verified === true),
        smtpAuthError: smtp ? smtpRuntimeStatus.authError : null,
        adminEmailSent,
        customerEmailSent
      });
    } catch (err) {
      console.error('Order confirmation notification error:', err);
      res.status(500).json({ error: 'Failed to dispatch order confirmation' });
    }
  });

  // Payment Gateway Configuration (Razorpay Signed UPI / NetBanking when configured)
  const getRazorpayCredentials = () => {
    const keyId = sanitizeEnvSecret(process.env.RAZORPAY_KEY_ID);
    const keySecret = sanitizeEnvSecret(process.env.RAZORPAY_KEY_SECRET);
    if (!keyId || !keySecret || keyId === 'MY_RAZORPAY_KEY_ID') {
      return null;
    }
    return { keyId, keySecret };
  };

  app.get('/api/payments/config', (_req: Request, res: Response) => {
    const creds = getRazorpayCredentials();
    const isTestMode = Boolean(creds && creds.keyId.startsWith('rzp_test_'));
    const mode = !creds ? 'unconfigured' : isTestMode ? 'test' : 'live';
    res.json({
      razorpayEnabled: Boolean(creds),
      keyId: creds ? creds.keyId : null,
      isTestMode,
      mode
    });
  });

  app.post('/api/payments/razorpay/create-order', async (req: Request, res: Response) => {
    try {
      const creds = getRazorpayCredentials();
      if (!creds) {
        res.status(503).json({ error: 'Razorpay API keys are not configured on the server' });
        return;
      }

      const { amountInr, receipt, customerName, phone, email } = req.body as {
        amountInr?: number;
        receipt?: string;
        customerName?: string;
        phone?: string;
        email?: string;
      };

      const numericAmount = Number(amountInr);
      const amountPaise = Number.isFinite(numericAmount) ? Math.round(numericAmount * 100) : 0;
      if (amountPaise < 100 || amountPaise > 100_000_000) {
        res.status(400).json({ error: 'Invalid payment amount' });
        return;
      }

      const authHeader = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: String(receipt || `BNY-${Date.now()}`).slice(0, 40),
          notes: {
            merchant: 'Banaya Enterprise',
            customerName: String(customerName || '').slice(0, 80),
            phone: String(phone || '').slice(0, 30),
            email: String(email || '').slice(0, 80)
          }
        })
      });

      const rzpData = (await rzpRes.json()) as {
        id?: string;
        amount?: number;
        currency?: string;
        error?: { description?: string };
      };

      if (!rzpRes.ok || !rzpData.id) {
        res.status(502).json({
          error: rzpData.error?.description || 'Failed to initialize Razorpay payment order'
        });
        return;
      }

      res.json({
        orderId: rzpData.id,
        amount: rzpData.amount,
        currency: rzpData.currency || 'INR',
        keyId: creds.keyId,
        isTestMode: creds.keyId.startsWith('rzp_test_')
      });
    } catch (err) {
      console.error('Razorpay create-order error:', err);
      res.status(500).json({ error: 'Failed to initialize gateway payment order' });
    }
  });

  app.post('/api/payments/razorpay/verify', (req: Request, res: Response) => {
    try {
      const creds = getRazorpayCredentials();
      if (!creds) {
        res.status(503).json({ verified: false, error: 'Gateway keys not configured' });
        return;
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
        razorpay_order_id?: string;
        razorpay_payment_id?: string;
        razorpay_signature?: string;
      };

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        res.status(400).json({ verified: false, error: 'Missing payment verification signature fields' });
        return;
      }

      const expectedHex = crypto
        .createHmac('sha256', creds.keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const expectedBuf = Buffer.from(expectedHex, 'utf8');
      const providedBuf = Buffer.from(String(razorpay_signature), 'utf8');

      const isValid =
        expectedBuf.length === providedBuf.length &&
        crypto.timingSafeEqual(expectedBuf, providedBuf);

      if (!isValid) {
        res.status(400).json({ verified: false, error: 'Payment signature mismatch' });
        return;
      }

      res.json({
        verified: true,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id
      });
    } catch (err) {
      console.error('Razorpay verify error:', err);
      res.status(500).json({ verified: false, error: 'Signature verification error' });
    }
  });

  if (!isProduction) {
    // Serve a clean no-HMR client shim so Vite never opens failing WebSockets behind reverse proxies
    app.get('/@vite/client', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`const sheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (parsed.search ? '&' + parsed.search.slice(1) : '') + (parsed.hash || '');
}
export class ErrorOverlay {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(DIST_DIR, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        }
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    console.error('Unhandled request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Banaya Enterprises server running on http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
