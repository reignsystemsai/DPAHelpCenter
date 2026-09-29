import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const normalizeEmail = (value: unknown) => clean(value, 254).toLowerCase();

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = clean(Deno.env.get("RESEND_API_KEY"), 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40);
  const email = normalizeEmail(body.email);
  if (!email) return response({ error: "Enter your authorized email." }, 400);

  const { data: member } = await supabase
    .from("manager_members")
    .select("user_id,email,display_name,active")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();
  if (!member) return response({ error: "This email does not have Network Manager access." }, 403);

  if (action === "request_code") {
    if (!resendKey) return response({ error: "Email delivery is not configured." }, 503);
    const { data: existing } = await supabase
      .from("manager_login_codes")
      .select("requested_at")
      .eq("email", email)
      .maybeSingle();
    if (existing && Date.now() - new Date(existing.requested_at).getTime() < 60_000) {
      return response({ error: "A code was just sent. Please wait one minute before requesting another." }, 429);
    }

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const codeHash = await digest(`${email}:${code}:${serviceRoleKey}`);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error: saveError } = await supabase.from("manager_login_codes").upsert({
      email,
      code_hash: codeHash,
      requested_at: new Date().toISOString(),
      expires_at: expiresAt,
      attempts: 0,
      used_at: null,
    });
    if (saveError) return response({ error: "The login code could not be created." }, 500);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "DPA Help Center <ready@mail.dpahelpcenter.com>",
        reply_to: "help@dpahelpcenter.com",
        to: [email],
        subject: `${code} is your Network Manager code`,
        html: `<!doctype html><html><body style="margin:0;background:#eef2f8;font-family:Arial,sans-serif;color:#081f5c"><div style="max-width:560px;margin:28px auto;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e0e6f0"><div style="padding:26px;background:#081f5c;color:#fff;text-align:center;font-size:23px;font-weight:900">DPA HELP <span style="color:#d22630">CENTER</span></div><div style="padding:34px;text-align:center"><p style="margin:0 0 8px;color:#52617c;font-size:14px">Your Network Manager sign-in code is</p><div style="margin:18px 0;color:#081f5c;font-size:42px;font-weight:900;letter-spacing:10px">${code}</div><p style="margin:0;color:#52617c;font-size:13px;line-height:1.6">Enter this code on the same Network Manager screen. It expires in 10 minutes and can only be used once.</p></div></div></body></html>`,
        text: `Your DPA Help Center Network Manager code is ${code}. It expires in 10 minutes and can only be used once.`,
        tags: [{ name: "email_type", value: "manager_login_code" }],
      }),
    });
    if (!emailResponse.ok) {
      await supabase.from("manager_login_codes").delete().eq("email", email);
      return response({ error: "The login email could not be sent." }, 502);
    }
    return response({ ok: true, expires_in: 600 });
  }

  if (action === "verify_code") {
    const code = clean(body.code, 6);
    if (!/^\d{6}$/.test(code)) return response({ error: "Enter the six-digit code from your email." }, 400);
    const { data: login } = await supabase.from("manager_login_codes").select("*").eq("email", email).maybeSingle();
    if (!login || login.used_at || new Date(login.expires_at).getTime() < Date.now()) {
      return response({ error: "That code has expired. Request a new one." }, 400);
    }
    if (login.attempts >= 5) return response({ error: "Too many attempts. Request a new code." }, 429);

    const submittedHash = await digest(`${email}:${code}:${serviceRoleKey}`);
    if (submittedHash !== login.code_hash) {
      await supabase.from("manager_login_codes").update({ attempts: login.attempts + 1 }).eq("email", email);
      return response({ error: "That code is not correct." }, 400);
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) return response({ error: "A secure session could not be created." }, 500);
    await supabase.from("manager_login_codes").update({ used_at: new Date().toISOString() }).eq("email", email);
    return response({ ok: true, token_hash: tokenHash });
  }

  return response({ error: "Unsupported action" }, 400);
});
