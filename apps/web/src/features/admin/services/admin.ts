import { api } from "../../../shared/services/api";
import type { Member, Invite, Addon } from "../models/admin";
export function listMembers() {
  return api<{ members: Member[] }>("/admin/members");
}

export function listInvites() {
  return api<{ invites: Invite[] }>("/admin/invites");
}

export function listAddons() {
  return api<{ addons: Addon[] }>("/admin/addons");
}

export function setMemberActive(id: string, active: boolean) {
  return api("/admin/members/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export function createInvite(email: string) {
  return api<{
    url: string;
    emailSent: boolean;
    deliveryError?: string;
  }>("/admin/invites", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function revokeInvite(id: string) {
  return api("/admin/invites/" + encodeURIComponent(id), { method: "DELETE" });
}

export function syncAddons() {
  return api("/admin/addons/sync", {
    method: "POST",
    body: "{}",
  });
}

export function reviewAddon(id: string, status: "approved" | "rejected") {
  return api("/admin/addons/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
