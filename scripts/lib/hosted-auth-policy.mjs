const TEMPLATE_NAMES = ["confirmation", "invite", "recovery", "magic_link", "email_change", "reauthentication"];
const LINK_PATTERN = /ConfirmationURL|TokenHash|SiteURL|RedirectTo|<a\b|https?:\/\//i;

export async function verifyHostedAuthPolicy({ accessToken, projectRef }) {
  if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
  if (!projectRef) throw new Error("SUPABASE_PROJECT_REF is required.");

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Hosted Auth configuration read failed (${response.status}).`);

  const config = await response.json();
  const entries = Object.entries(config).filter(
    ([key, value]) => key.includes("template") && key.endsWith("content") && typeof value === "string",
  );
  const templates = Object.fromEntries(
    TEMPLATE_NAMES.map((name) => {
      const entry = entries.find(([key]) => key.includes(name));
      const content = entry?.[1] ?? "";
      return [name, {
        present: Boolean(entry),
        hasOtpToken: content.includes("{{ .Token }}"),
        hasAuthenticationLink: LINK_PATTERN.test(content),
      }];
    }),
  );
  const otpLength = Number(config.mailer_otp_length ?? config.otp_length);
  const otpExpirySeconds = Number(config.mailer_otp_exp ?? config.otp_expiry);
  const secureEmailChange = config.mailer_secure_email_change_enabled ?? config.secure_email_change_enabled;
  const validTemplates = Object.values(templates).every(
    (template) => template.present && template.hasOtpToken && !template.hasAuthenticationLink,
  );

  if (!validTemplates || otpLength !== 6 || otpExpirySeconds !== 900 || secureEmailChange !== true) {
    throw new Error(`Hosted Auth OTP policy verification failed: ${JSON.stringify({ templates, otpLength, otpExpirySeconds, secureEmailChange })}`);
  }

  return {
    projectRef,
    verificationMethod: "management_api_content_inspection",
    verifiedAt: new Date().toISOString(),
    templates,
    otpLength,
    otpExpirySeconds,
    secureEmailChange,
  };
}
