/** JWT sign/verify using jose (Edge-compatible) */

import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'native-think-dev-secret-do-not-use-in-production');

export async function signToken(payload: { userId: string; email: string }): Promise<string> {
  return new SignJWT({ sub: payload.userId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      userId: payload.sub as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}
