require("../src/local-config.cjs").ensureLocalConfig();
const { startEngine } = require("../src/engine");
const motor = startEngine({
  port: 11471,
  token: process.env.ZEUS_MOTOR_TOKEN,
  ffmpegPath: require("ffmpeg-static"),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    motor.stop();
    process.exit(0);
  });
