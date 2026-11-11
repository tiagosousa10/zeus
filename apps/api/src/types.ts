import "hono";
declare module "hono" {
  interface ContextVariableMap {
    member: {
      id: string;
      name: string;
      email: string;
      role: string;
      active: boolean;
      twoFactorEnabled?: boolean | null;
    };
  }
}
