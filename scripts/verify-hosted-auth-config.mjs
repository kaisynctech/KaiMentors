import { verifyHostedAuthPolicy } from "./lib/hosted-auth-policy.mjs";

const projectRef = process.env.SUPABASE_PROJECT_REF ?? "jsbpfhfmumjbrnymhtvq";
const result = await verifyHostedAuthPolicy({
  accessToken: process.env.SUPABASE_ACCESS_TOKEN,
  projectRef,
});
console.log(JSON.stringify(result, null, 2));
