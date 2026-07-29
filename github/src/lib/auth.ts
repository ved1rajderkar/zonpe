import bcryptjs from "bcryptjs";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

// JWT Token generation
export async function generateAccessToken(payload: TokenPayload): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("jobtrack")
    .setAudience("jobtrack-users")
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function generateRefreshToken(payload: TokenPayload): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("jobtrack-refresh")
    .setAudience("jobtrack-users")
    .setExpirationTime(env.JWT_REFRESH_EXPIRES_IN)
    .sign(secret);
}

export async function generateTokens(payload: TokenPayload) {
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(payload),
    generateRefreshToken(payload),
  ]);
  return { accessToken, refreshToken };
}

// JWT Token verification
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: "jobtrack",
      audience: "jobtrack-users",
    });
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: "jobtrack-refresh",
      audience: "jobtrack-users",
    });
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

// Cookie helpers
export function setAuthCookies(
  setCookie: (name: string, value: string, options?: string) => void,
  accessToken: string,
  refreshToken: string
) {
  const cookieOptions = (maxAge: number) =>
    `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; ${env.NODE_ENV === "production" ? "Secure; " : ""}`;

  setCookie("access_token", accessToken, cookieOptions(7 * 24 * 60 * 60));
  setCookie("refresh_token", refreshToken, cookieOptions(30 * 24 * 60 * 60));
}

export function clearAuthCookies(setCookie: (name: string, value: string, options?: string) => void) {
  setCookie("access_token", "", "Path=/; HttpOnly; Max-Age=0");
  setCookie("refresh_token", "", "Path=/; HttpOnly; Max-Age=0");
}

// Get user from token
export async function getUserFromToken(token: string): Promise<AuthUser | null> {
  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user || !user.isActive) return null;
  return user;
}

// Token from header or cookie
export function extractToken(authorization: string | undefined, cookieHeader: string | undefined): string | null {
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7);
  }
  if (cookieHeader) {
    const match = cookieHeader.match(/access_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

// Generate tracking token
export function generateTrackingToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
