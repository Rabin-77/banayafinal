import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface VercelRequest extends IncomingMessage {
  method?: string;
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

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

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const keyId = sanitizeEnvSecret(process.env.RAZORPAY_KEY_ID);
    const keySecret = sanitizeEnvSecret(process.env.RAZORPAY_KEY_SECRET);
    if (!keyId || !keySecret || keyId === 'MY_RAZORPAY_KEY_ID') {
      res.status(503).json({ verified: false, error: 'Gateway keys not configured' });
      return;
    }

    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = rawBody as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ verified: false, error: 'Missing payment verification signature fields' });
      return;
    }

    const expectedHex = crypto
      .createHmac('sha256', keySecret)
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

    res.status(200).json({
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id
    });
  } catch (err) {
    console.error('Razorpay verify error:', err);
    res.status(500).json({ verified: false, error: 'Signature verification error' });
  }
}
