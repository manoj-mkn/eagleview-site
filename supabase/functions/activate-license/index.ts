import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// ── Env vars (Supabase Dashboard → Project Settings → Edge Functions → Secrets) ──
// LICENSE_SECRET_HEX      — 64-char hex HMAC key (from lib.rs license_secret())
// RAZORPAY_KEY_ID         — rzp_test_xxx or rzp_live_xxx
// RAZORPAY_KEY_SECRET     — Razorpay API secret
// RAZORPAY_WEBHOOK_SECRET — set in Razorpay Dashboard → Webhooks
// RESEND_API_KEY          — from resend.com
// LICENSE_DAYS            — e.g. "40"

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LICENSE_SECRET_HEX      = Deno.env.get('LICENSE_SECRET_HEX')!
const RAZORPAY_KEY_ID         = Deno.env.get('RAZORPAY_KEY_ID')!
const RAZORPAY_KEY_SECRET     = Deno.env.get('RAZORPAY_KEY_SECRET')!
const RAZORPAY_WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || ''
const RESEND_API_KEY          = Deno.env.get('RESEND_API_KEY')!
const LICENSE_DAYS_DEFAULT    = parseInt(Deno.env.get('LICENSE_DAYS') || '40', 10)
const ALLOWED_PLANS           = new Set([40, 180, 365, 730])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-razorpay-signature, authorization',
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

async function generateLicenseKey(email: string, machineId: string, licenseDays = LICENSE_DAYS_DEFAULT): Promise<string> {
  const secretBytes = hexToBytes(LICENSE_SECRET_HEX)
  const expiryDays  = Math.floor(Date.now() / 1000 / 86400) + licenseDays
  const expiryHex   = expiryDays.toString(16).toUpperCase().padStart(8, '0')
  const msg         = `${email.trim().toLowerCase()}|${expiryHex}|${machineId.trim()}`
  const mac         = await hmacSha256Bytes(secretBytes, msg)
  const mac12hex    = bytesToHex(mac.slice(0, 12)).toUpperCase()
  const raw         = expiryHex + mac12hex
  return `EV-${raw.slice(0,8)}-${raw.slice(8,16)}-${raw.slice(16,24)}-${raw.slice(24,32)}`
}

// ── Razorpay ──────────────────────────────────────────────────────────────────

function planLabel(days: number): string {
  if (days === 180) return '6-Month License'
  if (days === 365) return '1-Year License'
  if (days === 730) return '2-Year License'
  return `${days}-Day License`
}

