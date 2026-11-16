import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { safeEqual, sign, unsign, verifySecret } from "./secrets";
import { store } from "./store";
import type { Hospital, HospitalUser } from "./types";

const HOSPITAL_COOKIE = "ireti_hospital";
const ADMIN_COOKIE = "ireti_admin";
const MAX_AGE = 60 * 60 * 8; // one working shift

interface Session {
  sub: string;
  email?: string;
  /** Fingerprint of the access code: changing the code signs out every other session. */
  v?: string;
  exp: number;
}

const codeVersion = (accessCodeHash: string) =>
  createHash("sha256").update(accessCodeHash).digest("base64url").slice(0, 16);

// Compared against when the email is unknown, so a wrong email takes as long
// as a wrong code and response times don't reveal which emails have accounts.
const DUMMY_HASH = "00000000000000000000000000000000:" + "0".repeat(64);

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

export async function signInHospital(email: string, code: string) {
  const user = await store.getHospitalUserByEmail(email);
  const ok = verifySecret(code, user?.accessCodeHash ?? DUMMY_HASH);
  if (!user || !ok) return false;
  await startHospitalSession(user);
  return true;
}

export async function startHospitalSession(user: HospitalUser) {
  const jar = await cookies();
  const session: Session = { sub: user.id, email: user.email, v: codeVersion(user.accessCodeHash), exp: Date.now() + MAX_AGE * 1000 };
  jar.set(HOSPITAL_COOKIE, sign(session), cookieOpts);
}

/**
 * The signed-in hospital user, verified or not: a hospital waiting for review
 * can sign in and follow its status. Anything that touches campaigns or money
 * must also check `hospital.verified`.
 */
export async function currentHospitalUser(): Promise<
  { user: HospitalUser; hospital: Hospital } | null
> {
  const jar = await cookies();
  const s = unsign<Session>(jar.get(HOSPITAL_COOKIE)?.value);
  if (!s?.email || s.exp < Date.now()) return null;
  const user = await store.getHospitalUserByEmail(s.email);
  if (!user || user.id !== s.sub || s.v !== codeVersion(user.accessCodeHash)) return null;
  const hospital = await store.getHospital(user.hospitalId);
  if (!hospital) return null;
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
  // Compare digests: equal length, so the comparison leaks nothing about the password's length.
  const digest = (x: string) => createHash("sha256").update(x).digest("hex");
  if (!expected || !safeEqual(digest(password), digest(expected))) return false;
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
