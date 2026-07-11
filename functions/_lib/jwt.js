/** JWT sign/verify using jose (Cloudflare Workers compatible) */
import { SignJWT, jwtVerify } from 'jose';

function getSecret(env) {
  return new TextEncoder().encode(env.JWT_SECRET || 'native-think-dev-secret-do-not-use-in-production');
}

export async function signToken(payload, env) {
  return new SignJWT({ sub: payload.userId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret(env));
}

export async function verifyToken(token, env) {
  try {
    const { payload } = await jwtVerify(token, getSecret(env));
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
