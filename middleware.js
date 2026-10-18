import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { accessMode, isAllowedEmail } from "./lib/access-rules";

const APP = ["/home", "/search", "/compose", "/saved", "/profile"];

// While Huesy is a waitlist, brand setup sits behind sign in too: the public
// site only collects places on the list. Open mode restores the original
// funnel, where people try setup before they are asked for an account.
const protectedRoutes = () => (accessMode() === "open" ? APP : [...APP, "/onboarding"]);

const matches = (path, list) => list.some((p) => path === p || path.startsWith(`${p}/`));

// Keeps the Supabase session cookie fresh on every request, sends signed out
// visitors on app routes to the login page, and sends signed in accounts
// without early access to /waitlist. Does nothing when accounts are not
// configured, so local mode is untouched.
const ACCOUNT_PAGES = ["/login", "/signup", "/waitlist", "/reset-password"];

export async function middleware(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  // The public site never needs the session, so it skips the round trip to
  // Supabase entirely.
  const path = request.nextUrl.pathname;
  if (!matches(path, protectedRoutes()) && !ACCOUNT_PAGES.includes(path)) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const go =(pathname, params = {}) => {
    const to = request.nextUrl.clone();
    to.pathname = pathname;
    to.search = "";
    for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
    const redirect = NextResponse.redirect(to);
    // Carry any refreshed session cookie over to the redirect.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  };

  if (matches(path, protectedRoutes())) {
    if (!user) return go("/login", { next: path });
    if (!isAllowedEmail(user.email)) return go("/waitlist");
  }

  if (user && (path === "/login" || path === "/signup")) {
    return go(isAllowedEmail(user.email) ? "/home" : "/waitlist");
  }

  if (path === "/waitlist" && !user) return go("/", { join: "1" });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|opengraph-image|api/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
