import { z } from 'zod';
import { Id, IsoDateTime, RoleSchema, USERNAME_PATTERN } from './common';
import { LIMITS } from './constants';

export const UsernameSchema = z
  .string()
  .trim()
  .min(LIMITS.usernameMinChars, `Username must be at least ${LIMITS.usernameMinChars} characters`)
  .max(LIMITS.usernameMaxChars, `Username must be at most ${LIMITS.usernameMaxChars} characters`)
  .regex(USERNAME_PATTERN, 'Username may contain only letters, digits and underscores');

/** Trimmed and lower-cased (emails are stored lower-case). */
export const EmailSchema = z.string().trim().toLowerCase().email('Enter a valid email').max(254);

export const PasswordSchema = z
  .string()
  .min(LIMITS.passwordMinChars, `Password must be at least ${LIMITS.passwordMinChars} characters`)
  .max(LIMITS.passwordMaxChars, `Password must be at most ${LIMITS.passwordMaxChars} characters`);

/** POST /api/auth/register */
export const RegisterBody = z.object({
  email: EmailSchema,
  username: UsernameSchema,
  password: PasswordSchema,
});
export type RegisterBody = z.infer<typeof RegisterBody>;

/** POST /api/auth/login: identifier is an email or a username. */
export const LoginBody = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username').max(254),
  password: z.string().min(1, 'Enter your password').max(LIMITS.passwordMaxChars),
});
export type LoginBody = z.infer<typeof LoginBody>;

/** The signed-in user. */
export const MeSchema = z.object({
  id: Id,
  username: z.string(),
  email: z.string(),
  role: RoleSchema,
  rating: z.number().int(),
  bio: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type Me = z.infer<typeof MeSchema>;

/** Response of register / login / demo / refresh. The refresh token travels in the arb_rt cookie. */
export const AuthResponseSchema = z.object({
  user: MeSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** GET /api/auth/me and PATCH /api/users/me */
export const MeResponseSchema = z.object({ user: MeSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Claims of the HS256 access token: {sub, role, username} (+ iat/exp). */
export const AccessTokenClaimsSchema = z.object({
  sub: z.string(),
  role: RoleSchema,
  username: z.string(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;

/** Name of the httpOnly refresh-token cookie (Path=/api/auth, SameSite=Strict). */
export const REFRESH_COOKIE_NAME = 'arb_rt';
