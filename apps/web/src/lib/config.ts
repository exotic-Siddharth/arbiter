/** Build-time client configuration (apps/web/.env, VITE_* only). */
export const config = {
  /** Show "Try the demo" (calls useAuth().loginDemo()). */
  demoLogin: import.meta.env.VITE_DEMO_LOGIN === 'true',
  appName: 'Arbiter',
} as const;
