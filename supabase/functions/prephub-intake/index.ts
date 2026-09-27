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

function bool(value: unknown): boolean | null {
  if (value === true || value === "Yes") return true;
  if (value === false || value === "No") return false;
  return null;
}

const taskCatalog = {
  credit: {
    title: "Credit Readiness",
    description: "Build toward the 640+ credit range used by many DPA programs.",
    action_url: "https://www.creditjump.ai",
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
    action_url: "https://www.dpahelpcenter.com/job",
    position: 3,
  },
  taxes: {
    title: "Tax Document Readiness",
    description: "Prepare the tax records needed to verify qualifying income.",
    action_url: "https://www.estimatemytaxreturn.com",
    position: 4,
  },
} as const;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  try {
    const payload = await req.json();
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

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

    const redirectTo = `https://www.dpahelpcenter.com/prephub?lead=${encodeURIComponent(leadId)}`;
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          first_name: firstName,
          readiness_score: score,
          focus_areas: focusAreas,
          support_phone: "1-833-302-8953",
        },
      },
    });
    if (authError) throw authError;

    return json({ ok: true, lead_id: leadId, email_sent: true }, 200, origin);
  } catch (error) {
    console.error("PrepHub intake failed", error);
    return json({ error: "We could not save your PrepHub plan. Please try again." }, 500, origin);
  }
});
