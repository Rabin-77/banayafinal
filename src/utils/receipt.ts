import { Order } from '../types';
import { getPriceForProductWeight } from './pricing';
import { BANAYA_CONTACT_EMAIL, BANAYA_MAPS_URL, BANAYA_STORE_NAME } from '../config/storeContact';
import { BANAYA_UPI_ID, DISPLAY_PHONE_NUMBER } from './whatsapp';

export function formatReceiptNumber(orderId: string): string {
  const clean = (orderId || '').trim().toUpperCase();
  if (!clean) return `RCP-${Date.now().toString().slice(-6)}`;
  return clean.startsWith('RCP-') ? clean : `RCP-${clean}`;
}

function escapeHtml(raw: string): string {
  return (raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOrderReceiptHtml(order: Order, verifiedOverride?: boolean): string {
  const receiptNo = order.receiptNumber || formatReceiptNumber(order.id);
  const isVerified = verifiedOverride !== undefined ? verifiedOverride : order.status !== 'Processing';
  const txnRef = (order.transactionId || order.bankRef || '').trim() || 'Submitted at Gateway';

  const rowsHtml = order.items
    .map((item, idx) => {
      const unitPrice = getPriceForProductWeight(item.product, item.selectedWeight).price;
      const lineTotal = unitPrice * item.quantity;
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${idx + 1}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600;">
            ${escapeHtml(item.product.name)}
            <div style="font-size:11px;color:#64748b;font-weight:400;">Pack: ${escapeHtml(item.selectedWeight)}</div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#334155;">${item.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">&#8377;${unitPrice.toLocaleString('en-IN')}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;font-weight:600;">&#8377;${lineTotal.toLocaleString('en-IN')}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Receipt ${escapeHtml(receiptNo)} — ${escapeHtml(BANAYA_STORE_NAME)}</title>
</head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.06);">
    <div style="background:#064E3B;color:#ffffff;padding:24px 28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(BANAYA_STORE_NAME)}</div>
        <div style="font-size:12px;color:#a7f3d0;margin-top:4px;">Pure Nature &middot; Traditional Goodness</div>
        <div style="font-size:11px;color:#d1fae5;margin-top:6px;">
          ${escapeHtml(BANAYA_CONTACT_EMAIL)} &middot; ${escapeHtml(DISPLAY_PHONE_NUMBER)}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#fde68a;font-weight:700;">Official Order Receipt</div>
        <div style="font-size:16px;font-weight:700;font-family:monospace;margin-top:4px;">${escapeHtml(receiptNo)}</div>
        <div style="font-size:11px;color:#d1fae5;margin-top:2px;">Date: ${escapeHtml(order.date)}</div>
      </div>
    </div>

    <div style="padding:18px 28px;background:${isVerified ? '#ecfdf5' : '#fffbeb'};border-bottom:1px solid ${isVerified ? '#a7f3d0' : '#fde68a'};">
      <div style="font-size:13px;font-weight:700;color:${isVerified ? '#065f46' : '#92400e'};">
        ${isVerified ? 'PAYMENT VERIFIED & ORDER CONFIRMED' : 'PAYMENT SUBMITTED — AWAITING MERCHANT VERIFICATION'}
      </div>
      <div style="font-size:12px;color:${isVerified ? '#047857' : '#b45309'};margin-top:4px;">
        ${
          isVerified
            ? `Payment has been verified by ${escapeHtml(BANAYA_STORE_NAME)}. Current status: ${escapeHtml(order.status)} (Tracking: ${escapeHtml(order.trackingNumber)}).`
            : `Order ${escapeHtml(order.id)} and UTR reference ${escapeHtml(txnRef)} have been recorded and alerted to Banaya Admin Desk.`
        }
      </div>
    </div>

    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:12px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Customer &amp; Delivery Details</div>
            <div style="font-weight:700;color:#0f172a;font-size:13px;">${escapeHtml(order.customerName)}</div>
            <div style="color:#475569;margin-top:3px;">Phone: ${escapeHtml(order.phone)}</div>
            ${order.email ? `<div style="color:#475569;margin-top:2px;">Email: ${escapeHtml(order.email)}</div>` : ''}
            <div style="color:#475569;margin-top:4px;line-height:1.5;">
              ${escapeHtml(order.shippingAddress)}, ${escapeHtml(order.city)} - ${escapeHtml(order.postalCode)}
            </div>
          </td>
          <td style="width:50%;vertical-align:top;padding-left:12px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Payment &amp; Tracking Reference</div>
            <div style="color:#334155;margin-bottom:3px;"><strong>Order ID:</strong> <span style="font-family:monospace;">${escapeHtml(order.id)}</span></div>
            <div style="color:#334155;margin-bottom:3px;"><strong>Payment Method:</strong> ${escapeHtml(order.paymentMethod)}</div>
            <div style="color:#334155;margin-bottom:3px;"><strong>Txn / UTR Ref:</strong> <span style="font-family:monospace;">${escapeHtml(txnRef)}</span></div>
            <div style="color:#334155;margin-bottom:3px;"><strong>Merchant VPA:</strong> <span style="font-family:monospace;">${escapeHtml(BANAYA_UPI_ID)}</span></div>
            <div style="color:#334155;"><strong>Tracking No:</strong> <span style="font-family:monospace;">${escapeHtml(order.trackingNumber)}</span></div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase;">
            <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;">#</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;">Product</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #e2e8f0;">Qty</th>
            <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;">Unit Price</th>
            <th style="padding:10px 12px;text-align:right;border-bottom:1px solid #e2e8f0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div style="margin-top:18px;margin-left:auto;max-width:280px;font-size:13px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#475569;">
          <span>Subtotal</span>
          <span>&#8377;${order.subtotal.toLocaleString('en-IN')}</span>
        </div>
        ${
          order.discount > 0
            ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#047857;">
                <span>Discount</span>
                <span>-&#8377;${order.discount.toLocaleString('en-IN')}</span>
              </div>`
            : ''
        }
        <div style="display:flex;justify-content:space-between;padding:4px 0;color:#475569;">
          <span>Delivery Charges</span>
          <span>${order.shipping === 0 ? 'FREE' : `&#8377;${order.shipping.toLocaleString('en-IN')}`}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0 0;margin-top:8px;border-top:2px solid #e2e8f0;font-size:16px;font-weight:800;color:#0f172a;">
          <span>Total Paid</span>
          <span>&#8377;${order.totalAmount.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>

    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span>Thank you for shopping with ${escapeHtml(BANAYA_STORE_NAME)}.</span>
      <a href="${escapeHtml(BANAYA_MAPS_URL)}" target="_blank" rel="noopener noreferrer" style="color:#064E3B;font-weight:600;text-decoration:none;">Store Location on Google Maps</a>
    </div>
  </div>
</body>
</html>`;
}

export function downloadOrderReceipt(order: Order, verifiedOverride?: boolean): void {
  const receiptNo = order.receiptNumber || formatReceiptNumber(order.id);
  const html = buildOrderReceiptHtml(order, verifiedOverride);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${receiptNo}.html`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildCustomerOrderEmailBody(order: Order, isConfirmed: boolean): string {
  const receiptNo = order.receiptNumber || formatReceiptNumber(order.id);
  const txnRef = (order.transactionId || order.bankRef || '').trim() || 'Submitted';
  const itemsText = order.items
    .map((item, idx) => {
      const unitPrice = getPriceForProductWeight(item.product, item.selectedWeight).price;
      return `${idx + 1}. ${item.product.name} (${item.selectedWeight}) x ${item.quantity} = Rs.${unitPrice * item.quantity}`;
    })
    .join('\n');

  return `Hello ${order.customerName},

${
  isConfirmed
    ? `Great news! Your payment has been verified and your order with ${BANAYA_STORE_NAME} is now ${order.status}.`
    : `Thank you for ordering with ${BANAYA_STORE_NAME}. Your order & payment receipt has been received.`
}

Receipt No: ${receiptNo}
Order ID: ${order.id}
Tracking Number: ${order.trackingNumber}
Date: ${order.date}
Payment Method: ${order.paymentMethod}
Transaction / UTR Ref: ${txnRef}
Order Status: ${isConfirmed ? `${order.status} (Payment Verified)` : 'Processing (Awaiting Merchant Verification)'}

Items Ordered:
${itemsText}

Total Paid: Rs.${order.totalAmount.toLocaleString('en-IN')}

Delivery Address:
${order.shippingAddress}, ${order.city} - ${order.postalCode}

Store Support Email: ${BANAYA_CONTACT_EMAIL}
Phone / WhatsApp: ${DISPLAY_PHONE_NUMBER}
Store Location: ${BANAYA_MAPS_URL}

Warm regards,
${BANAYA_STORE_NAME}`;
}

export function buildAdminReceiptMailtoUrl(order: Order): string {
  const receiptNo = order.receiptNumber || formatReceiptNumber(order.id);
  const subject = `[Banaya Admin Alert] New Order & Payment Receipt ${receiptNo} (Rs.${order.totalAmount})`;
  const body = buildCustomerOrderEmailBody(order, order.status !== 'Processing');
  return `mailto:${BANAYA_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildCustomerConfirmationMailtoUrl(order: Order): string {
  const receiptNo = order.receiptNumber || formatReceiptNumber(order.id);
  const isConfirmed = order.status !== 'Processing';
  const subject = isConfirmed
    ? `Banaya Enterprises — Payment Verified & Order Confirmed (${order.id} / ${receiptNo})`
    : `Banaya Enterprises — Order & Payment Receipt (${order.id} / ${receiptNo})`;
  const body = buildCustomerOrderEmailBody(order, isConfirmed);
  return `mailto:${encodeURIComponent(order.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
