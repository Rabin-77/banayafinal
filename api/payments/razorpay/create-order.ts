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

async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
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
      res.status(503).json({ error: 'Razorpay API keys are not configured on the server' });
      return;
    }

    const rawBody = await readJsonBody(req);
    const { amountInr, receipt, customerName, phone, email } = rawBody as {
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

    const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
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

    res.status(200).json({
      orderId: rzpData.id,
      amount: rzpData.amount,
      currency: rzpData.currency || 'INR',
      keyId,
      isTestMode: keyId.startsWith('rzp_test_')
    });
  } catch (err) {
    console.error('Razorpay create-order error:', err);
    res.status(500).json({ error: 'Failed to initialize gateway payment order' });
  }
}
