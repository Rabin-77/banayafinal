import type { IncomingMessage, ServerResponse } from 'node:http';

interface VercelRequest extends IncomingMessage {
  method?: string;
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
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const keyId = sanitizeEnvSecret(process.env.RAZORPAY_KEY_ID);
  const keySecret = sanitizeEnvSecret(process.env.RAZORPAY_KEY_SECRET);
  const enabled = Boolean(keyId && keySecret && keyId !== 'MY_RAZORPAY_KEY_ID');
  const isTestMode = enabled && keyId.startsWith('rzp_test_');
  const mode = !enabled ? 'unconfigured' : isTestMode ? 'test' : 'live';

  res.status(200).json({
    razorpayEnabled: enabled,
    keyId: enabled ? keyId : null,
    isTestMode,
    mode
  });
}