async function createPaymentLink(email: string, machineId: string, licenseDays: number, amountInr = 1) {
  const expireBy = Math.floor(Date.now() / 1000) + 3600
  const r = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: RZP_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountInr * 100, // paise
      currency: 'INR',
      description: `Eagle View — ${planLabel(licenseDays)}`,
      customer: { email },
      notify: { email: false, sms: false },
      reminder_enable: false,
      expire_by: expireBy,
      notes: { email: email.trim().toLowerCase(), machine_id: machineId.trim(), license_days: String(licenseDays) },
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

async function sendLicenseEmail(to: string, key: string, licenseDays = LICENSE_DAYS_DEFAULT) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Eagle View <license@newmantech.in>',
      to: [to],
      subject: 'Your Eagle View License Key',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#0D1E1B;border-radius:12px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#7A3200 0%,#B85400 40%,#E87722 70%,#F5A040 100%);padding:28px 32px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.18em;text-transform:uppercase">Eagle View</div>
          </div>
          <div style="padding:32px">
            <p style="font-size:15px;color:#C8E8E5;line-height:1.7;margin:0 0 28px">Here is your Eagle View license key. Keep this safe — it is tied to your machine and expires in ${licenseDays} days.</p>
            <div style="background:linear-gradient(135deg,#0D3330 0%,#0A4A42 50%,#0D6B5E 100%);border-radius:10px;padding:24px;text-align:center;margin-bottom:28px">
              <div style="font-size:10px;font-weight:700;color:#7AB8B5;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px">Your Key</div>
              <div style="font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;color:#ffffff;letter-spacing:.06em;word-break:break-all">${key}</div>
            </div>
            <div style="font-size:11px;font-weight:700;color:#7AB8B5;letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px">How to Activate</div>
            <table style="width:100%;border-collapse:collapse">
              <tr>
                <td style="width:32px;vertical-align:middle;padding-bottom:14px">
                  <table style="border-collapse:collapse"><tr><td style="width:26px;height:26px;border-radius:50%;border:1.5px solid #00E5FF;font-size:12px;font-weight:700;color:#00E5FF;text-align:center;vertical-align:middle;line-height:26px">1</td></tr></table>
                </td>
                <td style="padding-bottom:14px;padding-left:12px;font-size:14px;color:#C8E8E5;vertical-align:middle">Open Eagle View on your Mac or Windows machine</td>
              </tr>
              <tr>
                <td style="width:32px;vertical-align:middle;padding-bottom:14px">
                  <table style="border-collapse:collapse"><tr><td style="width:26px;height:26px;border-radius:50%;border:1.5px solid #00E5FF;font-size:12px;font-weight:700;color:#00E5FF;text-align:center;vertical-align:middle;line-height:26px">2</td></tr></table>
                </td>
                <td style="padding-bottom:14px;padding-left:12px;font-size:14px;color:#C8E8E5;vertical-align:middle">Click <strong style="color:#00E5FF">Activate license →</strong> on the license screen</td>
              </tr>
              <tr>
                <td style="width:32px;vertical-align:middle">
                  <table style="border-collapse:collapse"><tr><td style="width:26px;height:26px;border-radius:50%;border:1.5px solid #00E5FF;font-size:12px;font-weight:700;color:#00E5FF;text-align:center;vertical-align:middle;line-height:26px">3</td></tr></table>
                </td>
                <td style="padding-left:12px;font-size:14px;color:#C8E8E5;vertical-align:middle">Paste the key above, enter your email, and click <strong style="color:#00E5FF">Activate</strong></td>
              </tr>
            </table>
            <div style="border-top:1px solid #1A3530;margin-top:28px;padding-top:18px">
              <table style="width:100%;border-collapse:collapse"><tr>
                <td style="font-size:12px;color:#5A8A87">Newman Tech</td>
                <td style="text-align:right"><a href="https://newmantech.in" style="font-size:12px;color:#00E5FF;text-decoration:none">newmantech.in</a></td>
              </tr></table>
            </div>
          </div>
        </div>
      `,
    }),
  })
  const resendResult = await r.json()
  console.log('[email] Resend response:', JSON.stringify(resendResult))
  if (resendResult.statusCode >= 400 || resendResult.name === 'validation_error') {
    console.error('[email] Resend error — key was:', key)
  }
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
        const noteDays   = parseInt(notes.license_days || '0', 10)
        const licenseDays = ALLOWED_PLANS.has(noteDays) ? noteDays : LICENSE_DAYS_DEFAULT
        if (email && machineId) {
          const key = await generateLicenseKey(email, machineId, licenseDays)
          await sendLicenseEmail(email, key, licenseDays)
          console.log(`[webhook] license generated for ${email} — plan=${licenseDays}d`)
        }
      }
      return json({ ok: true })
    }

    const body = JSON.parse(rawBody)

    // ── create-payment-link (called by the app) ──────────────────────────────
    if (action === 'create-payment-link') {
      const { email, machine_id, license_days, amount_inr } = body
      if (!email || !machine_id) return json({ error: 'Missing email or machine_id' }, 400)
      const planDays  = ALLOWED_PLANS.has(Number(license_days)) ? Number(license_days) : LICENSE_DAYS_DEFAULT
      const amountInr = Number(amount_inr) > 0 ? Number(amount_inr) : 1

      const link = await createPaymentLink(email.trim().toLowerCase(), machine_id.trim(), planDays, amountInr)
      console.log('[create-payment-link] Razorpay response:', JSON.stringify(link))
      if (!link.short_url) return json({ error: link.error?.description || link.error?.code || link.description || JSON.stringify(link) }, 500)

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

    // ── ping-admin (validates service key before admin tool grants access) ──────
    if (action === 'ping-admin') {
      const { admin_key } = body
      if (!admin_key || admin_key.trim() !== SUPABASE_SERVICE_KEY.trim()) return json({ error: 'Unauthorized' }, 401)
      return json({ ok: true })
    }

    // ── admin-issue-key (local admin tool only — auth via service key) ───────────
    if (action === 'admin-issue-key') {
      const { email, machine_id, license_days, admin_key } = body
      if (!admin_key || admin_key.trim() !== SUPABASE_SERVICE_KEY.trim()) return json({ error: 'Unauthorized' }, 401)
      if (!email || !machine_id || !license_days) return json({ error: 'Missing fields' }, 400)
      const days = Math.max(1, Math.min(3650, Number(license_days)))
      const key = await generateLicenseKey(email.trim().toLowerCase(), machine_id.trim(), days)
      await sendLicenseEmail(email.trim().toLowerCase(), key, days)
      return json({ ok: true, key })
    }

    // ── register-trial (called by the app when user enters trial mode) ──────────
    if (action === 'register-trial') {
      const { email, machine_id } = body
      if (!email || !machine_id) return json({ error: 'Missing fields' }, 400)
      const payload = { email: email.trim().toLowerCase(), machine_id: machine_id.trim() }
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal',
      }
      // unique users — ignore if same machine already recorded (keep first email)
      await fetch(`${SUPABASE_URL}/rest/v1/trial_users`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(payload),
      })
      // full history — every attempt logged, no dedup
      await fetch(`${SUPABASE_URL}/rest/v1/trial_attempts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
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
