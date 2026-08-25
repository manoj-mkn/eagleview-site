import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createHmac } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

// ── Env vars (set in Supabase dashboard → Project Settings → Edge Functions) ──
// LICENSE_SECRET_HEX  — 64-char hex: the XOR of the two arrays in lib.rs license_secret()
// RAZORPAY_KEY_ID     — your Razorpay key id  (rzp_test_xxx or rzp_live_xxx)
// RAZORPAY_KEY_SECRET — your Razorpay key secret
// RESEND_API_KEY      — your Resend API key
// LICENSE_DAYS        — e.g. "365" (how many days the license is valid)

const LICENSE_SECRET_HEX  = Deno.env.get('LICENSE_SECRET_HEX')!
const RAZORPAY_KEY_ID     = Deno.env.get('RAZORPAY_KEY_ID')!
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!
const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY')!
const LICENSE_DAYS        = parseInt(Deno.env.get('LICENSE_DAYS') || '365', 10)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── HMAC-SHA256 helpers ───────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(keyBytes: Uint8Array, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return new Uint8Array(sig)
}

// ── License key generation (mirrors Rust validate_license_key logic exactly) ──
// Key format: EV-DDDDDDDD-HHHHHHHH-HHHHHHHH-HHHHHHHH
// DDDDDDDD = 8 hex chars = u32 days since Unix epoch (expiry day)
// Remaining 24 hex = first 12 bytes of HMAC-SHA256(secret, "email|expiryHex|machineId")

async function generateLicenseKey(email: string, machineId: string): Promise<string> {
  const secretBytes  = hexToBytes(LICENSE_SECRET_HEX)
  const expiryDays   = Math.floor(Date.now() / 1000 / 86400) + LICENSE_DAYS
  const expiryHex    = expiryDays.toString(16).toUpperCase().padStart(8, '0')
  const msg          = `${email.trim().toLowerCase()}|${expiryHex}|${machineId.trim()}`
  const mac          = await hmacSha256(secretBytes, msg)
  const mac12hex     = bytesToHex(mac.slice(0, 12)).toUpperCase()
  const raw          = expiryHex + mac12hex // 8 + 24 = 32 hex chars
  // Format as EV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
  return `EV-${raw.slice(0,8)}-${raw.slice(8,16)}-${raw.slice(16,24)}-${raw.slice(24,32)}`
}

// ── Razorpay helpers ──────────────────────────────────────────────────────────

const RZP_AUTH = 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)

async function createRazorpayOrder(amount: number) {
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: RZP_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: 'INR', payment_capture: 1 }),
  })
  return r.json()
}

async function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const secretBytes = new TextEncoder().encode(RAZORPAY_KEY_SECRET)
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const msg = new TextEncoder().encode(`${orderId}|${paymentId}`)
  const mac = await crypto.subtle.sign('HMAC', key, msg)
  const expected = bytesToHex(new Uint8Array(mac))
  return expected === signature
}

async function getPayment(paymentId: string) {
  const r = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: RZP_AUTH },
  })
  return r.json()
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendLicenseEmail(to: string, key: string, machineId: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Eagle View <license@newmantech.in>',
      to: [to],
      subject: 'Your Eagle View License Key',
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#07100F;color:#A8D4D1;padding:32px;border-radius:12px">
          <div style="font-size:22px;font-weight:700;color:#00E5FF;margin-bottom:8px">Eagle View</div>
          <div style="font-size:15px;font-weight:600;color:#F0FFFE;margin-bottom:24px">Your license key is ready</div>
          <div style="background:#0D1E1B;border:1px solid #1A3530;border-radius:8px;padding:16px;margin-bottom:24px">
            <div style="font-size:11px;color:#5A8A87;margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase">License Key</div>
            <div style="font-family:monospace;font-size:14px;color:#00E5FF;word-break:break-all">${key}</div>
          </div>
          <div style="font-size:13px;color:#7AB8B5;line-height:1.7;margin-bottom:24px">
            To activate:<br>
            1. Open Eagle View<br>
            2. Click <strong style="color:#F0FFFE">ⓘ About</strong> (top right)<br>
            3. Click <strong style="color:#F0FFFE">Activate license →</strong><br>
            4. Enter your email and the key above
          </div>
          <div style="font-size:11px;color:#3A6460">
            This key is tied to machine ID: ${machineId.slice(0, 8)}…<br>
            Questions? Reply to this email.
          </div>
        </div>
      `,
    }),
  })
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url    = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    const body = await req.json()

    // ── create-order ─────────────────────────────────────────────────────────
    if (action === 'create-order') {
      const { amount } = body
      if (!amount || amount < 100) return json({ error: 'Invalid amount' }, 400)
      const order = await createRazorpayOrder(amount)
      return json({ order_id: order.id, amount: order.amount })
    }

    // ── activate ─────────────────────────────────────────────────────────────
    if (action === 'activate') {
      const { payment_id, order_id, signature, email, machine_id } = body

      if (!payment_id || !order_id || !signature || !email || !machine_id) {
        return json({ error: 'Missing required fields' }, 400)
      }

      // 1. Verify Razorpay signature (proves payment wasn't forged)
      const sigOk = await verifyRazorpaySignature(order_id, payment_id, signature)
      if (!sigOk) return json({ error: 'Payment signature invalid' }, 400)

      // 2. Fetch payment from Razorpay and confirm it's paid
      const payment = await getPayment(payment_id)
      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        return json({ error: 'Payment not confirmed yet. Contact support.' }, 400)
      }

      // 3. Generate license key
      const key = await generateLicenseKey(email, machine_id)

      // 4. Email it
      await sendLicenseEmail(email, key, machine_id)

      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)

  } catch (e) {
    console.error(e)
    return json({ error: 'Internal server error' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
