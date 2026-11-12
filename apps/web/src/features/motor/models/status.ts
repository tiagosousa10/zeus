export type MotorStatus = {
  ok: boolean;
  active?: boolean;
  numPeers?: number;
  downloadSpeed?: number;
  progress?: number;
};
