const BOOT_SEQUENCE: LogLine[] = [
  { text: "pushkar@portfolio:~$ wake --companion mikuro --mode=liquid-chrome", type: "cmd", delay: 200 },
  { text: "[KERNEL] Initializing Pushkar Portfolio Core v2026...", type: "info", delay: 350 },
  { text: "[OK] GPU Hardware acceleration detected: WebGL2 Liquid-Chrome pipeline", type: "success", delay: 500 },
  { text: "[OK] 3D Warp Carousel: Edge-to-edge full width enabled", type: "success", delay: 650 },
  { text: "[OK] ElevenLabs audio cache ready · Voice ID Mary loaded", type: "success", delay: 800 },
  { text: "[STATE] Companion current state: DEEP_SLEEP 💤 (resting on dock)", type: "warn", delay: 950 },
  { text: "[SYS] Injecting neural wake pulse & high-priority espresso...", type: "info", delay: 1100 },
  {
    text: `       /\\_/\\  \n  ( -.- )  *stretches paws & yawns*\n  ( o.o )  *liquid-chrome eyes open*\n   > ^ <   "Oh good. An audience. Who woke me up?"`,
    type: "ascii",
    delay: 1300,
  },
  { text: "[ONLINE] Mikuro is awake and standing by! Unlocking site...", type: "mikuro", delay: 1800 },
];