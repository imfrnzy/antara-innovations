// Squall's scenario bank. Plain data, no logic. Each scenario tests one
// judgement call under time pressure, not visual deepfake detection, since
// the real failure point in every case study is human process, not eyesight.

export const ENGINE_VERSION = "squall-1.0";
export const ROUND_SECONDS = 25;

export const MODULES = [
  { value: "bank", label: "Banking and payments" },
  { value: "insurer", label: "Claims and underwriting" },
];

export const DECISIONS = [
  { value: "genuine", label: "Genuine, act on it" },
  { value: "fake", label: "Fake or manipulated" },
  { value: "escalate", label: "Not sure, escalate it" },
];

export const CONFIDENCE = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// truth: what the right call actually is. "escalate" means the honest
// answer is genuine uncertainty, guessing either way here is the failure.
export const SCENARIOS = [
  // ---------- banking and payments ----------
  {
    id: "bank_cfo_whatsapp", module: "bank", truth: "fake",
    text: "A WhatsApp message, apparently from your CFO: \u201CIn a board meeting, can't call. Push \u00A348,200 to this new supplier today, invoice attached, I'll explain later. Don't loop in Priya, it's time-sensitive.\u201D",
    why: "Urgency, secrecy and an instruction to skip the usual sign-off are the three classic markers, not the channel itself.",
  },
  {
    id: "bank_recurring_email", module: "bank", truth: "genuine",
    text: "An email from your CFO's normal account, sent during office hours, about a supplier you've paid every month for a year, asking finance to run the payment a day early because of a bank holiday.",
    why: "Known supplier, known reason, no pressure to bypass process. Nothing here should trigger a second look.",
  },
  {
    id: "bank_bank_details_call", module: "bank", truth: "escalate",
    text: "A customer calls, caller ID matches their usual number, asks to change the bank details on their account \u201Cbecause I've switched banks\u201D, then immediately asks about a large transfer going out today.",
    why: "Caller ID alone isn't proof any more. A bank-detail change followed immediately by a large transfer is the exact sequence fraud training warns about.",
  },
  {
    id: "bank_it_slack", module: "bank", truth: "fake",
    text: "An internal Slack message, apparently from IT: \u201CYour access will be suspended in 10 minutes unless you verify your credentials at this link.\u201D The link isn't your company's domain.",
    why: "A deadline measured in minutes and an unfamiliar domain are built to stop you thinking. IT never asks for credentials this way.",
  },
  {
    id: "bank_resend_report", module: "bank", truth: "genuine",
    text: "A colleague messages asking you to resend a report you already sent last week, says they lost the email.",
    why: "Mundane, low stakes, nothing to gain from faking it. Treating everything as suspicious is its own failure mode.",
  },
  {
    id: "bank_new_supplier", module: "bank", truth: "escalate",
    text: "A new supplier's invoice is correct in every detail, but it's the first payment to this supplier and the bank account is in a different country to their registered address.",
    why: "Nothing here is definitely wrong, but a first payment plus a mismatched country is exactly the pattern worth a two-minute check before the money moves.",
  },

  // ---------- claims and underwriting ----------
  {
    id: "ins_shadow_photos", module: "insurer", truth: "fake",
    text: "A motor claim includes three photos of the same dent from slightly different angles, but the shadows fall in different directions in each one.",
    why: "Inconsistent shadow direction across supposedly-same-scene photos is one of the most reliable tells of composited or AI-generated images.",
  },
  {
    id: "ins_phone_reflection", module: "insurer", truth: "genuine",
    text: "A claim photo shows realistic dust, uneven lighting, and a faint reflection of the photographer's phone in the car's paintwork.",
    why: "Small imperfections like a reflection of the phone taking the photo are hard to fake and rarely appear in synthetic images.",
  },
  {
    id: "ins_cover_timing", module: "insurer", truth: "escalate",
    text: "A claimant's account of the accident is detailed and consistent, but was submitted eleven minutes after their comprehensive cover was upgraded.",
    why: "The story alone doesn't prove anything either way. The timing relative to the cover change is what should trigger a closer look, not the narrative.",
  },
  {
    id: "ins_vat_mismatch", module: "insurer", truth: "fake",
    text: "A repair invoice is itemised and professional, but the garage's VAT number doesn't match any registered business, and the contact number listed is a mobile, not a landline.",
    why: "A polished invoice format doesn't verify anything. The VAT number and business registration are the parts that are actually checkable.",
  },
  {
    id: "ins_storm_data", module: "insurer", truth: "genuine",
    text: "A claimant sends a blurry night-time photo, at an awkward angle, of storm damage to a fence. Weather station data confirms a storm hit their postcode that night.",
    why: "Poor photo quality is normal for a genuine, unplanned incident. On its own it's a mild positive signal, not a red flag.",
  },
  {
    id: "ins_identical_phrasing", module: "insurer", truth: "escalate",
    text: "A claims note reads fluently and hits every required field exactly, phrased almost identically to a claim from a different customer submitted the same week.",
    why: "Near-identical phrasing across unrelated claims is worth checking for a shared source, whether that's coaching, a script, or one person filing under two names, not something to wave through or reject outright.",
  },
];
