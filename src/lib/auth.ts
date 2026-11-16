import "server-only";
import { cookies } from "next/headers";
import { safeEqual, sign, unsign, verifySecret } from "./secrets";
import { store } from "./store";
import type { Hospital, HospitalUser } from "./types";

const HOSPITAL_COOKIE = "ireti_hospital";
const ADMIN_COOKIE = "ireti_admin";
const MAX_AGE = 60 * 60 * 8; // one working shift

interface Session {
  sub: string;
  email?: string;
  exp: number;
}

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

export async function signInHospital(email: string, code: string) {
  const user = await store.getHospitalUserByEmail(email);
  if (!user || !verifySecret(code, user.accessCodeHash)) return false;
  const jar = await cookies();
  const session: Session = { sub: user.id, email: user.email, exp: Date.now() + MAX_AGE * 1000 };
  jar.set(HOSPITAL_COOKIE, sign(session), cookieOpts);
  return true;
}

export async function currentHospitalUser(): Promise<
  { user: HospitalUser; hospital: Hospital } | null
> {
  const jar = await cookies();
  const s = unsign<Session>(jar.get(HOSPITAL_COOKIE)?.value);
  if (!s?.email || s.exp < Date.now()) return null;
  const user = await store.getHospitalUserByEmail(s.email);
  if (!user || user.id !== s.sub) return null;
  const hospital = await store.getHospital(user.hospitalId);
  if (!hospital || !hospital.verified) return null;
  return { user, hospital };
}

export async function signOutHospital() {
  const jar = await cookies();
  jar.delete(HOSPITAL_COOKIE);
}

function adminPassword() {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  if (process.env.NODE_ENV === "production") return null;
  return "ireti-admin";
}

export async function signInAdmin(password: string) {
  const expected = adminPassword();
  if (!expected || !safeEqual(password, expected)) return false;
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, sign({ sub: "admin", exp: Date.now() + MAX_AGE * 1000 }), cookieOpts);
  return true;
}

export async function isAdmin() {
  const jar = await cookies();
  const s = unsign<Session>(jar.get(ADMIN_COOKIE)?.value);
  return Boolean(s && s.sub === "admin" && s.exp > Date.now());
}

export async function signOutAdmin() {
  (await cookies()).delete(ADMIN_COOKIE);
}
