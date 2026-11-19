import { Order, Product } from '../types';
import { getPriceForProductWeight } from './pricing';

export const WHATSAPP_CONTACT_NUMBER = '918838598172';
export const DISPLAY_PHONE_NUMBER = '+91 883 859 8172';
export const BANAYA_UPI_ID = 'banayaenterprise100-1@oksbi';

/**
 * Builds a formatted WhatsApp text message for a complete customer order.
 */
export function formatOrderWhatsAppMessage(order: Order, transactionId?: string): string {
  const itemsText = order.items
    .map((item, idx) => {
      const unitPrice = getPriceForProductWeight(item.product, item.selectedWeight).price;
      const price = unitPrice * item.quantity;
      return `${idx + 1}. *${item.product.name}* (${item.selectedWeight}) × ${item.quantity} = ₹${price}`;
    })
    .join('\n');

  const txnRef = (transactionId || order.transactionId || order.bankRef || '').trim();
  const isRazorpayOrder = order.paymentMethod.includes('Razorpay') || Boolean(order.bankRef?.startsWith('order_'));
  const isVerified = order.status !== 'Processing' || isRazorpayOrder;
  const paymentHeader = isVerified
    ? '✅ *PAYMENT VERIFIED & ORDER CONFIRMED*'
    : '⏳ *PAYMENT STATUS: VERIFICATION PENDING*';
  const orderStatusLabel = isVerified
    ? `${order.status === 'Processing' ? 'Confirmed' : order.status} (Payment Verified)`
    : 'Processing (Awaiting Merchant Payment Verification)';
  const actionFooter = isVerified
    ? '🚚 *Action Required:* Payment is verified. Please pack and dispatch this order. Thank you!'
    : `🔎 *Action Required:* Customer submitted ${order.paymentMethod}${txnRef ? ` (Ref: ${txnRef})` : ''}. Please verify receipt of ₹${order.totalAmount} to Banaya Enterprise and confirm dispatch.`;

  return `🌿 *NEW ONLINE ORDER - BANAYA ENTERPRISE* 🌿
----------------------------------------
${paymentHeader}
• *Payment Method:* ${order.paymentMethod}
• *Payable Amount:* *₹${order.totalAmount}*
${isRazorpayOrder && order.bankRef ? `• *Razorpay Order ID:* ${order.bankRef}\n` : ''}${txnRef ? `• *Payment / Transaction ID:* ${txnRef}\n` : ''}
📋 *ORDER DETAILS:*
• *Order ID:* ${order.id}
• *Date:* ${order.date}
• *Tracking Code:* ${order.trackingNumber}
• *Order Status:* ${orderStatusLabel}

👤 *CUSTOMER SHIPPING DETAILS:*
• *Name:* ${order.customerName}
• *Phone:* ${order.phone}
• *Email:* ${order.email || 'N/A'}
• *Delivery Address:* ${order.shippingAddress}, ${order.city} - ${order.postalCode}

🛍️ *PRODUCTS ORDERED:*
${itemsText}

----------------------------------------
💰 *BILLING SUMMARY:*
• *Subtotal:* ₹${order.subtotal}
${order.discount > 0 ? `• *Discount Applied:* -₹${order.discount}\n` : ''}• *Delivery Charge:* ${order.shipping === 0 ? 'FREE' : `₹${order.shipping}`}
• *ORDER TOTAL:* *₹${order.totalAmount}*
----------------------------------------
${actionFooter}`;
}

/**
 * Generates the full wa.me link for a placed order.
 */
export function getOrderWhatsAppUrl(
  order: Order, 
  transactionId?: string, 
  phone: string = WHATSAPP_CONTACT_NUMBER
): string {
  const message = formatOrderWhatsAppMessage(order, transactionId);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds a direct product booking message for 1-click booking from product cards or product modals.
 */
export function formatProductBookingMessage(params: {
  product: Product;
  selectedWeight: string;
  quantity: number;
  price: number;
  customerName?: string;
  customerPhone?: string;
  customerCity?: string;
  paidViaUpi?: boolean;
}): string {
  const { product, selectedWeight, quantity, price, customerName, customerPhone, customerCity, paidViaUpi } = params;
  const totalPrice = price * quantity;

  let msg = `🌿 *${paidViaUpi ? 'PREPAID PRODUCT ORDER' : 'PRODUCT INQUIRY'} - BANAYA ENTERPRISE* 🌿
----------------------------------------
${paidViaUpi ? `⏳ *PAYMENT STATUS: VERIFICATION PENDING*\n• *Amount:* ₹${totalPrice}\n• *Merchant UPI ID:* ${BANAYA_UPI_ID}\n----------------------------------------\n` : ''}🛍️ *PRODUCT DETAILS:*
• *Product Name:* ${product.name}
${product.tamilName ? `• *Tamil Name:* ${product.tamilName}\n` : ''}• *Category:* ${product.category}
• *Selected Pack:* ${selectedWeight}
• *Quantity:* ${quantity}
• *Unit Price:* ₹${price}
• *Total Payable:* *₹${totalPrice}*`;

  if (customerName || customerPhone || customerCity) {
    msg += `\n\n👤 *CUSTOMER DETAILS:*`;
    if (customerName) msg += `\n• *Name:* ${customerName}`;
    if (customerPhone) msg += `\n• *Phone:* ${customerPhone}`;
    if (customerCity) msg += `\n• *Location:* ${customerCity}`;
  }

  msg += `\n\n----------------------------------------
Hello Banaya Enterprise, ${paidViaUpi ? 'I have submitted my online payment. Please verify and confirm dispatch.' : 'I want to book this product. Please share confirmation and delivery details!'}`;

  return msg;
}

/**
 * Generates the WhatsApp URL for a single product booking.
 */
export function getProductBookingWhatsAppUrl(params: {
  product: Product;
  selectedWeight: string;
  quantity: number;
  price: number;
  customerName?: string;
  customerPhone?: string;
  customerCity?: string;
  paidViaUpi?: boolean;
}, phone: string = WHATSAPP_CONTACT_NUMBER): string {
  const message = formatProductBookingMessage(params);
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Opens WhatsApp in a new tab cleanly without triggering blocked window.open popups.
 */
export function openWhatsAppUrl(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

