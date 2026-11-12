export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  twoFactorVerified: boolean;
}
import type { PublicIPTVList } from "../../../../../packages/contracts/member";
export interface MemberState<List = PublicIPTVList> {
  preferences: Record<string, any>;
  library: any[];
  progress: Record<string, any>;
  iptv: List[];
  addons: any[];
  onboardingDone: boolean;
  [key: string]: any;
}
