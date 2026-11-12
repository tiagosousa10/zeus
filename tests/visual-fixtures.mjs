// Isolated browser fixtures: never written to the member database.
export const member = {
  id: "visual-member",
  name: "Inês Duarte",
  email: "ines.duarte@exemplo.pt",
  role: "admin",
  twoFactorEnabled: true,
  twoFactorVerified: true,
};
export const emptyState = {
  preferences: {},
  library: [],
  progress: {},
  iptv: [],
  addons: [],
  onboardingDone: true,
};
export async function mockMember(page, overrides = {}) {
  let state = structuredClone({ ...emptyState, ...overrides });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: member } }),
  );
  await page.route("**/api/state", (r) => {
    if (r.request().method() === "PATCH")
      state = { ...state, ...r.request().postDataJSON() };
    return r.fulfill({ json: state });
  });
  await page.route("**/api/motor/status", (r) =>
    r.fulfill({ json: { ok: true, active: false } }),
  );
  return { getState: () => structuredClone(state) };
}
