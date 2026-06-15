export function getPortalBrandingUrl(path: string | null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !path) return null;

  return `${url}/storage/v1/object/public/portal-branding/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
