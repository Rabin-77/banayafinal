import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  MessageCircle,
  Copy,
  Check,
  Lock,
  BadgeCheck,
  Building2,
  MapPin,
  Printer,
  Truck,
  Loader2,
  Download,
  FileText,
  BellRing,
  Mail,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useShop } from '../context/ShopContext';
import { Order } from '../types';
import {
  getOrderWhatsAppUrl,
  openWhatsAppUrl,
  DISPLAY_PHONE_NUMBER
} from '../utils/whatsapp';
import { BANAYA_CONTACT_EMAIL } from '../config/storeContact';
import { getPriceForProductWeight } from '../utils/pricing';
import {
  downloadOrderReceipt,
  formatReceiptNumber,
  buildCustomerConfirmationMailtoUrl
} from '../utils/receipt';
import { handleProductImageError, handleProductImageLoad } from '../utils/imageFallback';

type PaymentOptionId = 'netbanking' | 'gpay' | 'phonepe' | 'paytm' | 'upi';
type PaymentLifecycleStatus =
  | 'idle'
  | 'creating_order'
  | 'checkout_open'
  | 'verifying'
  | 'failed'
  | 'verified';

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
  popular: boolean;
}

const PAYMENT_OPTIONS: PaymentOptionConfig[] = [
  {
    id: 'gpay',
    label: 'Google Pay',
    subtitle: 'Pay via Google Pay in Razorpay Checkout'
  },
  {
    id: 'phonepe',
    label: 'PhonePe',
    subtitle: 'Pay via PhonePe in Razorpay Checkout'
  },
  {
    id: 'paytm',
    label: 'Paytm',
    subtitle: 'Pay via Paytm in Razorpay Checkout'
  },
  {
    id: 'upi',
    label: 'UPI Payment',
    subtitle: 'Instant pay via any UPI app or UPI ID in Razorpay Checkout',
    tag: 'Recommended'
  },
  {
    id: 'netbanking',
    label: 'Net Banking',
    subtitle: 'All major Indian banks supported via Razorpay NetBanking',
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
    popular: true
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    shortName: 'HDFC',
    code: 'HDFC',
    accentClass: 'bg-indigo-800 text-white',
    popular: true
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    shortName: 'ICICI',
    code: 'ICICI',
    accentClass: 'bg-orange-700 text-white',
    popular: true
  },
  {
    id: 'axis',
    name: 'Axis Bank',
    shortName: 'Axis',
    code: 'AXIS',
    accentClass: 'bg-rose-800 text-white',
    popular: true
  },
  {
    id: 'kotak',
    name: 'Kotak Mahindra Bank',
    shortName: 'Kotak',
    code: 'KTK',
    accentClass: 'bg-red-700 text-white',
    popular: true
  },
  {
    id: 'iob',
    name: 'Indian Overseas Bank (IOB)',
    shortName: 'IOB',
    code: 'IOB',
    accentClass: 'bg-sky-900 text-white',
    popular: true
  },
  {
    id: 'indian',
    name: 'Indian Bank',
    shortName: 'Indian Bank',
    code: 'INDB',
    accentClass: 'bg-sky-800 text-white',
    popular: false
  },
  {
    id: 'canara',
    name: 'Canara Bank',
    shortName: 'Canara',
    code: 'CNR',
    accentClass: 'bg-cyan-700 text-white',
    popular: false
  },
  {
    id: 'pnb',
    name: 'Punjab National Bank',
    shortName: 'PNB',
    code: 'PNB',
    accentClass: 'bg-amber-700 text-white',
    popular: false
  },
  {
    id: 'bob',
    name: 'Bank of Baroda',
    shortName: 'BOB',
    code: 'BOB',
    accentClass: 'bg-orange-600 text-white',
    popular: false
  },
  {
    id: 'union',
    name: 'Union Bank of India',
    shortName: 'Union Bank',
    code: 'UBI',
    accentClass: 'bg-blue-800 text-white',
    popular: false
  }
];

interface BankUpiLimitInfo {
  bank: string;
  perTxnAndDailyUpi: string;
  netBankingLimit: string;
}

