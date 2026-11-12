import { api } from "../../../shared/services/api";

export function authConfiguration() {
  return api<{ turnstileSiteKey: string | null; emailConfigured: boolean }>(
    "/config",
  );
}

export function bootstrapStatus() {
  return api<{ required: boolean }>("/bootstrap");
}

export function requestPasswordReset(
  email: string,
  turnstileToken: string,
  origin: string,
) {
  return api("/auth/request-password-reset", {
    method: "POST",
    headers: turnstileToken ? { "x-turnstile-token": turnstileToken } : {},
    body: JSON.stringify({
      email,
      redirectTo: origin + "/entrada?reset=1",
    }),
  });
}

export function resetPassword(resetToken: string | null, password: string) {
  return api("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: resetToken, newPassword: password }),
  });
}

export function bootstrapAdmin(
  name: string,
  email: string,
  password: string,
  turnstileToken: string,
) {
  return api("/bootstrap", {
    method: "POST",
    body: JSON.stringify({ name, email, password, turnstileToken }),
  });
}

export function acceptInvite(
  token: string,
  name: string,
  password: string,
  turnstileToken: string,
) {
  return api("/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token, name, password, turnstileToken }),
  });
}

export function signIn(
  email: string,
  password: string,
  turnstileToken: string,
) {
  return api<{ twoFactorRedirect?: boolean }>("/auth/sign-in/email", {
    method: "POST",
    headers: turnstileToken ? { "x-turnstile-token": turnstileToken } : {},
    body: JSON.stringify({ email, password }),
  });
}

export function authenticationState() {
  return api<{
    user: {
      twoFactorEnabled?: boolean;
      twoFactorVerified?: boolean;
    } | null;
  }>("/session");
}

export function enableTwoFactor(password: string) {
  return api<{ totpURI: string; backupCodes: string[] }>(
    "/auth/two-factor/enable",
    { method: "POST", body: JSON.stringify({ password }) },
  );
}

export function verifyTwoFactor(
  recovery: boolean,
  stage: string,
  code: string,
) {
  return api(
    recovery && stage === "verify"
      ? "/auth/two-factor/verify-backup-code"
      : "/auth/two-factor/verify-totp",
    {
      method: "POST",
      body: JSON.stringify({ code, trustDevice: false }),
    },
  );
}

export function signOut() {
  return api("/auth/sign-out", {
    method: "POST",
    body: "{}",
  });
}
