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
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return response({ error: "Authentication required" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return response({ error: "Invalid session" }, 401);

  const { data: member } = await supabase.from("manager_members").select("user_id,active").eq("user_id", authData.user.id).eq("active", true).maybeSingle();
  if (!member) return response({ error: "Manager access required" }, 403);

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 80);
  if (action !== "send_buyer_email") return response({ error: "Unsupported action" }, 400);

  const leadId = clean(body.lead_id, 80);
  const { data: lead, error: leadError } = await supabase.from("prephub_leads").select("id,email,first_name,current_readiness_score").eq("id", leadId).single();
  if (leadError || !lead) return response({ error: "Buyer record not found" }, 404);

  const resendKey = clean(Deno.env.get("RESEND_API_KEY"), 500);
  if (!resendKey) return response({ error: "Resend is not configured" }, 503);
  const firstName = escapeHtml(lead.first_name || "Homebuyer");
  const loginUrl = "https://www.dpahelpcenter.com/prephub";
  const subject = `${lead.first_name || "Homebuyer"}, your PrepHub next steps`;
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "DPA Help Center <ready@mail.dpahelpcenter.com>",
      reply_to: "help@dpahelpcenter.com",
      to: [lead.email],
      subject,
      html: `<!doctype html><html><body style="margin:0;background:#eef2f8;font-family:Arial,sans-serif;color:#081f5c"><div style="max-width:620px;margin:24px auto;background:#fff;border-radius:18px;overflow:hidden"><div style="padding:28px;background:#081f5c;color:#fff;text-align:center;font-size:24px;font-weight:900">DPA HELP <span style="color:#d22630">CENTER</span></div><div style="padding:30px"><h1 style="margin:0 0 12px;font-size:28px">Hi ${firstName},</h1><p style="color:#52617c;line-height:1.6">Your homebuyer preparation is waiting in PrepHub. Log in to review your preparation, organize your documents, and keep your next steps moving.</p><p style="color:#52617c;line-height:1.6">Your current preparation score is <strong>${Number(lead.current_readiness_score) || 0}%</strong>. This score supports preparation and is not a loan approval.</p><a href="${loginUrl}" style="display:block;margin-top:22px;padding:15px;border-radius:12px;background:#d22630;color:#fff;text-align:center;text-decoration:none;font-weight:900">LOG IN TO PREPHUB</a></div></div></body></html>`,
      text: `Hi ${lead.first_name || "Homebuyer"},\n\nYour homebuyer preparation is waiting in PrepHub. Log in to review your preparation, organize your documents, and keep moving.\n\n${loginUrl}`,
      tags: [{ name: "email_type", value: "manager_prep_followup" }],
    }),
  });
  const emailResult = await emailResponse.json().catch(() => ({}));
  const sent = emailResponse.ok;

  await supabase.from("lead_communications").insert({
    lead_id: lead.id,
    channel: "email",
    direction: "outbound",
    provider: "resend",
    template_key: "manager_prep_followup",
    subject,
    summary: "PrepHub follow-up sent from Network Manager",
    status: sent ? "sent" : "failed",
    provider_message_id: sent ? clean(emailResult.id, 250) || null : null,
    metadata: { initiated_by: authData.user.id },
    occurred_at: new Date().toISOString(),
  });

  return sent ? response({ ok: true, id: emailResult.id }) : response({ error: clean(emailResult.message || "Email could not be sent") }, 502);
});
