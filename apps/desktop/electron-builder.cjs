const release = process.env.ZEUS_RELEASE === "1";
// Paths are relative to the repo root: the Electron app (package.json "main") lives there.
module.exports = {
  appId: "pt.zeus.app",
  productName: "Zeus",
  npmRebuild: false,
  artifactName: "Zeus-${version}-${arch}.${ext}",
  directories: {
    output: "apps/desktop/dist",
    buildResources: "apps/desktop/build",
  },
  files: [
    "apps/desktop/src/**/*",
    "apps/desktop/build/icon.png",
    "package.json",
    "apps/web/dist/**/*",
    "apps/api/dist/**/*",
    "!**/*.map",
  ],
  asarUnpack: ["node_modules/ffmpeg-static/**"],
  forceCodeSigning: release,
  mac: {
    category: "public.app-category.entertainment",
    icon: "apps/desktop/build/icon.png",
    target: ["dmg"],
    hardenedRuntime: true,
    entitlements: "apps/desktop/scripts/entitlements.mac.plist",
    entitlementsInherit: "apps/desktop/scripts/entitlements.mac.plist",
    ...(release ? { notarize: true } : { identity: null, notarize: false }),
  },
  dmg: {
    title: "Zeus",
    contents: [
      { x: 130, y: 180, type: "file" },
      { x: 410, y: 180, type: "link", path: "/Applications" },
    ],
  },
};
