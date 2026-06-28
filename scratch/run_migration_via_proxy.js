const net = require("net");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const TARGET_HOST = "db.gxovfywzftiirdpcskbc.supabase.co";
const TARGET_PORT = 5432;
const CONNECTION_STRING = "postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres";

// SOCKS5 Connector
function connectSocks5(proxyHost, proxyPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxyHost);
    socket.setTimeout(3000);

    socket.on("connect", () => {
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    socket.on("data", (data) => {
      if (data[0] === 0x05 && data[1] === 0x00) {
        const hostBuf = Buffer.from(TARGET_HOST);
        const reqBuf = Buffer.alloc(4 + 1 + hostBuf.length + 2);
        reqBuf.writeUInt8(0x05, 0);
        reqBuf.writeUInt8(0x01, 1);
        reqBuf.writeUInt8(0x00, 2);
        reqBuf.writeUInt8(0x03, 3);
        reqBuf.writeUInt8(hostBuf.length, 4);
        hostBuf.copy(reqBuf, 5);
        reqBuf.writeUInt16BE(TARGET_PORT, 5 + hostBuf.length);
        socket.write(reqBuf);
      } else if (data[0] === 0x05) {
        if (data[1] === 0x00) {
          socket.removeAllListeners("data");
          socket.removeAllListeners("error");
          socket.removeAllListeners("timeout");
          
          // Override connect to bypass pg client's reconnect attempt
          socket.connect = function(port, host, cb) {
            if (cb) cb();
            process.nextTick(() => socket.emit("connect"));
            return socket;
          };

          resolve(socket);
        } else {
          socket.destroy();
          reject(new Error(`SOCKS5 reject status ${data[1]}`));
        }
      } else {
        socket.destroy();
        reject(new Error("Invalid SOCKS5 response"));
      }
    });

    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout"));
    });
  });
}

// HTTP Connect Tunnel
function connectHTTP(proxyHost, proxyPort) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxyHost);
    socket.setTimeout(3000);

    socket.on("connect", () => {
      socket.write(`CONNECT ${TARGET_HOST}:${TARGET_PORT} HTTP/1.1\r\nHost: ${TARGET_HOST}:${TARGET_PORT}\r\n\r\n`);
    });

    socket.on("data", (data) => {
      const response = data.toString("utf8");
      if (response.includes("200")) {
        socket.removeAllListeners("data");
        socket.removeAllListeners("error");
        socket.removeAllListeners("timeout");

        // Override connect to bypass pg client's reconnect attempt
        socket.connect = function(port, host, cb) {
          if (cb) cb();
          process.nextTick(() => socket.emit("connect"));
          return socket;
        };

        resolve(socket);
      } else {
        socket.destroy();
        reject(new Error(`HTTP connect failed: ${response.split("\r\n")[0]}`));
      }
    });

    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout"));
    });
  });
}

async function runMigration(socket, proxyInfo) {
  console.log(`\n🎉 Connection success via ${proxyInfo}!`);
  console.log("Setting up pg client with custom stream...");

  const client = new Client({
    host: "127.0.0.1", // Bypass local DNS lookup
    port: TARGET_PORT,
    user: "postgres",
    password: "Villouta2026.",
    database: "postgres",
    stream: socket,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Supabase database!");

    const migrationsDir = path.join(__dirname, "../supabase/migrations");
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    console.log("Running migrations in order:", files);

    await client.query("BEGIN;");
    for (const file of files) {
      console.log(`Executing migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
    }
    await client.query("COMMIT;");
    console.log("🚀 ALL MIGRATIONS COMPLETED SUCCESSFULLY!");

    // Verify
    const res = await client.query("SELECT COUNT(*) FROM public.empresas_multialiado;");
    console.log(`Verified count of empresas_multialiado: ${res.rows[0].count}`);

    return true;
  } catch (err) {
    console.error("Migration error:", err);
    try {
      await client.query("ROLLBACK;");
    } catch (e) {}
    return false;
  } finally {
    await client.end();
  }
}

async function main() {
  // 1. Try SOCKS5 proxies
  const socksFile = path.join(__dirname, "proxies.txt");
  if (fs.existsSync(socksFile)) {
    const lines = fs.readFileSync(socksFile, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
    console.log(`Loaded ${lines.length} SOCKS5 proxies...`);
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const [host, port] = lines[i].split(":");
      process.stdout.write(`Testing SOCKS5 proxy #${i+1}: ${host}:${port} `);
      try {
        const socket = await connectSocks5(host, parseInt(port, 10));
        const ok = await runMigration(socket, `SOCKS5 ${host}:${port}`);
        if (ok) {
          process.exit(0);
        }
      } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
      }
    }
  }

  // 2. Try HTTP proxies
  const httpFile = path.join(__dirname, "http_proxies.txt");
  if (fs.existsSync(httpFile)) {
    const lines = fs.readFileSync(httpFile, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
    console.log(`\nLoaded ${lines.length} HTTP proxies...`);
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const [host, port] = lines[i].split(":");
      process.stdout.write(`Testing HTTP proxy #${i+1}: ${host}:${port} `);
      try {
        const socket = await connectHTTP(host, parseInt(port, 10));
        const ok = await runMigration(socket, `HTTP ${host}:${port}`);
        if (ok) {
          process.exit(0);
        }
      } catch (err) {
        console.log(`❌ Failed: ${err.message}`);
      }
    }
  }

  console.log("\n❌ Failed to run migration. No working proxies found.");
  process.exit(1);
}

main();
