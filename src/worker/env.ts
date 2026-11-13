export interface Env {
  RATE_KEY_SECRET?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  SHARE_CODE_KEYS: string;
  SHARE_CODE_ACTIVE_KEY: string;
  APP_ORIGIN: string;
  DIRECT_UPLOAD_VERIFIED?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
