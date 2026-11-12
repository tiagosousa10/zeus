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
  const patches = [];
  const publicState = () => ({
    ...state,
    iptv: state.iptv.map(
      ({ id, name, type, url, username, password, epgUrl, configured }) => ({
        id,
        name,
        type,
        configured: {
          url: !!url || !!configured?.url,
          username: !!username || !!configured?.username,
          password: !!password || !!configured?.password,
          epgUrl: epgUrl !== undefined ? !!epgUrl : !!configured?.epgUrl,
        },
      }),
    ),
  });
  await page.route("**/api/state", (r) => {
    if (r.request().method() === "PATCH") {
      const patch = r.request().postDataJSON();
      patches.push(structuredClone(patch));
      if (patch.iptv)
        patch.iptv = patch.iptv.map(({ configured: _, ...entry }) => ({
          ...state.iptv.find((l) => l.id === entry.id),
          ...entry,
        }));
      state = { ...state, ...patch };
    }
    return r.fulfill({ json: publicState() });
  });
  await page.route("**/api/motor/status", (r) =>
    r.fulfill({ json: { ok: true, active: false } }),
  );
  return { getState: () => structuredClone(state), patches };
}
