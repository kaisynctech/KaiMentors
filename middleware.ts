import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isFakeStudentLoginPath,
  isPortalSlug,
  isSafeInternalPath,
  studentHomeHref,
} from "@/lib/academy-routes";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "@/lib/domains/hostnames";
import { lookupLatestStudentPortalSlug } from "@/lib/student-destination";

function unauthenticatedLoginUrl(
  request: NextRequest,
  path: string,
  customDomain: boolean,
) {
  const loginUrl = request.nextUrl.clone();
  const portalSlug = request.nextUrl.searchParams.get("portal");
  const safeSlug = isPortalSlug(portalSlug) ? portalSlug : null;

  loginUrl.search = "";
  if (!customDomain && path.startsWith("/student") && safeSlug) {
    loginUrl.pathname = `/portal/${safeSlug}/login`;
  } else {
    loginUrl.pathname = "/login";
  }

  let nextTarget = `${path}${request.nextUrl.search}`;
  if (isFakeStudentLoginPath(path)) {
    nextTarget = customDomain
      ? "/academy"
      : safeSlug
        ? `/student?portal=${safeSlug}`
        : "/";
  }
  if (isSafeInternalPath(nextTarget)) {
    loginUrl.searchParams.set("next", nextTarget);
  }
  return loginUrl;
}

function customDomainDestination(request: NextRequest, hostname: string) {
  const path = request.nextUrl.pathname;
  const destination = request.nextUrl.clone();

  if (path === "/login") {
    destination.pathname = `/domain-sites/${hostname}/login`;
    return destination;
  }
  if (path === "/academy" || path.startsWith("/academy/")) {
    destination.pathname = path.replace(/^\/academy/, "/student");
    return destination;
  }

  destination.pathname = `/domain-sites/${hostname}${path === "/" ? "" : path}`;
  return destination;
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const hostname = normalizeRequestHostname(
    request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      request.nextUrl.hostname,
  );
  const customDomain = !isPlatformHostname(hostname);

  if (!customDomain && path.startsWith("/domain-sites/")) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/";
    return NextResponse.redirect(destination);
  }

  if (
    customDomain &&
    (path.startsWith("/admin") ||
      path.startsWith("/onboarding") ||
      path.startsWith("/account-setup") ||
      path.startsWith("/recover"))
  ) {
    const platformUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (platformUrl) {
      return NextResponse.redirect(new URL(path, platformUrl));
    }
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    return NextResponse.redirect(destination);
  }

  if (
    customDomain &&
    (path === "/student" || path.startsWith("/student/"))
  ) {
    const destination = request.nextUrl.clone();
    destination.pathname = path.replace(/^\/student/, "/academy");
    return NextResponse.redirect(destination);
  }

  if (customDomain && isFakeStudentLoginPath(path)) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    destination.search = "";
    return NextResponse.redirect(destination);
  }

  if (!customDomain && isFakeStudentLoginPath(path)) {
    const portalSlug = request.nextUrl.searchParams.get("portal");
    const destination = request.nextUrl.clone();
    destination.search = "";
    if (isPortalSlug(portalSlug)) {
      destination.pathname = `/portal/${portalSlug}/login`;
      destination.searchParams.set("next", `/student?portal=${portalSlug}`);
    } else {
      destination.pathname = "/login";
    }
    return NextResponse.redirect(destination);
  }

  const makeResponse = () => {
    if (
      customDomain &&
      (path.startsWith("/dashboard") || path.startsWith("/join/"))
    ) {
      // These paths are served natively on custom domains — no domain-sites rewrite.
      return NextResponse.next({ request });
    }
    return customDomain
      ? NextResponse.rewrite(customDomainDestination(request, hostname), {
          request,
        })
      : NextResponse.next({ request });
  };

  let response = makeResponse();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options: CookieOptions;
        }>,
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = makeResponse();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const logicalPath =
    customDomain && (path === "/academy" || path.startsWith("/academy/"))
      ? path.replace(/^\/academy/, "/student")
      : path;
  const protectedRoute =
    logicalPath.startsWith("/dashboard") ||
    logicalPath.startsWith("/admin") ||
    logicalPath.startsWith("/student");

  if (!protectedRoute) return response;

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return copyCookies(
      response,
      NextResponse.redirect(unauthenticatedLoginUrl(request, path, customDomain)),
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (logicalPath.startsWith("/admin") && profile?.role !== "super_admin") {
    return copyCookies(
      response,
      NextResponse.redirect(new URL("/dashboard", request.url)),
    );
  }
  if (logicalPath.startsWith("/dashboard") && profile?.role !== "trader") {
    if (profile?.role === "super_admin") {
      // Always allow super_admin through to /dashboard.
      // The dashboard page resolves traderId via its own DB query and handles
      // the null case gracefully. The previous trader_members check here
      // was unreliable in the Edge Runtime JWT context and caused a redirect
      // loop for platform owners who also hold a trader_members row.
      return response;
    }

    let destination = "/login";
    if (profile?.role === "student") {
      if (customDomain) {
        destination = "/academy";
      } else {
        const slug = await lookupLatestStudentPortalSlug(supabase, data.user.id);
        destination = slug ? studentHomeHref(slug, false) : "/";
      }
    }
    return copyCookies(
      response,
      NextResponse.redirect(new URL(destination, request.url)),
    );
  }
  if (logicalPath.startsWith("/student") && profile?.role !== "student") {
    const platformUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    // A trader who also holds a student application must be allowed through.
    // super_admin never has student applications and goes to /admin immediately.
    if (profile?.role === "trader") {
      const { data: studentApp } = await supabase
        .from("student_applications")
        .select("id")
        .eq("student_user_id", data.user.id)
        .limit(1)
        .maybeSingle();
      if (studentApp) return response;
    }
    const destination =
      profile?.role === "super_admin" ? "/admin" : "/dashboard";
    return copyCookies(
      response,
      NextResponse.redirect(new URL(destination, platformUrl)),
    );
  }

  if (
    !customDomain &&
    logicalPath.startsWith("/student") &&
    (profile?.role === "student" || profile?.role === "trader") &&
    !isPortalSlug(request.nextUrl.searchParams.get("portal"))
  ) {
    const slug = await lookupLatestStudentPortalSlug(supabase, data.user.id);
    if (slug) {
      const dest = request.nextUrl.clone();
      dest.searchParams.set("portal", slug);
      return copyCookies(response, NextResponse.redirect(dest));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/|auth/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
