"use strict";
// Corre o motor de torrents num processo separado, para o hashing/rede
// não bloquearem a janela (processo principal do Electron).
const { startEngine } = require("./engine");
const engine = startEngine({
  token: process.env.ZEUS_LEGACY === "1" ? null : process.env.ZEUS_MOTOR_TOKEN,
  port: parseInt(process.env.ZEUS_MOTOR_PORT || "11471", 10),
  ffmpegPath: process.env.ZEUS_MOTOR_FFMPEG || null,
});
engine.server.once("listening", () =>
  process.parentPort.postMessage({
    ready: true,
    port: engine.server.address().port,
  }),
);
function shutdown() {
  try {
    engine.stop();
  } catch (e) {}
  process.exit(0);
}
process.parentPort.on("message", (e) => {
  const d = e && e.data;
  if (d === "stop") shutdown();
  else if (d && d.battery !== undefined) engine.setBattery(d.battery);
});
process.on("SIGTERM", shutdown);
