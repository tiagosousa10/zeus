import { api } from "../../../shared/services/api";
import type { Session } from "../models/session";
export function listSessions() {
  return api<Session[]>("/auth/list-sessions");
}

export function changePassword(current: string, password: string) {
  return api("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: current,
      newPassword: password,
      revokeOtherSessions: true,
    }),
  });
}

export function updateProfile(name: string) {
  return api("/auth/update-user", {
    method: "POST",
    body: JSON.stringify({ name: name.trim() }),
  });
}

export function generateBackupCodes(backupPassword: string) {
  return api<{ backupCodes: string[] }>(
    "/auth/two-factor/generate-backup-codes",
    {
      method: "POST",
      body: JSON.stringify({
        password: backupPassword,
      }),
    },
  );
}

export function revokeSession(token: string) {
  return api("/auth/revoke-session", {
    method: "POST",
    body: JSON.stringify({ token: token }),
  });
}

export function revokeOtherSessions() {
  return api("/auth/revoke-other-sessions", {
    method: "POST",
    body: "{}",
  });
}
