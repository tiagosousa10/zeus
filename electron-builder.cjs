const release = process.env.ZEUS_RELEASE === "1";
module.exports = {
  appId: "pt.zeus.app",
  productName: "Zeus",
  npmRebuild: false,
  artifactName: "Zeus-${version}-${arch}.${ext}",
  directories: { output: "dist" },
  files: [
    "main.js",
    "engine.js",
    "engine-process.js",
    "preload.js",
    "build/icon.png",
    "package.json",
    "apps/web/dist/**/*",
    "apps/api/dist/**/*",
    "scripts/local-config.cjs",
    "!**/*.map",
  ],
  asarUnpack: ["node_modules/ffmpeg-static/**"],
  forceCodeSigning: release,
  mac: {
    category: "public.app-category.entertainment",
    icon: "build/icon.png",
    target: ["dmg"],
    hardenedRuntime: true,
    entitlements: "scripts/entitlements.mac.plist",
    entitlementsInherit: "scripts/entitlements.mac.plist",
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
