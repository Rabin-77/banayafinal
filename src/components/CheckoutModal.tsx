import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  ArrowLeft,
  MessageCircle,
  Copy,
  Check,
  Lock,
  Clock,
  BadgeCheck,
  Building2,
  MapPin,
  Printer,
  Truck,
  ExternalLink,
  Loader2,
  Landmark,
  Download,
  FileText,
  BellRing,
  Mail,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Split,
  Info,
  QrCode
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useShop } from '../context/ShopContext';
import { Order } from '../types';
import {
  getOrderWhatsAppUrl,
  openWhatsAppUrl,
  DISPLAY_PHONE_NUMBER,
  BANAYA_UPI_ID
} from '../utils/whatsapp';
import { BANAYA_CONTACT_EMAIL, BANAYA_BANK_DETAILS } from '../config/storeContact';
import { getPriceForProductWeight } from '../utils/pricing';
import {
  downloadOrderReceipt,
  formatReceiptNumber,
  buildCustomerConfirmationMailtoUrl
} from '../utils/receipt';
import { handleProductImageError, handleProductImageLoad } from '../utils/imageFallback';

type PaymentOptionId = 'netbanking' | 'gpay' | 'phonepe' | 'paytm' | 'upi';

const BANAYA_UPI_QR_IMAGE = '/assets/aistudio/image_07be354a.png';

interface PaymentOptionConfig {
  id: PaymentOptionId;
  label: string;
  subtitle: string;
  tag?: string;
}

interface BankConfig {
  id: string;
  name: string;
  shortName: string;
  code: string;
  accentClass: string;
  portalUrl: string;
  popular: boolean;
}

const PAYMENT_OPTIONS: PaymentOptionConfig[] = [
  {
    id: 'gpay',
    label: 'Google Pay',
    subtitle: 'Pay using Google Pay'
  },
  {
    id: 'phonepe',
    label: 'PhonePe',
    subtitle: 'Pay using PhonePe'
  },
  {
    id: 'paytm',
    label: 'Paytm',
    subtitle: 'Pay using Paytm'
  },
  {
    id: 'upi',
    label: 'UPI Payment',
    subtitle: 'Instant pay via WhatsApp Pay or any UPI app',
    tag: 'Recommended'
  },
  {
    id: 'netbanking',
    label: 'Net Banking',
    subtitle: 'All Indian banks supported — direct bank portal login',
    tag: 'Up to ₹10L'
  }
];

const INDIAN_BANKS: BankConfig[] = [
  {
    id: 'sbi',
    name: 'State Bank of India',
    shortName: 'SBI',
    code: 'SBI',
    accentClass: 'bg-blue-700 text-white',
    portalUrl: 'https://retail.onlinesbi.sbi/retail/login.htm',
    popular: true
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    shortName: 'HDFC',
    code: 'HDFC',
    accentClass: 'bg-indigo-800 text-white',
    portalUrl: 'https://netbanking.hdfcbank.com/netbanking/',
    popular: true
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    shortName: 'ICICI',
    code: 'ICICI',
    accentClass: 'bg-orange-700 text-white',
    portalUrl: 'https://www.icicibank.com/internet-banking',
    popular: true
  },
  {
    id: 'axis',
    name: 'Axis Bank',
    shortName: 'Axis',
    code: 'AXIS',
    accentClass: 'bg-rose-800 text-white',
    portalUrl: 'https://retail.axisbank.co.in/',
    popular: true
  },
  {
    id: 'kotak',
    name: 'Kotak Mahindra Bank',
    shortName: 'Kotak',
    code: 'KTK',
    accentClass: 'bg-red-700 text-white',
    portalUrl: 'https://netbanking.kotak.com/knb2/',
    popular: true
  },
  {
    id: 'iob',
    name: 'Indian Overseas Bank (IOB)',
    shortName: 'IOB',
    code: 'IOB',
    accentClass: 'bg-sky-900 text-white',
    portalUrl: 'https://www.iobnet.co.in/ibanking/login.do',
    popular: true
  },
  {
    id: 'indian',
    name: 'Indian Bank',
    shortName: 'Indian Bank',
    code: 'INDB',
    accentClass: 'bg-sky-800 text-white',
    portalUrl: 'https://www.indianbank.net.in/',
    popular: false
  },
  {
    id: 'canara',
    name: 'Canara Bank',
    shortName: 'Canara',
    code: 'CNR',
    accentClass: 'bg-cyan-700 text-white',
    portalUrl: 'https://online.canarabank.in/',
    popular: false
  },
  {
    id: 'pnb',
    name: 'Punjab National Bank',
    shortName: 'PNB',
    code: 'PNB',
    accentClass: 'bg-amber-700 text-white',
    portalUrl: 'https://netbanking.netpnb.com/',
    popular: false
  },
  {
    id: 'bob',
    name: 'Bank of Baroda',
    shortName: 'BOB',
    code: 'BOB',
    accentClass: 'bg-orange-600 text-white',
    portalUrl: 'https://www.bobibanking.com/',
    popular: false
  },
  {
    id: 'union',
    name: 'Union Bank of India',
    shortName: 'Union Bank',
    code: 'UBI',
    accentClass: 'bg-blue-800 text-white',
    portalUrl: 'https://www.unionbankonline.co.in/',
    popular: false
  }
];

interface BankUpiLimitInfo {
  bank: string;
  perTxnAndDailyUpi: string;
  dailyCountCap: string;
  netBankingLimit: string;
}

const BANK_UPI_LIMITS: BankUpiLimitInfo[] = [
  { bank: 'State Bank of India (SBI)', perTxnAndDailyUpi: '₹1,00,000', dailyCountCap: '10 txns / 24h', netBankingLimit: '₹10,00,000' },
  { bank: 'HDFC Bank', perTxnAndDailyUpi: '₹1,00,000 (₹5k first 24h)', dailyCountCap: '20 txns / 24h', netBankingLimit: '₹10,00,000' },
  { bank: 'ICICI Bank', perTxnAndDailyUpi: '₹1,00,000', dailyCountCap: '10 txns / 24h', netBankingLimit: '₹10,00,000' },
  { bank: 'Axis Bank', perTxnAndDailyUpi: '₹1,00,000', dailyCountCap: '20 txns / 24h', netBankingLimit: '₹10,00,000' },
  { bank: 'Indian Overseas Bank (IOB)', perTxnAndDailyUpi: '₹1,00,000', dailyCountCap: '10 txns / 24h', netBankingLimit: '₹5,00,000' },
  { bank: 'Indian Bank', perTxnAndDailyUpi: '₹1,00,000', dailyCountCap: '10 txns / 24h', netBankingLimit: '₹5,00,000' },
  { bank: 'Canara / PNB / BOB / Union', perTxnAndDailyUpi: '₹50,000 – ₹1,00,000', dailyCountCap: '10 – 20 txns / 24h', netBankingLimit: '₹5,00,000' },
  { bank: 'Browser UPI App Link (NPCI Rule)', perTxnAndDailyUpi: '₹2,000 cap on some banks', dailyCountCap: 'Varies by bank', netBankingLimit: 'Use Bank Transfer / NetBanking' }
];

async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for restricted iframe contexts
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface RazorpaySuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance;

