export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active?: boolean;
  twoFactorEnabled?: boolean;
};
export type Invite = {
  id: string;
  email: string;
  expiresAt: string;
  usedAt?: string | null;
  revokedAt?: string | null;
  status?: string;
};
export type Addon = {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  status: string;
};
