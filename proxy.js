import { NextResponse } from "next/server";

// Basic-auth for the whole site (data is Telkomsel-confidential).
// Active only when BASIC_AUTH_USER and BASIC_AUTH_PASS are set (Vercel → Settings → Environment Variables).
// Local `npm run dev` without those variables runs open.
export function proxy(req) {
  const user = process.env.BASIC_AUTH_USER, pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();
  const h = req.headers.get("authorization") || "";
  if (h.startsWith("Basic ")) {
    const s = atob(h.slice(6)), i = s.indexOf(":");
    const u = s.slice(0, i), p = s.slice(i + 1);
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="PBA"' } });
}
export const config = { matcher: "/:path*" };
