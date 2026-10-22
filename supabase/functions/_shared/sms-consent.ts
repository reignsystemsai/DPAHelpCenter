// Keep the disclosure version aligned with the public optional checkbox.
export const SMS_DISCLOSURE_VERSION = "2026-10-22";
export const SMS_DISCLOSURE_TEXT = "I agree to receive recurring automated text messages from DPA Help Center about my PrepHub preparation, account access, appointments, and requested callbacks at the number provided. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is optional and is not a condition of purchase or receiving services.";
export function normalizeSmsConsent(input: any, phone: string, receivedAt = new Date().toISOString()) {
  const current = input?.disclosure_version === SMS_DISCLOSURE_VERSION;
  const optedIn = current && input?.opted_in === true;
  return {
    opted_in: optedIn,
    phone,
    disclosure_version: current ? SMS_DISCLOSURE_VERSION : null,
    disclosure_text: current ? SMS_DISCLOSURE_TEXT : null,
    source_url: current ? "https://www.dpahelpcenter.com/" : null,
    privacy_url: "https://www.dpahelpcenter.com/privacy/",
    terms_url: "https://www.dpahelpcenter.com/sms-terms/",
    received_at: receivedAt,
    client_submitted_at: current && typeof input.client_submitted_at === "string" && Number.isFinite(Date.parse(input.client_submitted_at)) ? input.client_submitted_at.slice(0,40) : null,
    capture_method: current ? "optional_web_checkbox" : "not_provided",
    evidence_type: "form_submission",
  };
}
