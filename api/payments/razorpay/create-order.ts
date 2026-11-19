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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const keyId = sanitizeEnvSecret(process.env.RAZORPAY_KEY_ID);
    const keySecret = sanitizeEnvSecret(process.env.RAZORPAY_KEY_SECRET);
    if (!keyId || !keySecret || keyId === 'MY_RAZORPAY_KEY_ID') {
      res.status(503).json({ error: 'Signed payment gateway keys not configured' });
      return;
    }

    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { amountInr, receipt, customerName, phone, email } = rawBody as {
      amountInr?: number;
      receipt?: string;
      customerName?: string;
      phone?: string;
      email?: string;
    };

    const parsedAmount = Math.round(Number(amountInr) || 0);
    if (parsedAmount < 1 || parsedAmount > 1_000_000) {
      res.status(400).json({ error: 'Invalid payment amount' });
      return;
    }

    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: parsedAmount * 100,
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
        error: rzpData.error?.description || 'Failed to initialize payment gateway order'
      });
      return;
    }

    res.status(200).json({
      orderId: rzpData.id,
      amount: rzpData.amount,
      currency: rzpData.currency || 'INR',
      keyId
    });
  } catch (err) {
    console.error('Razorpay create-order error:', err);
    res.status(500).json({ error: 'Failed to initialize gateway payment order' });
  }
}
