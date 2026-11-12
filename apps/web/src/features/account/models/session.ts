export type Session = {
  id: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
};