async function loadRazorpayCheckoutScript(): Promise<RazorpayConstructor | null> {
  const win = window as unknown as { Razorpay?: RazorpayConstructor };
  if (win.Razorpay) return win.Razorpay;

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(win.Razorpay || null), { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(win.Razorpay || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

export const CheckoutModal: React.FC = () => {
  const {
    cart,
    orders,
    activeModal,
    setActiveModal,
    cartSubtotal,
    cartDiscount,
    cartShipping,
    cartTotal,
    placeOrder,
    openOrderTracking,
    getEffectivePrice,
    showToast
  } = useShop();

  // Flipkart / Amazon Checkout Flow:
  // 1. 'details' -> Delivery Address & Item Summary
  // 2. 'payment' -> Flipkart / Amazon Payment Selection (NO QR code, direct "Pay ₹Amount")
  // 3. 'gateway' -> Dedicated Internet Banking / UPI Gateway screen (only returns to store after completing payment)
  // 4. 'pending' -> Returned to Store: Real-Time Payment Verification Pending screen
  const [step, setStep] = useState<'details' | 'payment' | 'gateway' | 'pending'>('details');
  const [gatewayPhase, setGatewayPhase] = useState<'connecting' | 'portal'>('connecting');
  const [gatewaySessionId, setGatewaySessionId] = useState<string>('');
  const [gatewaySecondsLeft, setGatewaySecondsLeft] = useState<number>(600);

  const [selectedPayment, setSelectedPayment] = useState<PaymentOptionId>('upi');
  const [selectedBankId, setSelectedBankId] = useState<string>('sbi');
  const [customerUpiId, setCustomerUpiId] = useState<string>('');

  const [transactionIdInput, setTransactionIdInput] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splitFirstAmount, setSplitFirstAmount] = useState<number>(0);
  const [splitSecondTxnId, setSplitSecondTxnId] = useState('');
  const [showBankLimitsGuide, setShowBankLimitsGuide] = useState(false);
  const [paymentConfirmedCheck, setPaymentConfirmedCheck] = useState(false);

  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [liveStatus, setLiveStatus] = useState<Order['status']>('Processing');
  const [liveVerified, setLiveVerified] = useState<boolean>(false);
  const [razorpayVerified, setRazorpayVerified] = useState<boolean>(false);
  const [liveTrackingNumber, setLiveTrackingNumber] = useState<string>('');
  const [gatewayConfig, setGatewayConfig] = useState<{ razorpayEnabled: boolean; keyId: string | null }>({
    razorpayEnabled: false,
    keyId: null
  });
  const [isLaunchingGateway, setIsLaunchingGateway] = useState<boolean>(false);

  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedAcctNo, setCopiedAcctNo] = useState(false);
  const [copiedIfsc, setCopiedIfsc] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState(false);
  const [copiedTxn, setCopiedTxn] = useState(false);

  // Delivery address fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [pin, setPin] = useState('');

  // Check if signed Payment Gateway (Razorpay) is configured on server
  useEffect(() => {
    if (activeModal !== 'checkout') return;
    fetch('/api/payments/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { razorpayEnabled?: boolean; keyId?: string | null } | null) => {
        if (data && typeof data.razorpayEnabled === 'boolean') {
          setGatewayConfig({
            razorpayEnabled: data.razorpayEnabled,
            keyId: data.keyId || null
          });
        }
      })
      .catch(() => {
        // Fallback smoothly to Direct UPI / Net Banking
      });
  }, [activeModal]);

  // Gateway connection animation & session countdown
  useEffect(() => {
    if (step !== 'gateway') return;
    setGatewayPhase('connecting');
    setGatewaySecondsLeft(600);

    const connectTimer = window.setTimeout(() => {
      setGatewayPhase('portal');
    }, 950);

    const countdownInterval = window.setInterval(() => {
      setGatewaySecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      window.clearTimeout(connectTimer);
      window.clearInterval(countdownInterval);
    };
  }, [step]);

  // Subscribe live to Firestore /orderStatus/{orderId} once order is submitted
  useEffect(() => {
    if (!createdOrder?.id) return;

    setLiveStatus(createdOrder.status);
    setLiveVerified(createdOrder.status !== 'Processing');
    setLiveTrackingNumber(createdOrder.trackingNumber || '');

    const unsub = onSnapshot(
      doc(db, 'orderStatus', createdOrder.id),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as {
            status?: Order['status'];
            paymentVerified?: boolean;
            trackingNumber?: string;
          };
          if (data.status) setLiveStatus(data.status);
          if (typeof data.paymentVerified === 'boolean') {
            setLiveVerified(data.paymentVerified);
          }
          if (data.trackingNumber) {
            setLiveTrackingNumber(data.trackingNumber);
          }
        }
      },
      () => {
        // Fallback smoothly to context state
      }
    );

    return () => unsub();
  }, [createdOrder?.id, createdOrder?.status, createdOrder?.trackingNumber]);

  // Sync live with ShopContext orders array
  useEffect(() => {
    if (!createdOrder?.id) return;
    const matched = orders.find((o) => o.id === createdOrder.id);
    if (matched) {
      setLiveStatus(matched.status);
      setLiveVerified(matched.status !== 'Processing');
      if (matched.trackingNumber) {
        setLiveTrackingNumber(matched.trackingNumber);
      }
    }
  }, [orders, createdOrder?.id]);

  if (activeModal !== 'checkout') return null;

  const selectedBank = INDIAN_BANKS.find((b) => b.id === selectedBankId) || INDIAN_BANKS[0];
  const selectedOption = PAYMENT_OPTIONS.find((o) => o.id === selectedPayment) || PAYMENT_OPTIONS[0];
  const itemCount = cart.reduce((sum, it) => sum + it.quantity, 0);

  const isAndroidDevice =
    typeof navigator !== 'undefined' &&
    (/Android/i.test(navigator.userAgent) ||
      (/Linux/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1));
  const isIosTouchDevice =
    typeof navigator !== 'undefined' &&
    (/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
  const isMobileDevice =
    typeof navigator !== 'undefined' &&
    (isAndroidDevice ||
      isIosTouchDevice ||
      (/Mobile/i.test(navigator.userAgent) && !/Windows|Mac OS X/i.test(navigator.userAgent)));

  const formatUpiAmount = (amountInr: number): string => {
    const clean = Math.max(1, Number(amountInr) || 1);
    return Number.isInteger(clean) ? String(clean) : clean.toFixed(2);
  };

  // Native UPI Deep Link builder: upi://pay?pa=banayaenterprise100-1@oksbi&pn=BanayaEnterprise&am=TOTAL_AMOUNT&cu=INR
  const buildNativeUpiUrl = (amountInr?: number): string =>
    amountInr !== undefined
      ? `upi://pay?pa=${BANAYA_UPI_ID}&pn=BanayaEnterprise&am=${formatUpiAmount(amountInr)}&cu=INR`
      : `upi://pay?pa=${BANAYA_UPI_ID}&pn=BanayaEnterprise&cu=INR`;

  const buildUpiIntentMap = (
    amountInr: number
  ): Record<Exclude<PaymentOptionId, 'netbanking'>, string> => {
    const params = `pa=${BANAYA_UPI_ID}&pn=BanayaEnterprise&am=${formatUpiAmount(amountInr)}&cu=INR`;
    return {
      gpay: isAndroidDevice
        ? `intent://upi/pay?${params}#Intent;scheme=tez;package=com.google.android.apps.nbu.paisa.user;end;`
        : `tez://upi/pay?${params}`,
      phonepe: isAndroidDevice
        ? `intent://pay?${params}#Intent;scheme=upi;package=com.phonepe.app;end;`
        : `phonepe://pay?${params}`,
      paytm: isAndroidDevice
        ? `intent://pay?${params}#Intent;scheme=upi;package=net.one97.paytm;end;`
        : `paytmmp://pay?${params}`,
      upi: `upi://pay?${params}`
    };
  };

  // Manual-amount deep links without pre-locked amount (avoids browser am= limit blocks inside GPay & PhonePe)
  const safeBaseParams = `pa=${BANAYA_UPI_ID}&pn=BanayaEnterprise&cu=INR`;
  const appDirectOpenMap: Record<Exclude<PaymentOptionId, 'netbanking'>, string> = {
    gpay: isAndroidDevice
      ? `intent://upi/pay?${safeBaseParams}#Intent;scheme=tez;package=com.google.android.apps.nbu.paisa.user;end;`
      : `tez://upi/pay?${safeBaseParams}`,
    phonepe: isAndroidDevice
      ? `intent://pay?${safeBaseParams}#Intent;scheme=upi;package=com.phonepe.app;end;`
      : `phonepe://pay?${safeBaseParams}`,
    paytm: isAndroidDevice
      ? `intent://pay?${safeBaseParams}#Intent;scheme=upi;package=net.one97.paytm;end;`
      : `paytmmp://pay?${safeBaseParams}`,
    upi: buildNativeUpiUrl()
  };

  const canSplitPayment = cartTotal >= 20;
  const effectiveSplitFirst = canSplitPayment
    ? Math.min(Math.max(1, splitFirstAmount || Math.ceil(cartTotal / 2)), cartTotal - 1)
    : cartTotal;
  const effectiveSplitSecond = Math.max(1, cartTotal - effectiveSplitFirst);

  const upiIntentMap = buildUpiIntentMap(cartTotal);
  const splitPart1Links = buildUpiIntentMap(effectiveSplitFirst);
  const splitPart2Links = buildUpiIntentMap(effectiveSplitSecond);

  const handleLaunchPaymentApp = (
    _e: React.MouseEvent<HTMLAnchorElement>,
    appLabel: string
  ) => {
    void copyTextSafely(BANAYA_UPI_ID);
    setCopiedVpa(true);
    window.setTimeout(() => setCopiedVpa(false), 3000);

    if (!isMobileDevice) {
      showToast(
        `Opening ${appLabel} UPI Link`,
        `UPI ID (${BANAYA_UPI_ID}) copied! Complete ₹${cartTotal.toLocaleString('en-IN')} in your UPI app or use Net Banking on desktop.`,
        'info'
      );
      return;
    }

    showToast(
      `Opening ${appLabel}...`,
      `Authorizing ₹${cartTotal.toLocaleString('en-IN')} to Banaya Enterprise (${BANAYA_UPI_ID}).`,
      'info'
    );
  };

  const activeOrderDisplay: Order | null = createdOrder
    ? {
        ...createdOrder,
        status: razorpayVerified && liveStatus === 'Processing' ? 'Confirmed' : liveStatus,
        trackingNumber: liveTrackingNumber || createdOrder.trackingNumber
      }
    : null;

  const isPaymentVerified = liveVerified || razorpayVerified;

  const resetCheckoutState = () => {
    setStep('details');
    setGatewayPhase('connecting');
    setGatewaySessionId('');
    setSelectedPayment('upi');
    setSelectedBankId('sbi');
    setCustomerUpiId('');
    setTransactionIdInput('');
    setSplitMode(false);
    setSplitFirstAmount(0);
    setSplitSecondTxnId('');
    setShowBankLimitsGuide(false);
    setPaymentConfirmedCheck(false);
    setCreatedOrder(null);
    setLiveStatus('Processing');
    setLiveVerified(false);
    setRazorpayVerified(false);
    setLiveTrackingNumber('');
    setIsLaunchingGateway(false);
  };

  const handleCloseModal = () => {
    setActiveModal(null);
    resetCheckoutState();
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('Empty Bag', 'Your shopping bag is empty. Add items before checking out.', 'warning');
      return;
    }

    const cleanPhoneDigits = phone.replace(/[^\d]/g, '');
    const cleanPinDigits = pin.replace(/[^\d]/g, '');
    if (
      !name.trim() ||
      cleanPhoneDigits.length < 10 ||
      !address.trim() ||
      !city.trim() ||
      cleanPinDigits.length < 6
    ) {
      showToast(
        'Check Delivery Details',
        'Please enter full name, 10-digit mobile number, street address, city, and 6-digit PIN code.',
        'warning'
      );
      return;
    }

    setStep('payment');
  };

  // Direct Pay ₹{cartTotal} trigger (Flipkart / Amazon style — Zero QR code)
  const handleInitiateDirectPay = async () => {
    if (cart.length === 0) {
      showToast('Empty Bag', 'Your shopping bag is empty.', 'warning');
      return;
    }

    if (selectedPayment === 'upi' && customerUpiId.trim()) {
      const cleanUpi = customerUpiId.trim();
      if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(cleanUpi)) {
        showToast(
          'Check UPI ID Format',
          'Please enter a valid UPI ID (for example: yourname@oksbi or yourname@ybl), or leave blank to open your UPI app directly.',
          'warning'
        );
        return;
      }
    }

    // 1) If Signed Razorpay Gateway is configured, open NPCI-signed checkout directly (zero bank limit block)
    if (gatewayConfig.razorpayEnabled && gatewayConfig.keyId) {
      setIsLaunchingGateway(true);
      try {
        const RazorpayCtor = await loadRazorpayCheckoutScript();
        if (!RazorpayCtor) {
          throw new Error('Could not load Razorpay payment script');
        }

        const orderRes = await fetch('/api/payments/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountInr: cartTotal,
            receipt: `BNY-${Date.now().toString().slice(-6)}`,
            customerName: name.trim(),
            phone: phone.trim(),
            email: email.trim()
          })
        });

        const orderData = (await orderRes.json()) as {
          orderId?: string;
          amount?: number;
          currency?: string;
          keyId?: string;
          error?: string;
        };

        if (!orderRes.ok || !orderData.orderId) {
          throw new Error(orderData.error || 'Could not initialize gateway payment');
        }

        const rzp = new RazorpayCtor({
          key: orderData.keyId || gatewayConfig.keyId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'Banaya Enterprise',
          description: `Order Payment (₹${cartTotal.toLocaleString('en-IN')})`,
          order_id: orderData.orderId,
          prefill: {
            name: name.trim(),
            email: email.trim(),
            contact: phone.trim(),
            method: selectedPayment === 'netbanking' ? 'netbanking' : 'upi',
            ...(selectedPayment === 'upi' && customerUpiId.trim()
              ? { vpa: customerUpiId.trim() }
              : {})
          },
          notes: {
            store: 'Banaya Enterprise',
            selected_option: selectedOption.label
          },
          theme: { color: '#064E3B' },
          handler: async (response: RazorpaySuccessPayload) => {
            try {
              const verifyRes = await fetch('/api/payments/razorpay/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(response)
              });
              const verifyData = (await verifyRes.json()) as {
                verified?: boolean;
                paymentId?: string;
              };

              const verifiedOk = Boolean(verifyRes.ok && verifyData.verified);
              const paymentMethodLabel = `${
                selectedPayment === 'netbanking' ? `Net Banking (${selectedBank.name})` : selectedOption.label
              } (Gateway Verified)`;

              const order = placeOrder({
                customerName: name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                shippingAddress: `${address.trim()}, ${stateName.trim() || 'India'}`,
                city: city.trim(),
                postalCode: pin.trim(),
                paymentMethod: paymentMethodLabel.slice(0, 155),
                transactionId: response.razorpay_payment_id,
                bankRef: response.razorpay_order_id
              });

              setCreatedOrder(order);
              setRazorpayVerified(verifiedOk);
              setLiveStatus(verifiedOk ? 'Confirmed' : 'Processing');
              setLiveVerified(verifiedOk);
              setLiveTrackingNumber(order.trackingNumber);
              setStep('pending');
              showToast(
                verifiedOk ? 'Payment Verified & Order Confirmed' : 'Payment Submitted',
                `Payment ${response.razorpay_payment_id} for ₹${cartTotal.toLocaleString('en-IN')} completed.`,
                'success'
              );
            } catch {
              showToast(
                'Verification Pending',
                'Payment received. Returning to order verification summary.',
                'info'
              );
            }
          }
        });

        rzp.on('payment.failed', (errResp) => {
          showToast(
            'Payment Incomplete',
            errResp?.error?.description || 'Payment was cancelled or declined. You can retry safely.',
            'warning'
          );
        });

        rzp.open();
        setIsLaunchingGateway(false);
        return;
      } catch (err) {
        setIsLaunchingGateway(false);
        showToast(
          'Switching to Direct App Mode',
          (err as Error)?.message || 'Opening direct payment app.',
          'info'
        );
      }
    }

    // 2) Direct Native UPI Deep Link (upi://pay?pa=...&pn=BanayaEnterprise&am=...&cu=INR)
    if (selectedPayment !== 'netbanking') {
      try {
        window.location.href = upiIntentMap[selectedPayment];
      } catch {
        // Gateway screen below also provides direct native upi:// launch links
      }
    }

    const sessionId = `GW-${Date.now().toString().slice(-8)}`;
    setGatewaySessionId(sessionId);
    setTransactionIdInput('');
    setSplitSecondTxnId('');
    setSplitMode(false);
    setSplitFirstAmount(cartTotal >= 20 ? Math.ceil(cartTotal / 2) : cartTotal);
    setPaymentConfirmedCheck(false);
    setStep('gateway');
  };

  const handleOpenGatewayForDesktopQr = () => {
    const sessionId = `GW-${Date.now().toString().slice(-8)}`;
    setGatewaySessionId(sessionId);
    setTransactionIdInput('');
    setSplitSecondTxnId('');
    setSplitMode(false);
    setSplitFirstAmount(cartTotal >= 20 ? Math.ceil(cartTotal / 2) : cartTotal);
    setPaymentConfirmedCheck(false);
    setStep('gateway');
  };

  const handleDirectAnchorStepTransition = (
    e: React.MouseEvent<HTMLAnchorElement>,
    appLabel: string
  ) => {
    if (selectedPayment === 'upi' && customerUpiId.trim()) {
      const cleanUpi = customerUpiId.trim();
      if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(cleanUpi)) {
        e.preventDefault();
        showToast(
          'Check UPI ID Format',
          'Please enter a valid UPI ID (for example: yourname@oksbi or yourname@ybl), or leave blank to open your UPI app directly.',
          'warning'
        );
        return;
      }
    }

    void copyTextSafely(BANAYA_UPI_ID);
    setCopiedVpa(true);
    window.setTimeout(() => setCopiedVpa(false), 3000);

    showToast(
      `Opening ${appLabel}...`,
      `Authorizing ₹${cartTotal.toLocaleString('en-IN')} to Banaya Enterprise (${BANAYA_UPI_ID}).`,
      'info'
    );

    const sessionId = `GW-${Date.now().toString().slice(-8)}`;
    setGatewaySessionId(sessionId);
    setTransactionIdInput('');
    setSplitSecondTxnId('');
    setSplitMode(false);
    setSplitFirstAmount(cartTotal >= 20 ? Math.ceil(cartTotal / 2) : cartTotal);
    setPaymentConfirmedCheck(false);
    window.setTimeout(() => {
      setStep('gateway');
    }, 200);
  };

  // Complete Payment inside the Net Banking / UPI Gateway & Return to Store Page
  const handleCompleteGatewayAndReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('Empty Bag', 'Your shopping bag is empty.', 'warning');
      return;
    }

    const cleanedTxn = transactionIdInput.trim().replace(/\s+/g, '');
    if (cleanedTxn.length < 6 || !/^[a-zA-Z0-9_/-]+$/.test(cleanedTxn)) {
      showToast(
        'Transaction Reference Required',
        splitMode
          ? `Please enter the Part 1 (₹${effectiveSplitFirst.toLocaleString('en-IN')}) UTR / Reference Number (min 6 characters).`
          : selectedPayment === 'netbanking'
            ? `Please enter the ${selectedBank.shortName} Bank Reference / UTR Number (minimum 6 characters).`
            : 'Please enter the UPI Transaction ID / UTR Number (minimum 6 characters) after completing payment.',
        'warning'
      );
      return;
    }

    let combinedTxnRef = cleanedTxn.slice(0, 115);
    if (splitMode && canSplitPayment) {
      const cleanedTxn2 = splitSecondTxnId.trim().replace(/\s+/g, '');
      if (cleanedTxn2.length < 6 || !/^[a-zA-Z0-9_/-]+$/.test(cleanedTxn2)) {
        showToast(
          'Part 2 UTR Required',
          `Please enter the Part 2 (₹${effectiveSplitSecond.toLocaleString('en-IN')}) UTR / Reference Number after completing both smaller transfers.`,
          'warning'
        );
        return;
      }
      combinedTxnRef = `${cleanedTxn} + ${cleanedTxn2}`.slice(0, 115);
    }

    if (!paymentConfirmedCheck) {
      showToast(
        'Confirm Completed Payment',
        'Please tick the checkbox confirming your payment was completed before returning to Banaya Enterprise.',
        'warning'
      );
      return;
    }

    const baseMethodLabel =
      selectedPayment === 'netbanking'
        ? `Net Banking (${selectedBank.name})`
        : selectedPayment === 'upi'
          ? customerUpiId.trim()
            ? `UPI (${customerUpiId.trim()})`
            : `UPI (${BANAYA_UPI_ID})`
          : `${selectedOption.label} (${BANAYA_UPI_ID})`;

    const paymentMethodLabel = (
      splitMode && canSplitPayment
        ? `${baseMethodLabel} [Split: ₹${effectiveSplitFirst}+₹${effectiveSplitSecond}]`
        : baseMethodLabel
    ).slice(0, 155);

    const order = placeOrder({
      customerName: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      shippingAddress: `${address.trim()}, ${stateName.trim() || 'India'}`,
      city: city.trim(),
      postalCode: pin.trim(),
      paymentMethod: paymentMethodLabel,
      transactionId: combinedTxnRef,
      bankRef: combinedTxnRef
    });

    setCreatedOrder(order);
    setLiveStatus('Processing');
    setLiveVerified(false);
    setLiveTrackingNumber(order.trackingNumber);
    setStep('pending');

    showToast(
      'Returned to Banaya Enterprise',
      `Order ${order.id} submitted with reference ${combinedTxnRef}. Payment verification is in progress.`,
      'info'
    );
  };

  const handleCopyValue = async (
    value: string,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    label: string
  ) => {
    const ok = await copyTextSafely(value);
    if (ok) {
      setter(true);
      showToast(`${label} Copied`, `${value} copied to clipboard.`, 'info');
      window.setTimeout(() => setter(false), 2500);
    } else {
      showToast(label, value, 'info');
    }
  };

  const popularBanks = INDIAN_BANKS.filter((b) => b.popular);
  const otherBanks = INDIAN_BANKS.filter((b) => !b.popular);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-start sm:items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      <div
        id="checkout-modal-container"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#F1F3F6] rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto border border-slate-200 shadow-2xl relative my-auto"
      >
        {/* Top Checkout Header Bar */}
        <div
          className={`px-4 sm:px-6 py-3.5 sticky top-0 z-30 flex items-center justify-between gap-3 border-b ${
            step === 'gateway'
              ? 'bg-slate-900 text-white border-slate-800'
              : 'bg-[#064E3B] text-white border-emerald-900/40'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white p-1 shrink-0 flex items-center justify-center">
              {step === 'gateway' && selectedPayment === 'netbanking' ? (
                <Landmark className="w-5 h-5 text-slate-900" />
              ) : (
                <img
                  src="/images/banaya_logo.png"
                  alt="Banaya Enterprises"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-base sm:text-lg font-bold leading-tight truncate">
                {step === 'details' && 'Secure Checkout — Delivery Address'}
                {step === 'payment' && 'Payments — Banaya Enterprise'}
                {step === 'gateway' &&
                  (selectedPayment === 'netbanking'
                    ? `${selectedBank.name} — Internet Banking Gateway`
                    : `${selectedOption.label} — Secure Payment Gateway`)}
                {step === 'pending' &&
                  (isPaymentVerified ? 'Payment Verified & Order Confirmed' : 'Payment Verification Pending')}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-200/90 truncate">
                {step === 'details' && 'Step 1 · Enter delivery address'}
                {step === 'payment' && `Step 2 · Choose Net Banking or UPI · Total ₹${cartTotal.toLocaleString('en-IN')}`}
                {step === 'gateway' &&
                  `Merchant: Banaya Enterprise · Amount: ₹${cartTotal.toLocaleString('en-IN')} · Complete payment to return`}
                {step === 'pending' &&
                  (isPaymentVerified
                    ? `Order ${activeOrderDisplay?.id} confirmed for dispatch`
                    : `Order ${activeOrderDisplay?.id} · Awaiting merchant verification`)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-100 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-300" /> 100% Secure
            </span>
            <button
              id="close-checkout-btn"
              type="button"
              onClick={handleCloseModal}
              aria-label="Close checkout"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Clean Progress Strip (Hidden during full-focus Bank Gateway redirect screen) */}
        {step !== 'gateway' && (
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5">
            <div className="flex items-center justify-between max-w-2xl mx-auto text-xs font-medium">
              <div
                className={`flex items-center gap-2 ${
                  step === 'details' ? 'text-[#064E3B] font-semibold' : 'text-emerald-700'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    step === 'details' ? 'bg-[#064E3B] text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {step !== 'details' ? <Check className="w-3 h-3" /> : '1'}
                </span>
                <span>Delivery Address</span>
              </div>

              <div className="flex-1 h-px bg-slate-200 mx-2 sm:mx-4" />

              <div
                className={`flex items-center gap-2 ${
                  step === 'payment'
                    ? 'text-[#064E3B] font-semibold'
                    : step === 'pending'
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    step === 'payment'
                      ? 'bg-[#064E3B] text-white'
                      : step === 'pending'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step === 'pending' ? <Check className="w-3 h-3" /> : '2'}
                </span>
                <span>Payment Options</span>
              </div>

              <div className="flex-1 h-px bg-slate-200 mx-2 sm:mx-4" />

              <div
                className={`flex items-center gap-2 ${
                  step === 'pending'
                    ? isPaymentVerified
                      ? 'text-emerald-700 font-semibold'
                      : 'text-amber-700 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                    step === 'pending'
                      ? isPaymentVerified
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step === 'pending' && isPaymentVerified ? <Check className="w-3 h-3" /> : '3'}
                </span>
                <span>{isPaymentVerified ? 'Confirmed' : 'Verification'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ==================== STEP 1: DELIVERY ADDRESS & SUMMARY ==================== */}
        {step === 'details' && (
          <form onSubmit={handleProceedToPayment} className="p-3 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
              {/* Left Column: Address Form + Order Items */}
              <div className="lg:col-span-8 space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="bg-[#064E3B] text-white px-4 py-3 flex items-center gap-2.5 text-sm font-semibold">
                    <span className="w-5 h-5 rounded bg-white text-[#064E3B] text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <span>DELIVERY ADDRESS</span>
                  </div>

                  <div className="p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label htmlFor="checkout-name" className="block text-xs font-medium text-slate-700 mb-1">
                          Full Name *
                        </label>
                        <input
                          id="checkout-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter recipient full name"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div>
                        <label htmlFor="checkout-phone" className="block text-xs font-medium text-slate-700 mb-1">
                          10-Digit Mobile / WhatsApp Number *
                        </label>
                        <input
                          id="checkout-phone"
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="checkout-email" className="block text-xs font-medium text-slate-700 mb-1">
                          Email Address <span className="text-slate-400 font-normal">(for order updates)</span>
                        </label>
                        <input
                          id="checkout-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="checkout-address" className="block text-xs font-medium text-slate-700 mb-1">
                          Address (House No., Building, Street, Area) *
                        </label>
                        <input
                          id="checkout-address"
                          type="text"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Door / Flat No., Street Name, Landmark"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div>
                        <label htmlFor="checkout-city" className="block text-xs font-medium text-slate-700 mb-1">
                          City / District *
                        </label>
                        <input
                          id="checkout-city"
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="City"
                          className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="checkout-state" className="block text-xs font-medium text-slate-700 mb-1">
                            State *
                          </label>
                          <input
                            id="checkout-state"
                            type="text"
                            required
                            value={stateName}
                            onChange={(e) => setStateName(e.target.value)}
                            placeholder="State"
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                          />
                        </div>
                        <div>
                          <label htmlFor="checkout-pin" className="block text-xs font-medium text-slate-700 mb-1">
                            PIN Code *
                          </label>
                          <input
                            id="checkout-pin"
                            type="text"
                            required
                            maxLength={6}
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="600001"
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Preview Box */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-sm font-semibold text-slate-800">
                    <span>ORDER SUMMARY ({itemCount} {itemCount === 1 ? 'ITEM' : 'ITEMS'})</span>
                    <span className="text-xs font-normal text-slate-500">Fresh batch dispatch</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {cart.map((item, idx) => {
                      const unitPrice = getEffectivePrice(item);
                      return (
                        <div
                          key={`${item.product.id}-${item.selectedWeight}-${idx}`}
                          className="p-3.5 flex items-center gap-3"
                        >
                          <img
                            src={item.product.image}
                            alt={item.product.name}
                            onLoad={handleProductImageLoad}
                            onError={(e) => handleProductImageError(e, item.product)}
                            className="w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 object-contain p-1 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-slate-900 truncate">{item.product.name}</h4>
                            <p className="text-xs text-slate-500">
                              Pack: {item.selectedWeight} &middot; Qty: {item.quantity}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">
                              ₹{(unitPrice * item.quantity).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Sticky Price Details Sidebar */}
              <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Price Details
                  </div>

                  <div className="p-4 space-y-3 text-sm">
                    <div className="flex justify-between text-slate-700">
                      <span>Price ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                      <span className="font-medium tabular-nums">₹{cartSubtotal.toLocaleString('en-IN')}</span>
                    </div>

                    {cartDiscount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Coupon Discount</span>
                        <span className="font-medium tabular-nums">−₹{cartDiscount.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-700">
                      <span>Delivery Charges</span>
                      {cartShipping === 0 ? (
                        <span className="text-emerald-700 font-semibold">FREE</span>
                      ) : (
                        <span className="font-medium tabular-nums">₹{cartShipping}</span>
                      )}
                    </div>

                    <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-baseline">
                      <span className="font-semibold text-slate-900">Total Payable</span>
                      <span className="text-xl font-bold text-slate-950 tabular-nums">
                        ₹{cartTotal.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <button
                      id="checkout-continue-payment-btn"
                      type="submit"
                      className="w-full mt-2 h-11 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                      <span>Continue to Payment</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className="text-[11px] text-slate-500 text-center pt-1">
                      Online Payment Only · Cash on Delivery not available
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* ==================== STEP 2: FLIPKART / AMAZON STYLE PAYMENT METHODS (NO QR CODE) ==================== */}
        {step === 'payment' && (
          <div className="p-3 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
              {/* Left Column: Address Recap Strip + 5 Payment Options */}
              <div className="lg:col-span-8 space-y-4">
                {/* Compact Delivery Summary Bar */}
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-xs min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        Deliver to: {name} &middot; {pin}
                      </div>
                      <p className="text-slate-500 truncate">
                        {address}, {city}, {stateName} &middot; {phone}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#064E3B] shrink-0 cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {/* Payment Options Accordion (Exact 5 Allowed Methods — Zero QR Code) */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="bg-[#064E3B] text-white px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-sm font-semibold">
                      <span className="w-5 h-5 rounded bg-white text-[#064E3B] text-xs font-bold flex items-center justify-center">
                        2
                      </span>
                      <span>PAYMENT OPTIONS</span>
                    </div>
                    <span className="text-xs text-emerald-100 font-medium tabular-nums">
                      Payable: ₹{cartTotal.toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-200">
                    {PAYMENT_OPTIONS.map((option) => {
                      const isSelected = selectedPayment === option.id;
                      return (
                        <div
                          key={option.id}
                          className={isSelected ? 'bg-[#F5FAFF]/70' : 'bg-white'}
                        >
                          {/* Radio Option Row */}
                          <button
                            type="button"
                            onClick={() => setSelectedPayment(option.id)}
                            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  isSelected ? 'border-[#064E3B]' : 'border-slate-300'
                                }`}
                              >
                                {isSelected && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-[#064E3B]" />
                                )}
                              </span>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {option.label}
                                  </span>
                                  {option.tag && (
                                    <span className="text-[11px] font-semibold text-emerald-700">
                                      &middot; {option.tag}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {option.subtitle}
                                </div>
                              </div>
                            </div>

                            <span className="shrink-0">
                              {option.id === 'netbanking' ? (
                                <Building2 className="w-4 h-4 text-[#064E3B]" />
                              ) : (
                                <Smartphone className="w-4 h-4 text-[#064E3B]" />
                              )}
                            </span>
                          </button>

                          {/* Expanded Payment Action Panel */}
                          {isSelected && (
                            <div className="px-4 pb-5 pt-3 sm:pl-11 border-t border-slate-100 space-y-4">
                              {option.id === 'netbanking' ? (
                                /* AMAZON / FLIPKART STYLE NET BANKING */
                                <div className="space-y-4">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700 mb-2">
                                      Popular Banks (Supports ₹5L – ₹10L · Zero UPI Bank Cap)
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                      {popularBanks.map((bank) => {
                                        const activeBank = selectedBankId === bank.id;
                                        return (
                                          <button
                                            key={bank.id}
                                            type="button"
                                            onClick={() => setSelectedBankId(bank.id)}
                                            className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                                              activeBank
                                                ? 'border-[#064E3B] bg-white ring-1 ring-[#064E3B]'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                            }`}
                                          >
                                            <span
                                              className={`w-7 h-7 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0 ${bank.accentClass}`}
                                            >
                                              {bank.code}
                                            </span>
                                            <span className="text-xs font-medium text-slate-900 truncate">
                                              {bank.shortName}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <label
                                      htmlFor="checkout-other-banks"
                                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                                    >
                                      Or Select Bank from List
                                    </label>
                                    <select
                                      id="checkout-other-banks"
                                      value={selectedBankId}
                                      onChange={(e) => setSelectedBankId(e.target.value)}
                                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-hidden focus:border-[#064E3B]"
                                    >
                                      <optgroup label="Popular Banks">
                                        {popularBanks.map((b) => (
                                          <option key={b.id} value={b.id}>
                                            {b.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                      <optgroup label="Other Indian Banks">
                                        {otherBanks.map((b) => (
                                          <option key={b.id} value={b.id}>
                                            {b.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    </select>
                                  </div>

                                  {/* Official Banaya Enterprise Beneficiary Account Details for IMPS / NEFT / RTGS */}
                                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 text-xs">
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                      <span className="font-semibold text-slate-900">
                                        Beneficiary Account (For {selectedBank.shortName} IMPS / NEFT / RTGS)
                                      </span>
                                      <span className="text-[11px] font-semibold text-emerald-700">
                                        {BANAYA_BANK_DETAILS.bankName}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                      <div className="bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-200 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <span className="text-[10px] text-slate-500 block">Account Number</span>
                                          <strong className="font-mono text-slate-900 text-xs sm:text-sm">
                                            {BANAYA_BANK_DETAILS.accountNumber}
                                          </strong>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleCopyValue(
                                              BANAYA_BANK_DETAILS.accountNumber,
                                              setCopiedAcctNo,
                                              'Account Number'
                                            )
                                          }
                                          className="h-7 px-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                        >
                                          {copiedAcctNo ? (
                                            <Check className="w-3 h-3 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                          <span>Copy</span>
                                        </button>
                                      </div>

                                      <div className="bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-200 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <span className="text-[10px] text-slate-500 block">IFSC Code</span>
                                          <strong className="font-mono text-slate-900 text-xs sm:text-sm">
                                            {BANAYA_BANK_DETAILS.ifscCode}
                                          </strong>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleCopyValue(
                                              BANAYA_BANK_DETAILS.ifscCode,
                                              setCopiedIfsc,
                                              'IFSC Code'
                                            )
                                          }
                                          className="h-7 px-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-medium text-slate-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                                        >
                                          {copiedIfsc ? (
                                            <Check className="w-3 h-3 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                          <span>Copy</span>
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                                      <span>
                                        Beneficiary: <strong className="text-slate-800">{BANAYA_BANK_DETAILS.accountHolder}</strong>
                                      </span>
                                      <span>
                                        Branch: <strong className="text-slate-800">{BANAYA_BANK_DETAILS.branch}</strong>
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                                    <button
                                      id="pay-netbanking-btn"
                                      type="button"
                                      disabled={isLaunchingGateway}
                                      onClick={() => void handleInitiateDirectPay()}
                                      className="w-full sm:w-auto min-w-[230px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      {isLaunchingGateway ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <>
                                          <span>Pay ₹{cartTotal.toLocaleString('en-IN')} via {selectedBank.shortName}</span>
                                          <ArrowRight className="w-4 h-4" />
                                        </>
                                      )}
                                    </button>
                                    <span className="text-[11px] text-slate-500">
                                      Redirects to <strong>{selectedBank.shortName}</strong> Internet Banking to complete payment.
                                    </span>
                                  </div>
                                </div>
                              ) : !gatewayConfig.razorpayEnabled && !isMobileDevice ? (
                                /* FLIPKART DESKTOP UPI SCAN & PAY QR CODE CARD (ONLY SHOWN ON DESKTOP; MOBILE LAUNCHES DIRECT APP) */
                                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
                                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                                    <div className="shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-3 flex flex-col items-center gap-2">
                                      <img
                                        src={BANAYA_UPI_QR_IMAGE}
                                        alt="Banaya Enterprise UPI QR Code"
                                        className="w-44 h-auto rounded-lg object-contain bg-white border border-slate-200"
                                      />
                                      <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
                                        <QrCode className="w-3.5 h-3.5 text-[#064E3B]" />
                                        Scan with {option.id === 'upi' ? 'any UPI App' : option.label}
                                      </span>
                                    </div>

                                    <div className="flex-1 space-y-3 text-xs w-full">
                                      <div>
                                        <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                                          Scan &amp; Pay on Desktop ({option.label})
                                        </div>
                                        <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                                          Pay{' '}
                                          <span className="tabular-nums text-[#064E3B]">
                                            ₹{cartTotal.toLocaleString('en-IN')}
                                          </span>{' '}
                                          to Banaya Enterprise
                                        </h4>
                                      </div>

                                      <ol className="space-y-1.5 text-slate-600 list-decimal list-inside">
                                        <li>
                                          Open <strong>{option.id === 'upi' ? 'Google Pay, PhonePe, Paytm or WhatsApp Pay' : option.label}</strong> on your mobile phone and tap <strong>Scan any QR</strong>.
                                        </li>
                                        <li>
                                          Enter exact amount{' '}
                                          <strong className="text-slate-900 tabular-nums">
                                            ₹{cartTotal.toLocaleString('en-IN')}
                                          </strong>{' '}
                                          and complete payment with your UPI PIN.
                                        </li>
                                        <li>
                                          Click below to enter your 12-digit UTR / Transaction ID for instant order verification.
                                        </li>
                                      </ol>

                                      <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => void handleCopyValue(BANAYA_UPI_ID, setCopiedVpa, 'UPI ID')}
                                          className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <span>{BANAYA_UPI_ID}</span>
                                          {copiedVpa ? (
                                            <Check className="w-3 h-3 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-3 h-3 text-slate-500" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleCopyValue(String(cartTotal), setCopiedAmount, 'Amount')}
                                          className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <span>Amount: ₹{cartTotal.toLocaleString('en-IN')}</span>
                                          {copiedAmount ? (
                                            <Check className="w-3 h-3 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-3 h-3 text-slate-500" />
                                          )}
                                        </button>
                                      </div>

                                      <button
                                        id={`pay-${option.id}-btn`}
                                        type="button"
                                        onClick={handleOpenGatewayForDesktopQr}
                                        className="w-full sm:w-auto min-w-[250px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                      >
                                        <span>I Paid ₹{cartTotal.toLocaleString('en-IN')} — Submit UTR ID</span>
                                        <ArrowRight className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : option.id === 'upi' ? (
                                /* MOBILE DIRECT UPI PAY (NO QR CODE ON MOBILE) */
                                <div className="space-y-3 max-w-md">
                                  <div>
                                    <label
                                      htmlFor="checkout-upi-id"
                                      className="block text-xs font-semibold text-slate-700 mb-1"
                                    >
                                      Enter your UPI ID
                                    </label>
                                    <input
                                      id="checkout-upi-id"
                                      type="text"
                                      value={customerUpiId}
                                      onChange={(e) => setCustomerUpiId(e.target.value)}
                                      placeholder="yourname@oksbi or yourname@ybl"
                                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1">
                                      Clicking Pay opens your UPI app directly with ₹{cartTotal.toLocaleString('en-IN')} ready.
                                    </p>
                                  </div>

                                  {!gatewayConfig.razorpayEnabled ? (
                                    <a
                                      id="pay-upi-btn"
                                      href={upiIntentMap.upi}
                                      onClick={(e) => handleDirectAnchorStepTransition(e, 'UPI App')}
                                      className="w-full sm:w-auto sm:inline-flex min-w-[230px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      <span>Pay ₹{cartTotal.toLocaleString('en-IN')} via UPI</span>
                                      <ArrowRight className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <button
                                      id="pay-upi-btn"
                                      type="button"
                                      disabled={isLaunchingGateway}
                                      onClick={() => void handleInitiateDirectPay()}
                                      className="w-full sm:w-auto min-w-[230px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      {isLaunchingGateway ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <>
                                          <span>Pay ₹{cartTotal.toLocaleString('en-IN')} via UPI</span>
                                          <ArrowRight className="w-4 h-4" />
                                        </>
                                      )}
                                    </button>
                                  )}
                                  <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                                    <span>
                                      We never ask for your UPI PIN here. Your UPI app shows an NPCI safety reminder (&ldquo;Never enter your UPI PIN to receive money&rdquo;) because PIN is only for <strong>paying</strong> your order amount to <strong>Banaya Enterprise</strong>.
                                    </span>
                                  </p>
                                </div>
                              ) : (
                                /* MOBILE DIRECT GOOGLE PAY / PHONEPE / PAYTM PAY (NO QR CODE ON MOBILE) */
                                <div className="space-y-3">
                                  <p className="text-xs text-slate-600">
                                    Clicking Pay opens <strong>{option.label}</strong> directly with{' '}
                                    <strong className="text-slate-900 tabular-nums">
                                      ₹{cartTotal.toLocaleString('en-IN')}
                                    </strong>{' '}
                                    pre-filled to <strong>Banaya Enterprise</strong>. After paying, you return to the order confirmation screen.
                                  </p>
                                  {!gatewayConfig.razorpayEnabled ? (
                                    <a
                                      id={`pay-${option.id}-btn`}
                                      href={upiIntentMap[option.id]}
                                      onClick={(e) => handleDirectAnchorStepTransition(e, option.label)}
                                      className="w-full sm:w-auto sm:inline-flex min-w-[240px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      <span>Pay ₹{cartTotal.toLocaleString('en-IN')} with {option.label}</span>
                                      <ArrowRight className="w-4 h-4" />
                                    </a>
                                  ) : (
                                    <button
                                      id={`pay-${option.id}-btn`}
                                      type="button"
                                      disabled={isLaunchingGateway}
                                      onClick={() => void handleInitiateDirectPay()}
                                      className="w-full sm:w-auto min-w-[240px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      {isLaunchingGateway ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <>
                                          <span>Pay ₹{cartTotal.toLocaleString('en-IN')} with {option.label}</span>
                                          <ArrowRight className="w-4 h-4" />
                                        </>
                                      )}
                                    </button>
                                  )}
                                  <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                                    <span>
                                      We never ask for your UPI PIN here. {option.label} shows an NPCI safety reminder (&ldquo;Never enter your UPI PIN to receive money&rdquo;) because PIN is only for <strong>paying</strong> your order amount to <strong>Banaya Enterprise</strong>.
                                    </span>
                                  </p>
                                  {(option.id === 'gpay' || option.id === 'phonepe') && !gatewayConfig.razorpayEnabled && (
                                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2 leading-relaxed">
                                      If {option.label} shows &ldquo;exceeded bank limit&rdquo;, your money is <strong>not debited</strong> &mdash; tap{' '}
                                      <button
                                        type="button"
                                        onClick={() => setSelectedPayment('upi')}
                                        className="font-semibold underline text-[#064E3B] cursor-pointer"
                                      >
                                        UPI Payment (WhatsApp Pay)
                                      </button>{' '}
                                      or{' '}
                                      <button
                                        type="button"
                                        onClick={() => setSelectedPayment('netbanking')}
                                        className="font-semibold underline text-[#064E3B] cursor-pointer"
                                      >
                                        Net Banking
                                      </button>{' '}
                                      to complete ₹{cartTotal.toLocaleString('en-IN')} instantly.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Sticky Price Details Sidebar */}
              <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Price Details
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    <div className="flex justify-between text-slate-700">
                      <span>Price ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                      <span className="font-medium tabular-nums">₹{cartSubtotal.toLocaleString('en-IN')}</span>
                    </div>

                    {cartDiscount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount</span>
                        <span className="font-medium tabular-nums">−₹{cartDiscount.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-700">
                      <span>Delivery Charges</span>
                      {cartShipping === 0 ? (
                        <span className="text-emerald-700 font-semibold">FREE</span>
                      ) : (
                        <span className="font-medium tabular-nums">₹{cartShipping}</span>
                      )}
                    </div>

                    <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-baseline">
                      <span className="font-semibold text-slate-900">Amount Payable</span>
                      <span className="text-xl font-bold text-slate-950 tabular-nums">
                        ₹{cartTotal.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Selected Method</span>
                        <span className="font-medium text-slate-800">
                          {selectedPayment === 'netbanking'
                            ? `${selectedBank.shortName} NetBanking`
                            : selectedOption.label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Merchant</span>
                        <span className="font-medium text-slate-800">Banaya Enterprise</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-xs text-slate-600 space-y-2">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Prepaid Checkout &amp; Bank Limit Guide</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Cash on Delivery is not available. If your UPI app shows &ldquo;exceeded bank limit&rdquo;, use <strong>Net Banking</strong> (up to ₹10L limit) or pay manually inside GPay/PhonePe using UPI ID <code className="font-mono text-slate-800">{BANAYA_UPI_ID}</code>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowBankLimitsGuide((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#064E3B] hover:underline cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>{showBankLimitsGuide ? 'Hide UPI Limit per Bank' : 'Check UPI Limit per Bank'}</span>
                    {showBankLimitsGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showBankLimitsGuide && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      {BANK_UPI_LIMITS.map((row) => (
                        <div key={row.bank} className="text-[11px] flex items-start justify-between gap-2 py-1 border-b border-slate-100 last:border-b-0">
                          <span className="font-medium text-slate-800">{row.bank}</span>
                          <span className="text-right text-slate-600 tabular-nums shrink-0">
                            {row.perTxnAndDailyUpi}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== STEP 3: DEDICATED INTERNET BANKING / UPI GATEWAY SCREEN ==================== */}
        {step === 'gateway' && (
          <div className="p-4 sm:p-8">
            {gatewayPhase === 'connecting' ? (
              /* Smooth Gateway Handoff Interstitial */
              <div className="max-w-lg mx-auto bg-white rounded-xl border border-slate-200 p-8 sm:p-10 text-center space-y-5 shadow-sm">
                <div className="w-14 h-14 rounded-full bg-slate-100 text-[#064E3B] flex items-center justify-center mx-auto">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-heading text-xl font-bold text-slate-900">
                    {selectedPayment === 'netbanking'
                      ? `Redirecting to ${selectedBank.name}...`
                      : `Connecting to ${selectedOption.label}...`}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Preparing secure payment gateway session for{' '}
                    <strong className="text-slate-900 tabular-nums">
                      ₹{cartTotal.toLocaleString('en-IN')}
                    </strong>{' '}
                    to Banaya Enterprise.
                  </p>
                </div>
                <div className="text-[11px] text-slate-400">
                  Do not refresh or close this window...
                </div>
              </div>
            ) : (
              /* Dedicated Full Gateway Screen — Only returns to store after completing payment */
              <form onSubmit={handleCompleteGatewayAndReturn} className="max-w-2xl mx-auto space-y-4">
                {/* Bank / Gateway Top Summary Strip */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-slate-900 text-white px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {selectedPayment === 'netbanking' ? (
                        <span
                          className={`px-2.5 py-1 rounded text-xs font-bold ${selectedBank.accentClass}`}
                        >
                          {selectedBank.code}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-bold">
                          UPI
                        </span>
                      )}
                      <div>
                        <div className="text-sm font-semibold">
                          {selectedPayment === 'netbanking'
                            ? `${selectedBank.name} NetBanking`
                            : `${selectedOption.label} Gateway`}
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono">
                          Session: {gatewaySessionId}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] text-slate-300">Session expires in</div>
                      <div className="text-sm font-mono font-bold text-amber-300 tabular-nums">
                        {formatTimer(gatewaySecondsLeft)}
                      </div>
                    </div>
                  </div>

                  {/* Merchant & Payable Amount Box */}
                  <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Merchant Name</span>
                      <strong className="text-sm text-slate-900">Banaya Enterprise</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Payable Amount</span>
                      <strong className="text-lg font-bold text-[#064E3B] tabular-nums">
                        ₹{cartTotal.toLocaleString('en-IN')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Merchant Payment ID</span>
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono font-semibold text-slate-900 truncate">
                          {BANAYA_UPI_ID}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleCopyValue(BANAYA_UPI_ID, setCopiedVpa, 'UPI ID')}
                          className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
                          title="Copy Merchant ID"
                        >
                          {copiedVpa ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Action Body */}
                  <div className="p-4 sm:p-6 space-y-5 bg-white">
                    {selectedPayment === 'netbanking' ? (
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-slate-900">
                              Step 1: Open {selectedBank.name} Internet Banking
                            </h4>
                            <p className="text-xs text-slate-600">
                              Sign in to your {selectedBank.shortName} NetBanking portal and complete an IMPS / NEFT transfer of{' '}
                              <strong className="text-slate-900 tabular-nums">
                                ₹{cartTotal.toLocaleString('en-IN')}
                              </strong>{' '}
                              to <strong>{BANAYA_BANK_DETAILS.accountHolder}</strong> ({BANAYA_BANK_DETAILS.bankName}). Supports up to ₹5L–₹10L with zero UPI app cap.
                            </p>
                          </div>

                          <a
                            href={selectedBank.portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-10 px-4 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                          >
                            <span>Open {selectedBank.shortName} NetBanking</span>
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white rounded-lg border border-slate-200 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-500 block">Account Number</span>
                              <strong className="font-mono text-slate-900">{BANAYA_BANK_DETAILS.accountNumber}</strong>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyValue(
                                  BANAYA_BANK_DETAILS.accountNumber,
                                  setCopiedAcctNo,
                                  'Account Number'
                                )
                              }
                              className="h-7 px-2 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer shrink-0"
                            >
                              {copiedAcctNo ? 'Copied' : 'Copy'}
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[10px] text-slate-500 block">IFSC Code</span>
                              <strong className="font-mono text-slate-900">{BANAYA_BANK_DETAILS.ifscCode}</strong>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyValue(
                                  BANAYA_BANK_DETAILS.ifscCode,
                                  setCopiedIfsc,
                                  'IFSC Code'
                                )
                              }
                              className="h-7 px-2 rounded border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer shrink-0"
                            >
                              {copiedIfsc ? 'Copied' : 'Copy'}
                            </button>
                          </div>

                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-500 block">Bank &amp; Branch</span>
                            <strong className="text-slate-900 truncate block">
                              IOB · {BANAYA_BANK_DETAILS.branch}
                            </strong>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor="gateway-bank-select" className="font-medium text-slate-700">
                              Change Bank:
                            </label>
                            <select
                              id="gateway-bank-select"
                              value={selectedBankId}
                              onChange={(e) => setSelectedBankId(e.target.value)}
                              className="h-8 px-2.5 rounded-md border border-slate-300 bg-white text-xs text-slate-900"
                            >
                              {INDIAN_BANKS.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPayment('gpay');
                              setStep('payment');
                            }}
                            className="text-[11px] font-semibold text-[#064E3B] hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>Prefer Google Pay / PhonePe / Paytm?</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Primary Single or Split Payment Launcher */}
                        {!isMobileDevice && !splitMode && (
                          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center gap-4">
                            <img
                              src={BANAYA_UPI_QR_IMAGE}
                              alt="Banaya Enterprise UPI QR Code"
                              className="w-36 h-auto rounded-lg object-contain bg-white border border-slate-200 shrink-0"
                            />
                            <div className="space-y-2 text-xs">
                              <div className="font-semibold text-slate-900 text-sm">
                                Step 1: Scan &amp; Pay ₹{cartTotal.toLocaleString('en-IN')} via {selectedOption.label}
                              </div>
                              <p className="text-slate-600 leading-relaxed">
                                Scan this QR code from your mobile phone ({selectedOption.label} / any UPI app), pay{' '}
                                <strong className="text-slate-900 tabular-nums">
                                  ₹{cartTotal.toLocaleString('en-IN')}
                                </strong>
                                , and enter your 12-digit UTR / Transaction ID below.
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleCopyValue(BANAYA_UPI_ID, setCopiedVpa, 'UPI ID')}
                                  className="h-7 px-2.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{BANAYA_UPI_ID}</span>
                                  {copiedVpa ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCopyValue(String(cartTotal), setCopiedAmount, 'Amount')}
                                  className="h-7 px-2.5 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-mono text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <span>₹{cartTotal.toLocaleString('en-IN')}</span>
                                  {copiedAmount ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {isMobileDevice && !splitMode ? (
                          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="space-y-1">
                                <h4 className="text-sm font-semibold text-slate-900">
                                  Step 1: Approve ₹{cartTotal.toLocaleString('en-IN')} in {selectedOption.label}
                                </h4>
                                <p className="text-xs text-slate-600">
                                  {selectedPayment === 'upi' && customerUpiId
                                    ? `Open your UPI app linked to ${customerUpiId} and authorize ₹${cartTotal.toLocaleString('en-IN')} to Banaya Enterprise.`
                                    : `Open ${selectedOption.label} on your phone with ₹${cartTotal.toLocaleString('en-IN')} pre-filled to Banaya Enterprise (${BANAYA_UPI_ID}).`}
                                </p>
                              </div>

                              <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                                <a
                                  href={upiIntentMap[selectedPayment]}
                                  onClick={(e) => handleLaunchPaymentApp(e, selectedOption.label)}
                                  className="h-10 px-4 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                                >
                                  <Smartphone className="w-4 h-4" />
                                  <span>Open {selectedOption.label} (₹{cartTotal.toLocaleString('en-IN')})</span>
                                </a>
                                <a
                                  href={appDirectOpenMap[selectedPayment]}
                                  onClick={(e) => handleLaunchPaymentApp(e, `${selectedOption.label} (Manual Amount)`)}
                                  className="h-9 px-3 rounded-lg border border-[#064E3B]/30 bg-white hover:bg-emerald-50 text-[#064E3B] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
                                >
                                  <span>Open {selectedOption.label} (Manual ₹{cartTotal.toLocaleString('en-IN')})</span>
                                </a>
                                {selectedPayment !== 'upi' && (
                                  <a
                                    href={buildNativeUpiUrl(cartTotal)}
                                    onClick={(e) => handleLaunchPaymentApp(e, 'UPI App / WhatsApp Pay')}
                                    className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
                                  >
                                    <span>Pay via WhatsApp Pay / Any UPI App (₹{cartTotal.toLocaleString('en-IN')})</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : splitMode ? (
                          /* 2-Part Split Payment Launcher for Bank Per-Txn Limits */
                          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Split className="w-4 h-4 text-[#064E3B]" />
                                <span>Split Payment into 2 Smaller UPI Transfers</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSplitMode(false)}
                                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                              >
                                Back to Single Payment
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                              <label htmlFor="split-part1-amt" className="font-medium text-slate-700">
                                Part 1 Amount (₹):
                              </label>
                              <input
                                id="split-part1-amt"
                                type="number"
                                min={1}
                                max={cartTotal - 1}
                                value={effectiveSplitFirst}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 1;
                                  setSplitFirstAmount(Math.min(Math.max(1, val), cartTotal - 1));
                                }}
                                className="w-24 h-8 px-2 rounded border border-slate-300 font-mono font-semibold text-slate-900"
                              />
                              <span className="text-slate-600">
                                + Part 2 Amount: <strong className="font-mono text-slate-900">₹{effectiveSplitSecond.toLocaleString('en-IN')}</strong>
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <a
                                href={splitPart1Links[selectedPayment]}
                                rel="noopener noreferrer"
                                onClick={(e) => handleLaunchPaymentApp(e, `${selectedOption.label} Part 1`)}
                                className="h-10 px-3 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                              >
                                <Smartphone className="w-4 h-4" />
                                <span>Pay Part 1: ₹{effectiveSplitFirst.toLocaleString('en-IN')}</span>
                              </a>
                              <a
                                href={splitPart2Links[selectedPayment]}
                                rel="noopener noreferrer"
                                onClick={(e) => handleLaunchPaymentApp(e, `${selectedOption.label} Part 2`)}
                                className="h-10 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                              >
                                <Smartphone className="w-4 h-4" />
                                <span>Pay Part 2: ₹{effectiveSplitSecond.toLocaleString('en-IN')}</span>
                              </a>
                            </div>
                          </div>
                        ) : null}

                        {/* Bank Limit Exceeded / UPI App Security Warning Recovery Box */}
                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3 text-xs">
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <h5 className="font-semibold text-amber-950">
                                {isMobileDevice
                                  ? 'Having Trouble with Google Pay / PhonePe? Pay via UPI ID or Net Banking'
                                  : 'Need an Alternative to QR Scan? Pay via UPI ID or IOB Bank Transfer'}
                              </h5>
                              <p className="text-amber-900 leading-relaxed">
                                {isMobileDevice
                                  ? 'Some banks or UPI apps block direct pre-filled browser links (showing "exceeded bank limit"), whereas WhatsApp Pay and manual in-app transfers work smoothly. Your account was not debited.'
                                  : 'If QR scanning shows a bank limit warning on your phone, you can transfer manually using our UPI ID or Indian Overseas Bank account below, or switch to Net Banking.'}
                              </p>
                            </div>
                          </div>

                          <div className="bg-white rounded-lg border border-amber-200/80 p-3 space-y-2.5">
                            <div className="font-semibold text-slate-900">
                              Option 1: Pay Directly inside {selectedOption.label} via UPI ID or Bank Transfer
                            </div>
                            <p className="text-[11px] text-slate-600">
                              Open {selectedOption.label} on your phone &rarr; choose <strong>Pay UPI ID</strong> or <strong>Bank Transfer</strong> &rarr; paste details below:
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCopyValue(BANAYA_UPI_ID, setCopiedVpa, 'UPI ID')}
                                className="h-8 px-3 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 font-mono font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <span>{BANAYA_UPI_ID}</span>
                                {copiedVpa ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopyValue(String(cartTotal), setCopiedAmount, 'Amount')}
                                className="h-8 px-3 rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 font-mono font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <span>₹{cartTotal.toLocaleString('en-IN')}</span>
                                {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                              </button>
                            </div>
                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="font-medium text-slate-700">
                                {BANAYA_BANK_DETAILS.bankName} ({BANAYA_BANK_DETAILS.branch}):
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopyValue(
                                    BANAYA_BANK_DETAILS.accountNumber,
                                    setCopiedAcctNo,
                                    'Account Number'
                                  )
                                }
                                className="h-7 px-2.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 font-mono font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>A/c: {BANAYA_BANK_DETAILS.accountNumber}</span>
                                {copiedAcctNo ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCopyValue(
                                    BANAYA_BANK_DETAILS.ifscCode,
                                    setCopiedIfsc,
                                    'IFSC Code'
                                  )
                                }
                                className="h-7 px-2.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-900 font-mono font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>IFSC: {BANAYA_BANK_DETAILS.ifscCode}</span>
                                {copiedIfsc ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPayment('netbanking');
                                setSplitMode(false);
                              }}
                              className="h-8 px-3 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Building2 className="w-3.5 h-3.5" />
                              <span>Option 2: Switch to Net Banking (Up to ₹10L Limit)</span>
                            </button>

                            {canSplitPayment && !splitMode && (
                              <button
                                type="button"
                                onClick={() => setSplitMode(true)}
                                className="h-8 px-3 rounded-md border border-emerald-700 bg-white hover:bg-emerald-50 text-[#064E3B] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Split className="w-3.5 h-3.5" />
                                <span>Option 3: Split into 2 Smaller Amounts</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setShowBankLimitsGuide((v) => !v)}
                              className="h-8 px-2.5 rounded-md border border-amber-300 bg-white hover:bg-amber-100/60 text-amber-950 font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span>Check Bank UPI Limits</span>
                            </button>
                          </div>

                          {showBankLimitsGuide && (
                            <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                              <table className="w-full text-left text-[11px] border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                    <th className="py-2 px-2.5">Bank / Method</th>
                                    <th className="py-2 px-2.5">UPI Limit</th>
                                    <th className="py-2 px-2.5">24h Txn Count</th>
                                    <th className="py-2 px-2.5">NetBanking</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {BANK_UPI_LIMITS.map((row) => (
                                    <tr key={row.bank}>
                                      <td className="py-1.5 px-2.5 font-medium text-slate-900">{row.bank}</td>
                                      <td className="py-1.5 px-2.5 text-slate-700 tabular-nums">{row.perTxnAndDailyUpi}</td>
                                      <td className="py-1.5 px-2.5 text-slate-600">{row.dailyCountCap}</td>
                                      <td className="py-1.5 px-2.5 font-medium text-emerald-800">{row.netBankingLimit}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Step 2 inside Gateway: Enter Bank / UPI Reference to Complete Payment & Return to Store */}
                    <div className="space-y-3 pt-1">
                      <div className={splitMode && canSplitPayment ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
                        <div>
                          <label
                            htmlFor="gateway-txn-id"
                            className="block text-xs font-semibold text-slate-800 mb-1"
                          >
                            {splitMode && canSplitPayment
                              ? `Part 1 UTR / Txn ID (₹${effectiveSplitFirst.toLocaleString('en-IN')}) *`
                              : selectedPayment === 'netbanking'
                                ? `Step 2: Enter ${selectedBank.shortName} Bank Reference / UTR Number *`
                                : `Step 2: Enter ${selectedOption.label} Transaction ID / UTR *`}
                          </label>
                          <input
                            id="gateway-txn-id"
                            type="text"
                            required
                            value={transactionIdInput}
                            onChange={(e) => setTransactionIdInput(e.target.value)}
                            placeholder={
                              selectedPayment === 'netbanking'
                                ? 'e.g. SBI241116009812 or IMPS UTR'
                                : 'e.g. 432198765432 (12-digit UPI Ref ID)'
                            }
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                          />
                        </div>

                        {splitMode && canSplitPayment && (
                          <div>
                            <label
                              htmlFor="gateway-txn-id-2"
                              className="block text-xs font-semibold text-slate-800 mb-1"
                            >
                              Part 2 UTR / Txn ID (₹{effectiveSplitSecond.toLocaleString('en-IN')}) *
                            </label>
                            <input
                              id="gateway-txn-id-2"
                              type="text"
                              required
                              value={splitSecondTxnId}
                              onChange={(e) => setSplitSecondTxnId(e.target.value)}
                              placeholder="e.g. 432198765499 (2nd UPI Ref ID)"
                              className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                            />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Enter the 12-digit UTR / Bank Reference shown on your payment receipt after transfer succeeds.
                      </p>

                      <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer text-xs text-slate-800">
                        <input
                          type="checkbox"
                          checked={paymentConfirmedCheck}
                          onChange={(e) => setPaymentConfirmedCheck(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-[#064E3B] cursor-pointer shrink-0"
                        />
                        <span>
                          I have completed the{' '}
                          <strong>₹{cartTotal.toLocaleString('en-IN')}</strong> payment{' '}
                          {selectedPayment === 'netbanking'
                            ? `via ${selectedBank.name}`
                            : splitMode && canSplitPayment
                              ? `in 2 transfers via ${selectedOption.label}`
                              : `via ${selectedOption.label}`}{' '}
                          and want to return to Banaya Enterprise.
                        </span>
                      </label>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                        <button
                          id="complete-payment-return-btn"
                          type="submit"
                          className="flex-1 h-11 px-5 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                        >
                          <span>Complete Payment &amp; Return to Banaya</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setStep('payment')}
                          className="h-11 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Cancel &amp; Go Back</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ==================== STEP 4: RETURNED TO PAGE — PAYMENT VERIFICATION PENDING ==================== */}
        {step === 'pending' && activeOrderDisplay && (
          <div className="p-4 sm:p-8">
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Status Card Header */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-7 text-center space-y-3 shadow-2xs">
                <div
                  className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center ${
                    isPaymentVerified
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  {isPaymentVerified ? <BadgeCheck className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
                </div>

                <div className="space-y-1">
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      isPaymentVerified ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {isPaymentVerified ? 'Verified by Merchant' : 'Awaiting Merchant Verification'}
                  </p>
                  <h3 className="font-heading text-2xl sm:text-3xl font-bold text-slate-950">
                    {isPaymentVerified ? 'Payment Verified & Order Confirmed' : 'Payment Verification Pending'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                    {isPaymentVerified
                      ? `Your payment of ₹${activeOrderDisplay.totalAmount.toLocaleString('en-IN')} has been verified. Your order is now ${activeOrderDisplay.status}.`
                      : `Thank you, ${activeOrderDisplay.customerName}. We recorded your order and reference for ₹${activeOrderDisplay.totalAmount.toLocaleString('en-IN')}. Our team is verifying the credit in our Banaya Enterprise account before confirming dispatch.`}
                  </p>
                </div>
              </div>

              {/* Submitted Transaction & Order Summary */}
              <div
                id="payment-verification-summary"
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
              >
                <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700 bg-slate-50/70">
                  <span>PAYMENT &amp; ORDER REFERENCE</span>
                  <span
                    className={
                      isPaymentVerified ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'
                    }
                  >
                    {isPaymentVerified ? `Status: ${activeOrderDisplay.status}` : 'Status: Verification Pending'}
                  </span>
                </div>

                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Order ID &amp; Receipt No.</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="font-mono text-sm text-slate-950">
                        {activeOrderDisplay.id}
                      </strong>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                        {activeOrderDisplay.receiptNumber || formatReceiptNumber(activeOrderDisplay.id)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyValue(activeOrderDisplay.id, setCopiedOrderId, 'Order ID')
                        }
                        className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                        title="Copy Order ID"
                      >
                        {copiedOrderId ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Submitted Transaction / UTR ID</span>
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-sm text-slate-950">
                        {activeOrderDisplay.transactionId || activeOrderDisplay.bankRef || 'Submitted'}
                      </strong>
                      {(activeOrderDisplay.transactionId || activeOrderDisplay.bankRef) && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyValue(
                              activeOrderDisplay.transactionId || activeOrderDisplay.bankRef || '',
                              setCopiedTxn,
                              'Transaction ID'
                            )
                          }
                          className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                          title="Copy Transaction ID"
                        >
                          {copiedTxn ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Order Amount</span>
                    <strong className="text-sm text-slate-950 tabular-nums">
                      ₹{activeOrderDisplay.totalAmount.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Payment Method</span>
                    <strong className="text-slate-900">{activeOrderDisplay.paymentMethod}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Merchant</span>
                    <span className="text-slate-800 font-medium">Banaya Enterprise ({BANAYA_CONTACT_EMAIL})</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Delivery Address</span>
                    <span className="text-slate-800">
                      {activeOrderDisplay.shippingAddress}, {activeOrderDisplay.city} -{' '}
                      {activeOrderDisplay.postalCode}
                    </span>
                  </div>
                </div>

                {/* Automatic Admin Alert & Customer Receipt Status */}
                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-emerald-50/50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <BellRing className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Admin Receipt &amp; Alert Dispatched
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Receipt <span className="font-mono">{activeOrderDisplay.receiptNumber || formatReceiptNumber(activeOrderDisplay.id)}</span> &amp; UTR alerted immediately to Banaya Admin Desk ({BANAYA_CONTACT_EMAIL}).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        {isPaymentVerified ? 'Confirmed Order Sent to Customer' : 'Customer Receipt & Live Sync Ready'}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {isPaymentVerified
                          ? `Verified confirmation & tracking (${activeOrderDisplay.trackingNumber}) delivered for ${activeOrderDisplay.email || activeOrderDisplay.phone}.`
                          : `Receipt recorded${activeOrderDisplay.email ? ` for ${activeOrderDisplay.email}` : ''}. Live order confirmation updates automatically once verified.`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Compact Itemized Receipt Summary */}
                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-white space-y-2 text-xs">
                  <div className="font-semibold text-slate-800 flex items-center justify-between">
                    <span>Order Receipt Items ({activeOrderDisplay.items.reduce((s, it) => s + it.quantity, 0)})</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {activeOrderDisplay.date}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg px-3">
                    {activeOrderDisplay.items.map((item, idx) => {
                      const unitPrice = getPriceForProductWeight(item.product, item.selectedWeight).price;
                      return (
                        <div key={idx} className="py-2 flex items-center justify-between gap-2">
                          <span className="text-slate-700 truncate">
                            {item.product.name} ({item.selectedWeight}) × {item.quantity}
                          </span>
                          <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                            ₹{(unitPrice * item.quantity).toLocaleString('en-IN')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3-Step Verification Progress */}
                <div className="px-4 sm:px-5 py-4 border-t border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="text-xs font-semibold text-slate-800">Verification Progress</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white border border-emerald-200 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-900">1. Receipt &amp; Alert Sent</div>
                        <div className="text-[11px] text-slate-500">Order &amp; UTR alerted to admin</div>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-lg bg-white border flex items-start gap-2.5 ${
                        isPaymentVerified ? 'border-emerald-200' : 'border-amber-300'
                      }`}
                    >
                      {isPaymentVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold text-slate-900">
                          {isPaymentVerified ? '2. Payment Verified' : '2. Merchant Verification'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {isPaymentVerified ? 'Confirmed by Banaya desk' : 'Pending bank reconciliation'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-lg bg-white border flex items-start gap-2.5 ${
                        isPaymentVerified ? 'border-emerald-200' : 'border-slate-200'
                      }`}
                    >
                      <Truck
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          isPaymentVerified ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <div className="font-semibold text-slate-900">3. Order Confirmation</div>
                        <div className="text-[11px] text-slate-500">
                          {isPaymentVerified
                            ? `Tracking: ${activeOrderDisplay.trackingNumber}`
                            : 'Starts after verification'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => downloadOrderReceipt(activeOrderDisplay, isPaymentVerified)}
                  className="h-11 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Official Receipt</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const url = getOrderWhatsAppUrl(
                      activeOrderDisplay,
                      activeOrderDisplay.transactionId || activeOrderDisplay.bankRef
                    );
                    openWhatsAppUrl(url);
                  }}
                  className="flex-1 h-11 px-4 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <MessageCircle className="w-4 h-4 fill-current" />
                  <span>WhatsApp Receipt ({DISPLAY_PHONE_NUMBER})</span>
                </button>

                <button
                  type="button"
                  onClick={() => openOrderTracking(activeOrderDisplay.id)}
                  className="h-11 px-4 rounded-lg bg-[#064E3B] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Truck className="w-4 h-4" />
                  <span>Track Order Status</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Reference</span>
                  </button>

                  {activeOrderDisplay.email && (
                    <a
                      href={buildCustomerConfirmationMailtoUrl(activeOrderDisplay)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Save Copy via Email</span>
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-medium cursor-pointer"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
