const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const PUBLIC_PORT = parseInt(process.env.PORT || "18115", 10);
const METRO_PORT = PUBLIC_PORT + 1;
const HOST = "127.0.0.1";

let metroReady = false;
let placeholder = null;
let proxy = null;

function log(msg) {
  console.log(`[readiness-shim] ${msg}`);
}

function startPlaceholder() {
  placeholder = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Metro is starting...\n");
  });
  placeholder.on("upgrade", (_req, socket) => {
    socket.destroy();
  });
  placeholder.listen(PUBLIC_PORT, () => {
    log(`placeholder listening on ${PUBLIC_PORT} while Metro warms up`);
  });
  placeholder.on("error", (err) => {
    console.error(`[readiness-shim] placeholder error: ${err.message}`);
    process.exit(1);
  });
}

function startProxy() {
  proxy = net.createServer((client) => {
    const upstream = net.connect(METRO_PORT, HOST);
    let upstreamConnected = false;
    upstream.once("connect", () => {
      upstreamConnected = true;
      client.pipe(upstream);
      upstream.pipe(client);
    });
    const cleanup = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", cleanup);
    upstream.on("error", () => {
      if (!upstreamConnected) {
        try {
          client.end(
            "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
          );
        } catch {}
      }
      cleanup();
    });
    client.on("close", cleanup);
    upstream.on("close", cleanup);
  });
  proxy.listen(PUBLIC_PORT, () => {
    log(`proxying ${PUBLIC_PORT} -> ${METRO_PORT}`);
  });
  proxy.on("error", (err) => {
    console.error(`[readiness-shim] proxy error: ${err.message}`);
    process.exit(1);
  });
}

function switchToProxy() {
  if (!placeholder) {
    startProxy();
    return;
  }
  log("Metro is up; switching from placeholder to TCP proxy");
  placeholder.close(() => {
    placeholder = null;
    startProxy();
  });
}

function probeMetro() {
  const sock = net.connect(METRO_PORT, HOST);
  let settled = false;
  const done = (ok) => {
    if (settled) return;
    settled = true;
    sock.destroy();
    if (ok && !metroReady) {
      metroReady = true;
      switchToProxy();
    } else if (!ok) {
      setTimeout(probeMetro, 500);
    }
  };
  sock.once("connect", () => done(true));
  sock.once("error", () => done(false));
}

function spawnExpo() {
  const env = { ...process.env, PORT: String(METRO_PORT) };
  const child = spawn(
    "pnpm",
    [
      "exec",
      "expo",
      "start",
      "--localhost",
      "--port",
      String(METRO_PORT),
    ],
    { stdio: "inherit", env },
  );
  const shutdown = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  child.on("exit", (code, signal) => {
    log(`expo exited (code=${code}, signal=${signal})`);
    process.exit(code ?? 0);
  });
}

startPlaceholder();
spawnExpo();
probeMetro();
