import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// ── Env vars (Supabase Dashboard → Project Settings → Edge Functions → Secrets) ──
// LICENSE_SECRET_HEX      — 64-char hex HMAC key (from lib.rs license_secret())
// RAZORPAY_KEY_ID         — rzp_test_xxx or rzp_live_xxx
// RAZORPAY_KEY_SECRET     — Razorpay API secret
// RAZORPAY_WEBHOOK_SECRET — set in Razorpay Dashboard → Webhooks
// RESEND_API_KEY          — from resend.com
// LICENSE_DAYS            — e.g. "40"

const LICENSE_SECRET_HEX      = Deno.env.get('LICENSE_SECRET_HEX')!
const RAZORPAY_KEY_ID         = Deno.env.get('RAZORPAY_KEY_ID')!
const RAZORPAY_KEY_SECRET     = Deno.env.get('RAZORPAY_KEY_SECRET')!
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || ''
const RESEND_API_KEY          = Deno.env.get('RESEND_API_KEY')!
const LICENSE_DAYS            = parseInt(Deno.env.get('LICENSE_DAYS') || '40', 10)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-razorpay-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RZP_AUTH = 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Bytes(keyBytes: Uint8Array, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return new Uint8Array(sig)
}

async function hmacSha256Str(secret: string, msg: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(secret)
  const mac      = await hmacSha256Bytes(keyBytes, msg)
  return bytesToHex(mac)
}

// ── License key generation (mirrors Rust validate_license_key exactly) ────────

async function generateLicenseKey(email: string, machineId: string): Promise<string> {
  const secretBytes = hexToBytes(LICENSE_SECRET_HEX)
  const expiryDays  = Math.floor(Date.now() / 1000 / 86400) + LICENSE_DAYS
  const expiryHex   = expiryDays.toString(16).toUpperCase().padStart(8, '0')
  const msg         = `${email.trim().toLowerCase()}|${expiryHex}|${machineId.trim()}`
  const mac         = await hmacSha256Bytes(secretBytes, msg)
  const mac12hex    = bytesToHex(mac.slice(0, 12)).toUpperCase()
  const raw         = expiryHex + mac12hex
  return `EV-${raw.slice(0,8)}-${raw.slice(8,16)}-${raw.slice(16,24)}-${raw.slice(24,32)}`
}

// ── Razorpay ──────────────────────────────────────────────────────────────────

async function createPaymentLink(email: string, machineId: string) {
  const expireBy = Math.floor(Date.now() / 1000) + 3600 // 1 hour to complete payment
  const r = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: RZP_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 100, // ₹1 in paise
      currency: 'INR',
      description: `Eagle View — ${LICENSE_DAYS}-day License`,
      customer: { email },
      notify: { email: false, sms: false },
      reminder_enable: false,
      expire_by: expireBy,
      notes: { email: email.trim().toLowerCase(), machine_id: machineId.trim() },
    }),
  })
  return r.json()
}

async function verifyWebhookSignature(body: string, signature: string): Promise<boolean> {
  if (!RAZORPAY_WEBHOOK_SECRET) return true // skip if not configured yet
  const expected = await hmacSha256Str(RAZORPAY_WEBHOOK_SECRET, body)
  return expected === signature
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendLicenseEmail(to: string, key: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Eagle View <onboarding@resend.dev>',
      to: [to],
      subject: 'Your Eagle View License Key',
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#07100F;color:#A8D4D1;padding:32px;border-radius:12px">
          <div style="font-size:22px;font-weight:700;color:#00E5FF;margin-bottom:8px">Eagle View</div>
          <div style="font-size:15px;font-weight:600;color:#F0FFFE;margin-bottom:24px">Your license key is ready</div>
          <div style="background:#0D1E1B;border:1px solid #1A3530;border-radius:8px;padding:16px;margin-bottom:24px">
            <div style="font-size:11px;color:#5A8A87;margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase">License Key</div>
            <div style="font-family:monospace;font-size:15px;color:#00E5FF;word-break:break-all;letter-spacing:.04em">${key}</div>
          </div>
          <div style="font-size:13px;color:#7AB8B5;line-height:1.8;margin-bottom:24px">
            To activate:<br>
            1. Open Eagle View<br>
            2. Click <strong style="color:#F0FFFE">Activate license →</strong><br>
            3. Enter your email and the key above
          </div>
          <div style="font-size:11px;color:#3A6460">Valid for ${LICENSE_DAYS} days from today · Questions? Reply to this email.</div>
        </div>
      `,
    }),
  })
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url    = new URL(req.url)
  const action = url.searchParams.get('action')
  const rawBody = await req.text()

  try {
    // ── webhook (called by Razorpay) ─────────────────────────────────────────
    if (action === 'webhook') {
      const signature = req.headers.get('x-razorpay-signature') || ''
      const valid = await verifyWebhookSignature(rawBody, signature)
      if (!valid) return json({ error: 'Invalid signature' }, 400)

      const payload = JSON.parse(rawBody)
      if (payload.event === 'payment_link.paid') {
        const notes      = payload?.payload?.payment_link?.entity?.notes || {}
        const email      = notes.email?.trim().toLowerCase()
        const machineId  = notes.machine_id?.trim()
        if (email && machineId) {
          const key = await generateLicenseKey(email, machineId)
          await sendLicenseEmail(email, key)
          console.log(`[webhook] license generated for ${email}`)
        }
      }
      return json({ ok: true })
    }

    const body = JSON.parse(rawBody)

    // ── create-payment-link (called by the app) ──────────────────────────────
    if (action === 'create-payment-link') {
      const { email, machine_id } = body
      if (!email || !machine_id) return json({ error: 'Missing email or machine_id' }, 400)

      const link = await createPaymentLink(email.trim().toLowerCase(), machine_id.trim())
      if (!link.short_url) return json({ error: link.error?.description || 'Payment link creation failed' }, 500)

      return json({ payment_link_url: link.short_url })
    }

    // ── legacy: create-order + activate (used by website buy form) ───────────
    if (action === 'create-order') {
      const { amount } = body
      if (!amount || amount < 100) return json({ error: 'Invalid amount' }, 400)
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: RZP_AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency: 'INR', payment_capture: 1 }),
      })
      const order = await r.json()
      return json({ order_id: order.id, amount: order.amount })
    }

    if (action === 'activate') {
      const { payment_id, order_id, signature, email, machine_id } = body
      if (!payment_id || !order_id || !signature || !email || !machine_id) return json({ error: 'Missing fields' }, 400)

      const expected = await hmacSha256Str(RAZORPAY_KEY_SECRET, `${order_id}|${payment_id}`)
      if (expected !== signature) return json({ error: 'Payment signature invalid' }, 400)

      const pr = await fetch(`https://api.razorpay.com/v1/payments/${payment_id}`, { headers: { Authorization: RZP_AUTH } })
      const payment = await pr.json()
      if (payment.status !== 'captured' && payment.status !== 'authorized') return json({ error: 'Payment not confirmed' }, 400)

      const key = await generateLicenseKey(email, machine_id)
      await sendLicenseEmail(email, key)
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
