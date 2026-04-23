import { spawn } from "node:child_process";

const port = process.env.PORT || process.env.SHOPIFY_APP_PORT || "3000";
const child = spawn(
  `npx remix vite:dev --host 0.0.0.0 --port ${port}`,
  { stdio: "inherit", env: { ...process.env, PORT: port }, shell: true },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
