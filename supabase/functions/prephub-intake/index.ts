import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

function cors(_origin: string | null) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function clean(value: unknown, max = 250) {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function bool(value: unknown): boolean | null {
  if (value === true || value === "Yes") return true;
  if (value === false || value === "No") return false;
  return null;
}

const taskCatalog = {
  credit: {
    title: "Credit Readiness",
    description: "Build toward the 640+ credit range used by many DPA programs.",
    action_url: "https://www.dpahelpcenter.com/credit/",
    position: 1,
  },
  dti: {
    title: "Income / DTI Review",
    description: "Review your buying power, income, and debt-to-income position.",
    action_url: "https://www.dpahelpcenter.com/dti",
    position: 2,
  },
  job: {
    title: "Employment Readiness",
    description: "Document a stable work, school, military, or qualifying income history.",
    action_url: "https://www.dpahelpcenter.com/employment/",
    position: 3,
  },
  taxes: {
    title: "Tax Document Readiness",
    description: "Prepare the tax records needed to verify qualifying income.",
    action_url: "https://www.dpahelpcenter.com/taxes/",
    position: 4,
  },
} as const;

const HELUX_BASE_URL = clean(
  Deno.env.get("HELUX_BASE_URL") || "https://helux-os.onrender.com",
  500,
).replace(/\/+$/, "");

async function forwardToHelux(payload: Record<string, unknown>) {
  const apiKey = clean(Deno.env.get("HELUX_API_KEY"), 500);
  if (!apiKey) {
    console.error("HELUX forwarding skipped: HELUX_API_KEY is missing.");
    return { ok: false, status: "not_configured" };
  }

  try {
    const response = await fetch(`${HELUX_BASE_URL}/api/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-helux-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("HELUX forwarding failed", response.status, result);
      return { ok: false, status: `http_${response.status}` };
    }
    return {
      ok: true,
      status: result.duplicate ? "duplicate" : "submitted",
      monday_prephub_sync: result.monday_prephub_sync?.status || null,
      monday_dpa_sync: result.monday_dpa_sync?.status || null,
      ai_outbound_call: result.ai_outbound_call?.status || null,
    };
  } catch (error) {
    console.error("HELUX forwarding failed", error);
    return { ok: false, status: "request_failed" };
  }
}

function readyEmailHtml(firstName: string, loginUrl: string) {
  const safeFirstName = escapeHtml(firstName);
  const safeLoginUrl = escapeHtml(loginUrl);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Your PrepHub readiness results</title>
  </head>
  <body style="margin:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color:#081f5c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f8;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:30px 24px 26px;background:#081f5c;color:#ffffff;">
                <div style="font-size:26px;line-height:1.2;font-weight:900;letter-spacing:.8px;">DPA HELP CENTER</div>
                <div style="width:138px;height:5px;margin:9px auto;background:#d22630;border-radius:99px;"></div>
                <div style="margin-top:10px;font-size:11px;font-weight:800;letter-spacing:2.5px;color:#dce9ff;">HOMEBUYER PREPHUB</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 30px 36px;">
                <div style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#0057b8;">Your readiness results</div>
                <h1 style="margin:9px 0 12px;font-size:31px;line-height:1.1;font-weight:900;color:#081f5c;">${safeFirstName}, you appear <span style="color:#d22630;">100% ready.</span></h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#081f5c;">Now let&rsquo;s make you lender-ready.</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#52617c;">Based on your responses, your homebuyer readiness score is <strong style="color:#0057b8;">100%</strong>. That means you may be ready to move forward&mdash;but your information and documents still need to be organized and reviewed.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px;background:#fff3f4;border-left:5px solid #d22630;border-radius:4px 16px 16px 4px;">
                  <tr>
                    <td style="padding:19px;">
                      <div style="margin:0 0 9px;font-size:18px;font-weight:900;color:#081f5c;">Expect a call from Daisy</div>
                      <p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:#52617c;">You may have already received a call from Daisy, your first-time homebuyer assistant. If not, please answer when she calls from:</p>
                      <div style="margin:2px 0 11px;font-size:22px;font-weight:900;color:#0057b8;">1-833-302-8953</div>
                      <p style="margin:0;font-size:14px;line-height:1.55;color:#52617c;">Daisy will confirm your information and learn more about your homebuying goals. A DPA specialist will follow up after your call as we prepare to match you with programs that fit your needs.</p>
                    </td>
                  </tr>
                </table>

                <h2 style="margin:0 0 9px;font-size:21px;line-height:1.2;font-weight:900;color:#081f5c;">Build your lender-ready file</h2>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#52617c;">Your application is only the beginning. Inside PrepHub, upload and organize your:</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;background:#f6f8fb;border-radius:16px;">
                  <tr><td style="padding:18px 20px 7px;font-size:14px;font-weight:700;line-height:1.45;color:#263c68;">&#10003;&nbsp;&nbsp;Credit report</td></tr>
                  <tr><td style="padding:7px 20px;font-size:14px;font-weight:700;line-height:1.45;color:#263c68;">&#10003;&nbsp;&nbsp;Pay stubs and income documents</td></tr>
                  <tr><td style="padding:7px 20px;font-size:14px;font-weight:700;line-height:1.45;color:#263c68;">&#10003;&nbsp;&nbsp;Work and employment history</td></tr>
                  <tr><td style="padding:7px 20px;font-size:14px;font-weight:700;line-height:1.45;color:#263c68;">&#10003;&nbsp;&nbsp;Tax returns</td></tr>
                  <tr><td style="padding:7px 20px 18px;font-size:14px;font-weight:700;line-height:1.45;color:#263c68;">&#10003;&nbsp;&nbsp;Bank statements and supporting documents</td></tr>
                </table>

                <div style="margin:0 0 18px;padding:18px;border-radius:16px;background:#eef5ff;color:#203765;font-size:14px;line-height:1.55;"><strong>Save hours&mdash;even days.</strong> Keep everything together so your lender or real estate agent can quickly find information you previously submitted.</div>
                <p style="margin:0 0 22px;font-size:13px;line-height:1.55;color:#52617c;">PrepHub will also provide a preliminary estimate of how much home you may be able to afford. This estimate is for preparation purposes and is not a loan approval.</p>
                <div style="padding-top:22px;border-top:1px solid #e4e9f1;text-align:center;">
                  <p style="margin:0 0 18px;font-size:15px;line-height:1.55;font-weight:700;color:#081f5c;">Complete your preparation, keep everything in one place, and stay ready throughout the homebuying process.</p>
                  <a href="${safeLoginUrl}" style="display:block;padding:16px 18px;border-radius:13px;background:#081f5c;color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:.6px;">LOG IN TO MY HOMEBUYER PREPHUB</a>
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:19px 24px 22px;background:#f6f8fb;font-size:11px;line-height:1.5;color:#8792a6;">DPA Help Center &bull; Program availability and qualification requirements vary.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function readyEmailText(firstName: string, loginUrl: string) {
  return `${firstName}, you appear 100% ready.

Now let's make you lender-ready.

Based on your responses, your homebuyer readiness score is 100%. That means you may be ready to move forward, but your information and documents still need to be organized and reviewed.

EXPECT A CALL FROM DAISY
You may have already received a call from Daisy, your first-time homebuyer assistant. If not, please answer when she calls from 1-833-302-8953.

Daisy will confirm your information and learn more about your homebuying goals. A DPA specialist will follow up after your call as we prepare to match you with programs that fit your needs.

BUILD YOUR LENDER-READY FILE
Inside PrepHub, upload and organize your credit report, pay stubs and income documents, work and employment history, tax returns, bank statements, and other supporting documents.

Keeping everything together can save hours, or even days, when your lender or real estate agent needs something you previously submitted. PrepHub will also provide a preliminary estimate of how much home you may be able to afford. This estimate is for preparation purposes and is not a loan approval.

LOG IN TO MY HOMEBUYER PREPHUB
${loginUrl}

DPA Help Center | Program availability and qualification requirements vary.`;
}

function preparationEmailHtml(
  firstName: string,
  score: number,
  focusAreas: Array<keyof typeof taskCatalog>,
  loginUrl: string,
) {
  const safeFirstName = escapeHtml(firstName);
  const safeLoginUrl = escapeHtml(loginUrl);
  const focusDetails: Record<keyof typeof taskCatalog, { title: string; description: string }> = {
    credit: {
      title: "Prepare your credit",
      description: "Strengthen your credit profile and work toward the 640+ range used by many DPA programs.",
    },
    dti: {
      title: "Improve your debt-to-income position",
      description: "Review your income, monthly debts, and buying power so you know exactly what to work on.",
    },
    job: {
      title: "Document your work history",
      description: "Organize your stable work, school, military, or other qualifying income history.",
    },
    taxes: {
      title: "Prepare your tax records",
      description: "Gather the tax returns and income records your homebuying team may need to review.",
    },
  };
  const areas: Array<keyof typeof taskCatalog> = focusAreas.length
    ? focusAreas
    : ["credit", "dti", "job", "taxes"];
  const focusRows = areas.map((key, index) => {
    const item = focusDetails[key];
    const bottomPadding = index === areas.length - 1 ? "18px" : "9px";
    return `<tr>
      <td width="42" valign="top" style="padding:9px 0 ${bottomPadding} 18px;">
        <div style="width:32px;height:32px;line-height:32px;border-radius:50%;background:#081f5c;color:#ffffff;text-align:center;font-size:13px;font-weight:900;">${index + 1}</div>
      </td>
      <td valign="top" style="padding:9px 18px ${bottomPadding} 10px;">
        <div style="margin:0 0 3px;font-size:15px;font-weight:900;color:#081f5c;">${escapeHtml(item.title)}</div>
        <div style="font-size:13px;line-height:1.5;color:#52617c;">${escapeHtml(item.description)}</div>
      </td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Your personal PrepHub plan</title>
  </head>
  <body style="margin:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color:#081f5c;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f8;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:30px 24px 26px;background:#081f5c;color:#ffffff;">
                <div style="font-size:26px;line-height:1.2;font-weight:900;letter-spacing:.8px;">DPA HELP CENTER</div>
                <div style="width:138px;height:5px;margin:9px auto;background:#d22630;border-radius:99px;"></div>
                <div style="margin-top:10px;font-size:11px;font-weight:800;letter-spacing:2.5px;color:#dce9ff;">HOMEBUYER PREPHUB</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 30px 36px;">
                <div style="font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:#0057b8;">Your personal preparation plan</div>
                <h1 style="margin:9px 0 12px;font-size:30px;line-height:1.1;font-weight:900;color:#081f5c;">${safeFirstName}, you&rsquo;re not denied&mdash;<span style="color:#d22630;">you&rsquo;re just unprepared.</span></h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#52617c;">Based on your responses, your homebuyer readiness score is <strong style="color:#0057b8;">${score}%</strong>. That is not a rejection. It is your starting point&mdash;and PrepHub gives you a clear path forward.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px;background:#eef5ff;border-radius:16px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="font-size:13px;font-weight:900;color:#081f5c;">YOUR READINESS SCORE</td>
                          <td align="right" style="font-size:24px;font-weight:900;color:#d22630;">${score}%</td>
                        </tr>
                      </table>
                      <div style="height:10px;margin-top:11px;background:#d9e2ef;border-radius:99px;overflow:hidden;">
                        <div style="width:${score}%;height:10px;background:#d22630;border-radius:99px;"></div>
                      </div>
                    </td>
                  </tr>
                </table>

                <h2 style="margin:0 0 9px;font-size:21px;line-height:1.2;font-weight:900;color:#081f5c;">Your next focus areas</h2>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#52617c;">Your plan is specific to the answers you provided. Start with these areas:</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#f6f8fb;border-radius:16px;">
                  ${focusRows}
                </table>

                <h2 style="margin:0 0 9px;font-size:21px;line-height:1.2;font-weight:900;color:#081f5c;">PrepHub keeps you moving</h2>
                <p style="margin:0 0 17px;font-size:15px;line-height:1.55;color:#52617c;">Organize your documents, prepare your credit, work on your debt-to-income position, and keep every step in one place so you never get lost in the process.</p>
                <div style="margin:0 0 24px;padding:18px;border-radius:16px;background:#fff3f4;color:#203765;font-size:14px;line-height:1.55;"><strong style="color:#081f5c;">Your goal:</strong> complete your preparation, reach 100% readiness, and get matched with homebuying programs that fit your needs.</div>

                <div style="padding-top:22px;border-top:1px solid #e4e9f1;text-align:center;">
                  <p style="margin:0 0 18px;font-size:15px;line-height:1.55;font-weight:700;color:#081f5c;">Your plan is ready. Log in to PrepHub and begin your first preparation step now.</p>
                  <a href="${safeLoginUrl}" style="display:block;padding:16px 18px;border-radius:13px;background:#d22630;color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:.6px;">LOG IN NOW</a>
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:19px 24px 22px;background:#f6f8fb;font-size:11px;line-height:1.5;color:#8792a6;">Your readiness score is based on your responses and is not a loan approval. Program availability and qualification requirements vary.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function preparationEmailText(
  firstName: string,
  score: number,
  focusAreas: Array<keyof typeof taskCatalog>,
  loginUrl: string,
) {
  const focusDetails: Record<keyof typeof taskCatalog, string> = {
    credit: "Prepare your credit: strengthen your credit profile and work toward the 640+ range used by many DPA programs.",
    dti: "Improve your debt-to-income position: review your income, monthly debts, and buying power.",
    job: "Document your work history: organize your stable work, school, military, or other qualifying income history.",
    taxes: "Prepare your tax records: gather the tax returns and income records your homebuying team may need to review.",
  };
  const areas: Array<keyof typeof taskCatalog> = focusAreas.length
    ? focusAreas
    : ["credit", "dti", "job", "taxes"];
  const focusList = areas.map((key, index) => `${index + 1}. ${focusDetails[key]}`).join("\n");

  return `${firstName}, you're not denied—you're just unprepared.

Based on your responses, your homebuyer readiness score is ${score}%. That is not a rejection. It is your starting point, and PrepHub gives you a clear path forward.

YOUR NEXT FOCUS AREAS
${focusList}

PREPHUB KEEPS YOU MOVING
Organize your documents, prepare your credit, work on your debt-to-income position, and keep every step in one place so you never get lost in the process.

Your goal is to complete your preparation, reach 100% readiness, and get matched with homebuying programs that fit your needs.

LOG IN NOW
${loginUrl}

Your readiness score is based on your responses and is not a loan approval. Program availability and qualification requirements vary.`;
}

async function sendPrepHubEmail(
  email: string,
  firstName: string,
  score: number,
  focusAreas: Array<keyof typeof taskCatalog>,
  loginUrl: string,
) {
  const apiKey = clean(Deno.env.get("RESEND_API_KEY"), 500);
  if (!apiKey) {
    console.error("Readiness email skipped: RESEND_API_KEY is missing.");
    return { ok: false, status: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "DPA Help Center PrepHub <ready@mail.dpahelpcenter.com>",
        to: [email],
        reply_to: "info@dpahelpcenter.com",
        subject: score === 100
          ? `${firstName}, you appear 100% ready—let's get you lender-ready`
          : `${firstName}, your ${score}% PrepHub plan is ready`,
        html: score === 100
          ? readyEmailHtml(firstName, loginUrl)
          : preparationEmailHtml(firstName, score, focusAreas, loginUrl),
        text: score === 100
          ? readyEmailText(firstName, loginUrl)
          : preparationEmailText(firstName, score, focusAreas, loginUrl),
        tags: [{
          name: "email_type",
          value: score === 100 ? "prephub_ready_100" : "prephub_below_100",
        }],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Readiness email failed", response.status, result);
      return { ok: false, status: `http_${response.status}` };
    }
    return { ok: true, status: "sent", id: clean(result.id, 250) || null };
  } catch (error) {
    console.error("Readiness email failed", error);
    return { ok: false, status: "request_failed" };
  }
}

async function sendPrepHubLoginEmail(
  email: string,
  firstName: string,
  loginUrl: string,
) {
  const apiKey = clean(Deno.env.get("RESEND_API_KEY"), 500);
  if (!apiKey) return { ok: false, status: "not_configured" };

  const safeFirstName = escapeHtml(firstName || "Homebuyer");
  const safeLoginUrl = escapeHtml(loginUrl);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "DPA Help Center PrepHub <ready@mail.dpahelpcenter.com>",
        to: [email],
        reply_to: "info@dpahelpcenter.com",
        subject: "Your secure PrepHub login link",
        html: `<!doctype html><html><body style="margin:0;background:#eef2f8;font-family:Arial,Helvetica,sans-serif;color:#081f5c;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;"><tr><td align="center" style="padding:28px 24px;background:#081f5c;color:#fff;"><div style="font-size:25px;font-weight:900;">DPA HELP CENTER</div><div style="width:135px;height:5px;margin:9px auto;background:#d22630;border-radius:99px;"></div><div style="font-size:11px;font-weight:800;letter-spacing:2.4px;color:#dce9ff;">HOMEBUYER PREPHUB</div></td></tr><tr><td style="padding:32px 30px 36px;"><h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;">${safeFirstName}, return to your PrepHub.</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#52617c;">Use the secure button below to continue your homebuyer preparation. This link can only be used once.</p><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:10px;background:#d22630;"><a href="${safeLoginUrl}" style="display:inline-block;padding:15px 22px;color:#fff;text-decoration:none;font-size:14px;font-weight:900;">LOG IN TO MY HOMEBUYER PREPHUB</a></td></tr></table><p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#71809a;">If you did not request this link, you can ignore this email.</p></td></tr></table></td></tr></table></body></html>`,
        text: `${firstName || "Homebuyer"}, return to your PrepHub.\n\nUse this secure one-time link to continue your homebuyer preparation:\n${loginUrl}\n\nIf you did not request this link, you can ignore this email.`,
        tags: [{ name: "email_type", value: "prephub_login_link" }],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: `http_${response.status}` };
    return { ok: true, status: "sent", id: clean(result.id, 250) || null };
  } catch (_error) {
    return { ok: false, status: "request_failed" };
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  try {
    const payload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (payload.action === "send_login") {
      const loginEmail = clean(payload.email, 320).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
        return json({ error: "Enter a valid email address." }, 400, origin);
      }

      const { data: loginLead } = await supabase
        .from("prephub_leads")
        .select("id,lead_id,first_name,current_readiness_score,focus_areas")
        .eq("email", loginEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!loginLead) return json({ ok: true }, 200, origin);

      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { data: recentLogin } = await supabase
        .from("lead_communications")
        .select("id")
        .eq("lead_id", loginLead.id)
        .eq("template_key", "prephub_login_link")
        .gte("occurred_at", oneMinuteAgo)
        .limit(1)
        .maybeSingle();
      if (recentLogin) {
        return json({ error: "A login email was just sent. Please wait one minute before requesting another." }, 429, origin);
      }

      const loginParams = new URLSearchParams({
        lead: loginLead.lead_id,
        score: String(loginLead.current_readiness_score || 0),
      });
      const loginFocusAreas = Array.isArray(loginLead.focus_areas) ? loginLead.focus_areas : [];
      for (const key of loginFocusAreas) {
        if (["credit", "dti", "job", "taxes"].includes(key)) loginParams.set(key, "1");
      }
      const redirectTo = `https://www.dpahelpcenter.com/prephub?${loginParams.toString()}`;
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: loginEmail,
        options: { redirectTo },
      });
      if (linkError || !linkData.properties?.action_link) {
        return json({ error: "We could not create the login link. Please try again." }, 503, origin);
      }

      const actionLink = new URL(linkData.properties.action_link);
      actionLink.searchParams.set("redirect_to", redirectTo);
      const sent = await sendPrepHubLoginEmail(
        loginEmail,
        clean(loginLead.first_name, 100) || "Homebuyer",
        actionLink.toString(),
      );

      await supabase.from("lead_communications").insert({
        lead_id: loginLead.id,
        channel: "email",
        direction: "outbound",
        provider: "resend",
        template_key: "prephub_login_link",
        subject: "Your secure PrepHub login link",
        summary: "Passwordless PrepHub login link",
        status: sent.ok ? "sent" : "failed",
        provider_message_id: "id" in sent ? sent.id : null,
        metadata: { email_status: sent.status },
        occurred_at: new Date().toISOString(),
      });

      if (!sent.ok) return json({ error: "We could not send the login email. Please try again." }, 503, origin);
      return json({ ok: true }, 200, origin);
    }

    const leadId = clean(payload.lead_id, 100);
    const email = clean(payload.email, 320).toLowerCase();
    const firstName = clean(payload.first_name, 100);
    const lastName = clean(payload.last_name, 100);
    const phone = clean(payload.phone, 30).replace(/\D/g, "");
    const score = Math.max(0, Math.min(100, Number(payload.readiness_score) || 0));

    if (!/^DPA-[A-Za-z0-9-]+$/.test(leadId)) return json({ error: "Invalid lead ID" }, 400, origin);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Valid email required" }, 400, origin);
    if (!firstName || !lastName || phone.length < 10) return json({ error: "Complete contact information required" }, 400, origin);

    const focusAreas = [] as Array<keyof typeof taskCatalog>;
    if (bool(payload.credit_640_plus) === false) focusAreas.push("credit");
    if (bool(payload.income_70k_plus) === false) focusAreas.push("dti");
    if (bool(payload.job_history_2yrs) === false) focusAreas.push("job");
    if (bool(payload.tax_returns_2yrs) === false) focusAreas.push("taxes");

    const { data: lead, error: leadError } = await supabase
      .from("prephub_leads")
      .upsert({
        lead_id: leadId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        city: clean(payload.city, 120),
        zip: clean(payload.zip, 20),
        home_price: Math.max(0, Number(payload.home_price) || 0),
        estimated_dpa: Math.max(0, Number(payload.estimated_dpa) || 0),
        credit_score: Math.max(0, Math.min(850, Number(payload.credit_score) || 0)),
        household_income: Math.max(0, Number(payload.household_income) || 0),
        employment_history: clean(payload.employment_history, 200),
        tax_return_history: clean(payload.tax_return_history, 200),
        initial_readiness_score: score,
        current_readiness_score: score,
        focus_areas: focusAreas,
        route: clean(payload.route, 250),
        results_url: clean(payload.results_url, 1000),
        assessment: payload,
      }, { onConflict: "lead_id" })
      .select("id")
      .single();

    if (leadError) throw leadError;

    await supabase.from("preparation_tasks").delete().eq("lead_id", lead.id).eq("completed", false);
    if (focusAreas.length) {
      const tasks = focusAreas.map((key) => ({
        lead_id: lead.id,
        task_key: key,
        ...taskCatalog[key],
        score_value: 25,
      }));
      const { error: taskError } = await supabase
        .from("preparation_tasks")
        .upsert(tasks, { onConflict: "lead_id,task_key" });
      if (taskError) throw taskError;
    }

    const helux = await forwardToHelux(payload);

    await supabase.from("helux_cases").upsert({
      lead_id: lead.id,
      direction: "outbound",
      qualification: score === 100 ? "qualified" : "unqualified",
      ai_agent: "Daisy",
      sequence_status: helux.ok ? "Calling" : "Ready",
      priority: score === 100 ? "High" : "Normal",
      max_attempts: 5,
      consent: "Confirmed",
      metadata: {
        time_zone: clean(payload.time_zone || "America/New_York", 100),
        source: clean(payload.source || "DPA Help Center", 200),
        helux_status: helux.status,
      },
    }, { onConflict: "lead_id,direction,qualification" });

    await supabase.from("integration_events").insert({
      lead_id: lead.id,
      integration: "helux_monday",
      event_type: "lead_intake",
      status: helux.ok ? "succeeded" : "failed",
      request_payload: { lead_id: leadId, readiness_score: score, route: clean(payload.route, 250) },
      response_payload: helux,
      error_message: helux.ok ? "" : helux.status,
      attempted_at: new Date().toISOString(),
    });

    const redirectTo = `https://www.dpahelpcenter.com/prephub?lead=${encodeURIComponent(leadId)}`;
    const userData = {
      first_name: firstName,
      readiness_score: score,
      focus_areas: focusAreas,
      ...(score === 100 ? { support_phone: "1-833-302-8953" } : {}),
    };

    let emailSent = false;
    let emailStatus = "temporarily_unavailable";
    let emailProviderId: string | null = null;

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo, data: userData },
    });

    if (!linkError && linkData.properties?.action_link) {
      const readinessEmail = await sendPrepHubEmail(
        email,
        firstName,
        score,
        focusAreas,
        linkData.properties.action_link,
      );
      emailSent = readinessEmail.ok;
      emailStatus = readinessEmail.status;
      emailProviderId = "id" in readinessEmail && typeof readinessEmail.id === "string" ? readinessEmail.id : null;
    } else {
      console.warn("PrepHub login link could not be generated", linkError?.message || "missing_action_link");
    }

    await supabase.from("lead_communications").insert({
      lead_id: lead.id,
      channel: "email",
      direction: "outbound",
      provider: "resend",
      template_key: score === 100 ? "prephub_ready_100" : "prephub_below_100",
      subject: score === 100 ? `${firstName}, you appear 100% ready` : `${firstName}, your personal PrepHub plan is ready`,
      summary: score === 100 ? "100% readiness and lender-file preparation email" : "Personal readiness preparation plan email",
      status: emailSent ? "sent" : "failed",
      provider_message_id: emailProviderId,
      metadata: { email_status: emailStatus, readiness_score: score },
      occurred_at: new Date().toISOString(),
    });

    await supabase.from("integration_events").insert({
      lead_id: lead.id,
      integration: "resend",
      event_type: score === 100 ? "ready_email" : "preparation_email",
      status: emailSent ? "succeeded" : "failed",
      external_id: emailProviderId,
      response_payload: { email_status: emailStatus },
      error_message: emailSent ? "" : emailStatus,
      attempted_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      lead_id: leadId,
      email_sent: emailSent,
      email_status: emailStatus,
      helux,
    }, 200, origin);
  } catch (error) {
    console.error("PrepHub intake failed", error);
    return json({ error: "We could not save your PrepHub plan. Please try again." }, 500, origin);
  }
});
