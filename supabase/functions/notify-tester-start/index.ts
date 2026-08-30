import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Secrets: RESEND_API_KEY — from resend.com (set via Supabase Dashboard → Secrets)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const TO_EMAIL       = 'manojkmahesh@gmail.com'
const FROM_EMAIL     = 'tester@newmantech.in'
const TESTCASE_URL   = 'https://newmantech.in/eagleview/testcase/'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { tester, platform, display, version, timestamp } = await req.json()

    if (!tester || !platform || !display) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const ts = timestamp || new Date().toISOString()
    const dateStr = new Date(ts).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr><td style="background:#E87722;padding:24px 32px">
          <p style="margin:0;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:0.06em;text-transform:uppercase">Eagle View</p>
          <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff">QA Session Started</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px;font-size:14px;color:#555">A tester has started a QA session.</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:10px 14px;background:#fafafa;border-radius:8px 8px 0 0;border:1px solid #eee;font-size:12px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em;width:120px">Tester</td>
              <td style="padding:10px 14px;background:#fafafa;border-radius:8px 8px 0 0;border:1px solid #eee;border-left:none;font-size:14px;font-weight:600;color:#1a1a1a">${tester}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#fff;border:1px solid #eee;border-top:none;font-size:12px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em">Platform</td>
              <td style="padding:10px 14px;background:#fff;border:1px solid #eee;border-top:none;border-left:none;font-size:14px;color:#333">${platform}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#fafafa;border:1px solid #eee;border-top:none;font-size:12px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em">Display</td>
              <td style="padding:10px 14px;background:#fafafa;border:1px solid #eee;border-top:none;border-left:none;font-size:14px;color:#333">${display}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#fff;border:1px solid #eee;border-top:none;font-size:12px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em">Version</td>
              <td style="padding:10px 14px;background:#fff;border:1px solid #eee;border-top:none;border-left:none;font-size:14px;color:#333">${version || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;background:#fafafa;border-radius:0 0 8px 8px;border:1px solid #eee;border-top:none;font-size:12px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em">Started</td>
              <td style="padding:10px 14px;background:#fafafa;border-radius:0 0 8px 8px;border:1px solid #eee;border-top:none;border-left:none;font-size:14px;color:#333">${dateStr} IST</td>
            </tr>
          </table>
          <div style="margin-top:24px;text-align:center">
            <a href="${TESTCASE_URL}" style="display:inline-block;background:#E87722;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 24px;border-radius:8px">Open QA Checklist →</a>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #f0f0f0">
          <p style="margin:0;font-size:11px;color:#aaa;text-align:center">Eagle View · Newman Tech · This is an automated notification</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Eagle View QA <${FROM_EMAIL}>`,
        to: [TO_EMAIL],
        subject: `QA Started — ${tester} · ${platform} · ${version || 'unknown'}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return new Response(JSON.stringify({ error: 'Email failed', detail: err }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('notify-tester-start error:', e)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
