import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
// Development only: same Rust + SQLite path as desktop, isolated database.
function rustBridge(): Plugin {
  return {
    name: "local-rust-bridge",
    configureServer(server) {
      server.middlewares.use("/api/request", (req, res) => {
        const origin = req.headers.origin;
        if (
          req.method !== "POST" ||
          req.headers["content-type"] !== "application/json" ||
          (origin &&
            origin !== "http://localhost:1420" &&
            origin !== "http://127.0.0.1:1420")
        ) {
          res.writeHead(403).end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 2_000_000) req.destroy();
        });
        req.on("end", () => {
          const db =
            process.env.AUCTION_HELPER_DB ??
            path.join(root, ".local/browser.db");
          const child = spawn(
            path.join(root, "target/debug/auction-core"),
            [db],
            { stdio: ["pipe", "pipe", "pipe"] },
          );
          let output = "";
          const timer = setTimeout(() => child.kill(), 15_000);
          child.stdout.on("data", (chunk) => {
            output += chunk;
          });
          child.stderr.resume();
          child.on("error", () => {
            if (!res.headersSent)
              res.writeHead(503, { "Content-Type": "application/json" }).end(
                JSON.stringify({
                  error: "Rust bridge unavailable. Run npm run dev:browser.",
                }),
              );
          });
          child.on("close", () => {
            clearTimeout(timer);
            if (!res.headersSent)
              res.writeHead(200, { "Content-Type": "application/json" }).end(
                output ||
                  JSON.stringify({
                    error: "Rust bridge exited unexpectedly.",
                  }),
              );
          });
          child.stdin.on("error", () => {});
          child.stdin.end(body);
        });
      });
    },
  };
}
export default defineConfig(({ mode }) => ({
  root: path.join(root, "frontend"),
  plugins: [react(), ...(mode === "browser" ? [rustBridge()] : [])],
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  clearScreen: false,
  build: { outDir: "dist" },
}));