const BANK_UPI_LIMITS: BankUpiLimitInfo[] = [
  { bank: 'State Bank of India (SBI)', perTxnAndDailyUpi: '₹1,00,000', netBankingLimit: '₹10,00,000' },
  { bank: 'HDFC Bank', perTxnAndDailyUpi: '₹1,00,000 (₹5k first 24h)', netBankingLimit: '₹10,00,000' },
  { bank: 'ICICI Bank', perTxnAndDailyUpi: '₹1,00,000', netBankingLimit: '₹10,00,000' },
  { bank: 'Axis Bank', perTxnAndDailyUpi: '₹1,00,000', netBankingLimit: '₹10,00,000' },
  { bank: 'Indian Overseas Bank (IOB)', perTxnAndDailyUpi: '₹1,00,000', netBankingLimit: '₹5,00,000' },
  { bank: 'Canara / PNB / BOB / Union', perTxnAndDailyUpi: '₹50,000 – ₹1,00,000', netBankingLimit: '₹5,00,000' }
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

interface RazorpaySuccessPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string; reason?: string } }) => void) => void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance;

async function loadRazorpayCheckoutScript(): Promise<RazorpayConstructor | null> {
  const win = window as unknown as { Razorpay?: RazorpayConstructor };
  if (win.Razorpay) return win.Razorpay;

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
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

  // Clean 3-Step Razorpay Standard Checkout Flow:
  // 1. 'details' -> Delivery Address & Item Summary
  // 2. 'payment' -> Payment Method Selection + Razorpay Standard Checkout + Failure/Retry Handling
  // 3. 'confirmed' -> Server-Verified Payment & Order Confirmation Receipt
  const [step, setStep] = useState<'details' | 'payment' | 'confirmed'>('details');

  const [selectedPayment, setSelectedPayment] = useState<PaymentOptionId>('gpay');
  const [selectedBankId, setSelectedBankId] = useState<string>('sbi');
  const [customerUpiId, setCustomerUpiId] = useState<string>('');
  const [showBankLimitsGuide, setShowBankLimitsGuide] = useState(false);

  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [liveStatus, setLiveStatus] = useState<Order['status']>('Processing');
  const [liveTrackingNumber, setLiveTrackingNumber] = useState<string>('');

  const [gatewayConfig, setGatewayConfig] = useState<{
    razorpayEnabled: boolean;
    keyId: string | null;
    isTestMode: boolean;
  }>({
    razorpayEnabled: false,
    keyId: null,
    isTestMode: false
  });
  const [configLoading, setConfigLoading] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [paymentStatus, setPaymentStatus] = useState<PaymentLifecycleStatus>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const checkoutOutcomeRef = useRef<boolean>(false);

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

  // Fetch Razorpay public configuration from server (/api/payments/config)
  useEffect(() => {
    if (activeModal !== 'checkout') return;
    let cancelled = false;
    setConfigLoading(true);
    setConfigError(null);

    fetch('/api/payments/config')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Could not load payment gateway configuration');
        }
        return (await res.json()) as {
          razorpayEnabled?: boolean;
          keyId?: string | null;
          isTestMode?: boolean;
        };
      })
      .then((data) => {
        if (cancelled) return;
        const enabled = Boolean(data?.razorpayEnabled && data?.keyId);
        setGatewayConfig({
          razorpayEnabled: enabled,
          keyId: enabled ? data.keyId || null : null,
          isTestMode: Boolean(data?.isTestMode || data?.keyId?.startsWith('rzp_test_'))
        });
      })
      .catch(() => {
        if (cancelled) return;
        setGatewayConfig({ razorpayEnabled: false, keyId: null, isTestMode: false });
        setConfigError('Unable to reach payment gateway configuration service. Please refresh and try again.');
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeModal]);

  // Scroll modal back to top whenever checkout step changes
  useEffect(() => {
    if (activeModal !== 'checkout') return;
    const container = document.getElementById('checkout-modal-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step, activeModal]);

  // Subscribe live to Firestore /orderStatus/{orderId} once verified order is created
  useEffect(() => {
    if (!createdOrder?.id) return;

    setLiveStatus(createdOrder.status);
    setLiveTrackingNumber(createdOrder.trackingNumber || '');

    const unsub = onSnapshot(
      doc(db, 'orderStatus', createdOrder.id),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as {
            status?: Order['status'];
            trackingNumber?: string;
          };
          if (data.status && data.status !== 'Processing') {
            setLiveStatus(data.status);
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
      if (matched.status !== 'Processing') {
        setLiveStatus(matched.status);
      }
      if (matched.trackingNumber) {
        setLiveTrackingNumber(matched.trackingNumber);
      }
    }
  }, [orders, createdOrder?.id]);

  if (activeModal !== 'checkout') return null;

  const selectedBank = INDIAN_BANKS.find((b) => b.id === selectedBankId) || INDIAN_BANKS[0];
  const selectedOption = PAYMENT_OPTIONS.find((o) => o.id === selectedPayment) || PAYMENT_OPTIONS[0];
  const itemCount = cart.reduce((sum, it) => sum + it.quantity, 0);
  const isBusy =
    paymentStatus === 'creating_order' ||
    paymentStatus === 'checkout_open' ||
    paymentStatus === 'verifying';
  const isGatewayReady = gatewayConfig.razorpayEnabled && Boolean(gatewayConfig.keyId);

  const activeOrderDisplay: Order | null = createdOrder
    ? {
        ...createdOrder,
        status: liveStatus === 'Processing' ? 'Confirmed' : liveStatus,
        trackingNumber: liveTrackingNumber || createdOrder.trackingNumber
      }
    : null;

  const resetCheckoutState = () => {
    setStep('details');
    setSelectedPayment('gpay');
    setSelectedBankId('sbi');
    setCustomerUpiId('');
    setShowBankLimitsGuide(false);
    setCreatedOrder(null);
    setLiveStatus('Processing');
    setLiveTrackingNumber('');
    setPaymentStatus('idle');
    setPaymentError(null);
    checkoutOutcomeRef.current = false;
  };

  const handleCloseModal = () => {
    if (paymentStatus === 'verifying') return;
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

    setPaymentStatus('idle');
    setPaymentError(null);
    setStep('payment');
  };

  // Trigger Razorpay Standard Checkout -> Verify HMAC Signature on Server -> Save Order in Firestore
  const handleInitiateDirectPay = async () => {
    if (cart.length === 0) {
      showToast('Empty Bag', 'Your shopping bag is empty.', 'warning');
      return;
    }

    if (!isGatewayReady) {
      const msg =
        configError ||
        'Razorpay payment gateway is not configured. Please ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set in server environment variables.';
      setPaymentStatus('failed');
      setPaymentError(msg);
      showToast('Payment Gateway Unavailable', msg, 'warning');
      return;
    }

    if (selectedPayment === 'upi' && customerUpiId.trim()) {
      const cleanUpi = customerUpiId.trim();
      if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(cleanUpi)) {
        showToast(
          'Check UPI ID Format',
          'Please enter a valid UPI ID (for example: yourname@oksbi or success@razorpay in Test Mode), or leave blank to choose inside Razorpay.',
          'warning'
        );
        return;
      }
    }

    setPaymentStatus('creating_order');
    setPaymentError(null);
    checkoutOutcomeRef.current = false;

    try {
      const [RazorpayCtor, orderRes] = await Promise.all([
        loadRazorpayCheckoutScript(),
        fetch('/api/payments/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountInr: cartTotal,
            receipt: `BNY-${Date.now().toString().slice(-6)}`,
            customerName: name.trim(),
            phone: phone.trim(),
            email: email.trim()
          })
        })
      ]);

      if (!RazorpayCtor) {
        throw new Error('Could not load Razorpay Standard Checkout script. Please check your connection and retry.');
      }

      const orderData = (await orderRes.json()) as {
        orderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        error?: string;
      };

      if (!orderRes.ok || !orderData.orderId) {
        throw new Error(orderData.error || 'Could not create Razorpay order on server.');
      }

      const paymentMethodLabel = `${
        selectedPayment === 'netbanking' ? `Net Banking (${selectedBank.name})` : selectedOption.label
      } (Razorpay Verified)`;

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
          selected_option: selectedOption.label,
          bank: selectedPayment === 'netbanking' ? selectedBank.shortName : ''
        },
        theme: { color: '#064E3B' },
        modal: {
          ondismiss: () => {
            if (checkoutOutcomeRef.current) return;
            checkoutOutcomeRef.current = true;
            setPaymentStatus('failed');
            setPaymentError('Payment was cancelled before completion. Click Retry Payment to try again.');
            showToast(
              'Payment Cancelled',
              'You closed the payment window before completing payment. Your bag items are safe.',
              'warning'
            );
          }
        },
        handler: async (response: RazorpaySuccessPayload) => {
          checkoutOutcomeRef.current = true;
          setPaymentStatus('verifying');
          setPaymentError(null);

          try {
            const verifyRes = await fetch('/api/payments/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response)
            });

            const verifyData = (await verifyRes.json()) as {
              verified?: boolean;
              paymentId?: string;
              orderId?: string;
              error?: string;
            };

            if (!verifyRes.ok || verifyData.verified !== true) {
              throw new Error(
                verifyData.error || 'Server payment signature verification failed. Order was not confirmed.'
              );
            }

            const savedOrder = await placeOrder({
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

            setCreatedOrder(savedOrder);
            setLiveStatus('Confirmed');
            setLiveTrackingNumber(savedOrder.trackingNumber);
            setPaymentStatus('verified');
            setStep('confirmed');
            showToast(
              'Payment Verified & Order Confirmed',
              `Payment ${response.razorpay_payment_id} verified for ₹${cartTotal.toLocaleString('en-IN')}.`,
              'success'
            );
          } catch (verifyOrSaveErr) {
            const errMessage =
              (verifyOrSaveErr as Error)?.message ||
              'Payment verification or order saving failed. Please retry or contact support with your payment ID.';
            setPaymentStatus('failed');
            setPaymentError(errMessage);
            showToast('Verification Failed', errMessage, 'warning');
          }
        }
      });

      rzp.on('payment.failed', (errResp) => {
        checkoutOutcomeRef.current = true;
        const failReason =
          errResp?.error?.description ||
          'Payment failed at the gateway. Please retry payment or select another method.';
        setPaymentStatus('failed');
        setPaymentError(failReason);
        showToast('Payment Failed', failReason, 'warning');
      });

      setPaymentStatus('checkout_open');
      rzp.open();
    } catch (err) {
      const errMsg = (err as Error)?.message || 'Unable to start Razorpay Checkout. Please retry.';
      setPaymentStatus('failed');
      setPaymentError(errMsg);
      showToast('Checkout Error', errMsg, 'warning');
    }
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
        <div className="px-4 sm:px-6 py-3.5 sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-[#064E3B] text-white border-emerald-900/40">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white p-1 shrink-0 flex items-center justify-center">
              <img
                src="/images/banaya_logo.png"
                alt="Banaya Enterprises"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-base sm:text-lg font-bold leading-tight truncate">
                {step === 'details' && 'Secure Checkout — Delivery Address'}
                {step === 'payment' && 'Payments — Banaya Enterprise'}
                {step === 'confirmed' && 'Payment Verified & Order Confirmed'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-200/90 truncate">
                {step === 'details' && 'Step 1 · Enter delivery address'}
                {step === 'payment' &&
                  `Step 2 · Pay securely via Razorpay · Total ₹${cartTotal.toLocaleString('en-IN')}`}
                {step === 'confirmed' && `Order ${activeOrderDisplay?.id} confirmed for dispatch`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isGatewayReady && gatewayConfig.isTestMode && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/20 border border-amber-300/40 text-[11px] text-amber-200 font-semibold">
                Test Mode
              </span>
            )}
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-100 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-300" /> 100% Secure
            </span>
            <button
              id="close-checkout-btn"
              type="button"
              onClick={handleCloseModal}
              disabled={paymentStatus === 'verifying'}
              aria-label="Close checkout"
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Clean Progress Strip */}
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
                  : step === 'confirmed'
                    ? 'text-emerald-700'
                    : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                  step === 'payment'
                    ? 'bg-[#064E3B] text-white'
                    : step === 'confirmed'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step === 'confirmed' ? <Check className="w-3 h-3" /> : '2'}
              </span>
              <span>Payment Options</span>
            </div>

            <div className="flex-1 h-px bg-slate-200 mx-2 sm:mx-4" />

            <div
              className={`flex items-center gap-2 ${
                step === 'confirmed' ? 'text-emerald-700 font-semibold' : 'text-slate-400'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                  step === 'confirmed'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step === 'confirmed' ? <Check className="w-3 h-3" /> : '3'}
              </span>
              <span>Confirmed</span>
            </div>
          </div>
        </div>

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

        {/* ==================== STEP 2: RAZORPAY STANDARD CHECKOUT PAYMENT OPTIONS ==================== */}
        {step === 'payment' && (
          <div className="p-3 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
              {/* Left Column: Address Recap + 5 Payment Options + Status Alerts */}
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
                    disabled={isBusy}
                    onClick={() => setStep('details')}
                    className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-xs font-medium text-[#064E3B] shrink-0 cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                {/* Verifying Payment Banner */}
                {paymentStatus === 'verifying' && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 flex items-center gap-3 text-xs sm:text-sm text-emerald-950">
                    <Loader2 className="w-5 h-5 text-[#064E3B] animate-spin shrink-0" />
                    <div>
                      <div className="font-semibold">Verifying Payment Signature &amp; Saving Order...</div>
                      <p className="text-xs text-emerald-800">
                        Confirming transaction authenticity with Banaya Enterprise server. Please do not close this window.
                      </p>
                    </div>
                  </div>
                )}

                {/* Gateway Unavailable Warning (No Simulated Fallback) */}
                {!configLoading && !isGatewayReady && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-xs text-amber-950">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold text-sm">Payment Gateway Not Ready</div>
                      <p className="leading-relaxed">
                        {configError ||
                          'Razorpay API credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the server. Payments cannot be processed until server environment variables are active.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment Failed / Cancelled Retry Banner */}
                {paymentStatus === 'failed' && paymentError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-950">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-semibold text-sm">Payment Not Completed</div>
                        <p className="text-rose-800 leading-relaxed">{paymentError}</p>
                      </div>
                    </div>
                    <button
                      id="retry-payment-btn"
                      type="button"
                      disabled={isBusy || !isGatewayReady}
                      onClick={() => void handleInitiateDirectPay()}
                      className="h-9 px-4 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] disabled:opacity-50 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Payment</span>
                    </button>
                  </div>
                )}

                {/* Payment Options Accordion (Razorpay Standard Checkout Only) */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="bg-[#064E3B] text-white px-4 py-3 flex items-center justify-between gap-2">
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
                            disabled={isBusy}
                            onClick={() => {
                              setSelectedPayment(option.id);
                              if (paymentStatus === 'failed') {
                                setPaymentStatus('idle');
                                setPaymentError(null);
                              }
                            }}
                            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 disabled:opacity-60 transition-colors cursor-pointer"
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

                          {/* Expanded Razorpay Standard Checkout Action Panel */}
                          {isSelected && (
                            <div className="px-4 pb-5 pt-3 sm:pl-11 border-t border-slate-100 space-y-4">
                              {option.id === 'netbanking' ? (
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
                                            disabled={isBusy}
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
                                      disabled={isBusy}
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

                                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                                    <button
                                      id="pay-netbanking-btn"
                                      type="button"
                                      disabled={isBusy || configLoading || !isGatewayReady}
                                      onClick={() => void handleInitiateDirectPay()}
                                      className="w-full sm:w-auto min-w-[230px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      {isBusy ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                          <span>
                                            {paymentStatus === 'verifying'
                                              ? 'Verifying Payment...'
                                              : 'Opening Razorpay...'}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <span>Pay Now ₹{cartTotal.toLocaleString('en-IN')} ({selectedBank.shortName})</span>
                                          <ArrowRight className="w-4 h-4" />
                                        </>
                                      )}
                                    </button>
                                    <span className="text-[11px] text-slate-500">
                                      Opens Razorpay Standard Checkout for {selectedBank.shortName} NetBanking.
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5 space-y-3">
                                  <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <div>
                                      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                                        <BadgeCheck className="w-3.5 h-3.5" />
                                        <span>
                                          Razorpay Standard Checkout
                                          {gatewayConfig.isTestMode ? ' · Test Mode' : ''}
                                        </span>
                                      </div>
                                      <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                                        Pay{' '}
                                        <span className="tabular-nums text-[#064E3B]">
                                          ₹{cartTotal.toLocaleString('en-IN')}
                                        </span>{' '}
                                        with {option.label}
                                      </h4>
                                    </div>
                                  </div>

                                  <p className="text-xs text-slate-600 leading-relaxed">
                                    Click <strong>Pay Now</strong> to open Razorpay Standard Checkout with {option.label}, cards, wallets, or NetBanking. Your order is saved and confirmed immediately after server signature verification.
                                  </p>

                                  {option.id === 'upi' && (
                                    <div className="max-w-sm">
                                      <label
                                        htmlFor="checkout-upi-id"
                                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                                      >
                                        Your UPI ID (Optional — e.g. success@razorpay in Test Mode)
                                      </label>
                                      <input
                                        id="checkout-upi-id"
                                        type="text"
                                        disabled={isBusy}
                                        value={customerUpiId}
                                        onChange={(e) => setCustomerUpiId(e.target.value)}
                                        placeholder="yourname@oksbi or success@razorpay"
                                        className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-hidden focus:border-[#064E3B]"
                                      />
                                    </div>
                                  )}

                                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                                    <button
                                      id={`pay-${option.id}-btn`}
                                      type="button"
                                      disabled={isBusy || configLoading || !isGatewayReady}
                                      onClick={() => void handleInitiateDirectPay()}
                                      className="w-full sm:w-auto min-w-[250px] h-11 px-6 rounded-lg bg-[#FB641B] hover:bg-[#ea580c] disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer tabular-nums"
                                    >
                                      {isBusy ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                          <span>
                                            {paymentStatus === 'verifying'
                                              ? 'Verifying Payment...'
                                              : 'Opening Razorpay...'}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <span>Pay Now ₹{cartTotal.toLocaleString('en-IN')}</span>
                                          <ArrowRight className="w-4 h-4" />
                                        </>
                                      )}
                                    </button>
                                  </div>

                                  <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                                    <span>
                                      256-bit encrypted Razorpay Standard Checkout with automatic server-side signature verification.
                                    </span>
                                  </p>
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
                        <span>Gateway</span>
                        <span className="font-medium text-slate-800">
                          Razorpay {gatewayConfig.isTestMode ? '(Test Mode)' : 'Checkout'}
                        </span>
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
                    Cash on Delivery is not available. All payments are processed securely via Razorpay Standard Checkout (UPI, Cards, Wallets, and NetBanking up to ₹10L).
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
                        <div
                          key={row.bank}
                          className="text-[11px] flex items-start justify-between gap-2 py-1 border-b border-slate-100 last:border-b-0"
                        >
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

        {/* ==================== STEP 3: VERIFIED PAYMENT & ORDER CONFIRMATION RECEIPT ==================== */}
        {step === 'confirmed' && activeOrderDisplay && (
          <div className="p-4 sm:p-8">
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Status Card Header */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-7 text-center space-y-3 shadow-2xs">
                <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <BadgeCheck className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Verified by Razorpay {gatewayConfig.isTestMode ? '(Test Mode)' : ''}
                  </p>
                  <h3 className="font-heading text-2xl sm:text-3xl font-bold text-slate-950">
                    Payment Verified &amp; Order Confirmed
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                    Thank you, {activeOrderDisplay.customerName}. Your payment of ₹
                    {activeOrderDisplay.totalAmount.toLocaleString('en-IN')} has been verified and your order is{' '}
                    {activeOrderDisplay.status}.
                  </p>
                </div>
              </div>

              {/* Verified Transaction & Order Summary */}
              <div
                id="payment-verification-summary"
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
              >
                <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700 bg-slate-50/70">
                  <span>PAYMENT &amp; ORDER REFERENCE</span>
                  <span className="text-emerald-700 font-semibold">
                    Status: {activeOrderDisplay.status}
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
                    <span className="text-slate-500 block mb-0.5">Razorpay Payment ID</span>
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-sm text-slate-950">
                        {activeOrderDisplay.transactionId || activeOrderDisplay.bankRef || 'Verified'}
                      </strong>
                      {(activeOrderDisplay.transactionId || activeOrderDisplay.bankRef) && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyValue(
                              activeOrderDisplay.transactionId || activeOrderDisplay.bankRef || '',
                              setCopiedTxn,
                              'Payment ID'
                            )
                          }
                          className="p-1 rounded border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                          title="Copy Payment ID"
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
                    <span className="text-slate-800 font-medium">
                      Banaya Enterprise ({BANAYA_CONTACT_EMAIL})
                    </span>
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
                        Receipt{' '}
                        <span className="font-mono">
                          {activeOrderDisplay.receiptNumber || formatReceiptNumber(activeOrderDisplay.id)}
                        </span>{' '}
                        recorded in Banaya Admin Desk ({BANAYA_CONTACT_EMAIL}).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Confirmed Order Saved
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Verified confirmation &amp; tracking ({activeOrderDisplay.trackingNumber}) saved for{' '}
                        {activeOrderDisplay.email || activeOrderDisplay.phone}.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Compact Itemized Receipt Summary */}
                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-white space-y-2 text-xs">
                  <div className="font-semibold text-slate-800 flex items-center justify-between">
                    <span>
                      Order Receipt Items ({activeOrderDisplay.items.reduce((s, it) => s + it.quantity, 0)})
                    </span>
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
                        <div className="font-semibold text-slate-900">1. Payment Authorized</div>
                        <div className="text-[11px] text-slate-500">Razorpay transaction completed</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-emerald-200 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-900">2. Signature Verified</div>
                        <div className="text-[11px] text-slate-500">Verified securely by server</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-emerald-200 flex items-start gap-2.5">
                      <Truck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                      <div>
                        <div className="font-semibold text-slate-900">3. Order Confirmed</div>
                        <div className="text-[11px] text-slate-500">
                          Tracking: {activeOrderDisplay.trackingNumber}
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
                  onClick={() => downloadOrderReceipt(activeOrderDisplay, true)}
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
