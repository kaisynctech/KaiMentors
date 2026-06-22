import { readFile } from "node:fs/promises";
import { verifyHostedAuthPolicy } from "./lib/hosted-auth-policy.mjs";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "jsbpfhfmumjbrnymhtvq";
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN is required.");
if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("A valid Supabase project reference is required.");

const templates = {
  confirmation: { subject: "Confirm your KaiMentors email", path: "supabase/templates/confirmation.html" },
  invite: { subject: "Activate your KaiMentors workspace", path: "supabase/templates/invite.html" },
  recovery: { subject: "Reset your KaiMentors password", path: "supabase/templates/recovery.html" },
  magic_link: { subject: "Your KaiMentors verification code", path: "supabase/templates/magic_link.html" },
  email_change: { subject: "Confirm your KaiMentors email change", path: "supabase/templates/email_change.html" },
  reauthentication: { subject: "Your KaiMentors reauthentication code", path: "supabase/templates/reauthentication.html" },
};
const linkPattern = /ConfirmationURL|TokenHash|SiteURL|RedirectTo|<a\b|https?:\/\//i;
const body = {
  mailer_otp_length: 6,
  mailer_otp_exp: 900,
  mailer_secure_email_change_enabled: true,
};

for (const [name, template] of Object.entries(templates)) {
  const content = await readFile(template.path, "utf8");
  if (!content.includes("{{ .Token }}") || linkPattern.test(content)) {
    throw new Error(`Local ${name} template is not token-only.`);
  }
  body[`mailer_subjects_${name}`] = template.subject;
  body[`mailer_templates_${name}_content`] = content;
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});
if (!response.ok) throw new Error(`Hosted Auth template deployment failed (${response.status}).`);

const verified = await verifyHostedAuthPolicy({ accessToken, projectRef });
console.log(JSON.stringify({ deployed: true, verified }, null, 2));
