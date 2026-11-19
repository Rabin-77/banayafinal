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

const DEFAULT_ADMIN_PASSKEY_SHA256 =
  'd34b84e8afda277e0909a7e8b93d80335d1a7b6bbedc6ddfc0166fe6bc5bfcd2';
const REVOKED_LEGACY_PASSKEY_SHA256 =
  'c8c3ffefa5f6d97e06f87db28be0745ad1e960da5bfa78c8430a8e4a4b670113';

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

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function isValidAdminPasskey(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  const envPasskey = sanitizeEnvSecret(process.env.ADMIN_PASSKEY);
  const envPasskeyHash = envPasskey ? sha256Hex(envPasskey) : '';
  const expectedHash =
    envPasskeyHash && envPasskeyHash !== REVOKED_LEGACY_PASSKEY_SHA256
      ? envPasskeyHash
      : DEFAULT_ADMIN_PASSKEY_SHA256;

  const candidateBuf = Buffer.from(sha256Hex(trimmed), 'utf8');
  const expectedBuf = Buffer.from(expectedHash, 'utf8');
  return candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const rawBody = await readJsonBody(req);
    const bodyPasskey = typeof rawBody.passkey === 'string' ? rawBody.passkey : '';
    const headerVal = req.headers['x-admin-passkey'];
    const headerPasskey = Array.isArray(headerVal) ? headerVal[0] || '' : headerVal || '';
    const candidate = bodyPasskey || headerPasskey;

    if (isValidAdminPasskey(candidate)) {
      res.status(200).json({ ok: true });
      return;
    }

    res.status(401).json({ ok: false, error: 'Invalid administrator setup key' });
  } catch (err) {
    console.error('Admin verify error:', err);
    res.status(500).json({ ok: false, error: 'Failed to verify administrator setup key' });
  }
}
