const net = require("net");
const fs = require("fs");
const path = require("path");

function connectSocks5(proxyHost, proxyPort, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    console.log(`Connecting to proxy ${proxyHost}:${proxyPort}...`);
    const socket = net.connect(proxyPort, proxyHost);
    socket.setTimeout(4000);

    socket.on("connect", () => {
      console.log("  Proxy TCP connected. Sending greeting...");
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    socket.on("data", (data) => {
      // Handshake phase 1: Greeting response
      if (data[0] === 0x05 && data[1] === 0x00) {
        console.log("  Proxy accepted. Sending request to connect to target...");
        const hostBuf = Buffer.from(targetHost);
        const reqBuf = Buffer.alloc(4 + 1 + hostBuf.length + 2);
        reqBuf.writeUInt8(0x05, 0); // version
        reqBuf.writeUInt8(0x01, 1); // CONNECT
        reqBuf.writeUInt8(0x00, 2); // reserved
        reqBuf.writeUInt8(0x03, 3); // Domain name address type
        reqBuf.writeUInt8(hostBuf.length, 4);
        hostBuf.copy(reqBuf, 5);
        reqBuf.writeUInt16BE(targetPort, 5 + hostBuf.length);

        socket.write(reqBuf);
      } 
      // Handshake phase 2: Connect response
      else if (data[0] === 0x05) {
        const status = data[1];
        if (status === 0x00) {
          console.log("  🎉 SOCKS5 Tunnel established to target!");
          socket.removeAllListeners("data");
          socket.removeAllListeners("error");
          socket.removeAllListeners("timeout");
          resolve(socket);
        } else {
          socket.destroy();
          reject(new Error(`SOCKS5 connection rejected with status: ${status}`));
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
      reject(new Error("Connection timeout"));
    });
  });
}

async function testProxies() {
  const proxiesFile = path.join(__dirname, "proxies.txt");
  if (!fs.existsSync(proxiesFile)) {
    console.error("proxies.txt not found!");
    return;
  }

  const lines = fs.readFileSync(proxiesFile, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
  console.log(`Loaded ${lines.length} proxies to test...`);

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const [host, port] = lines[i].split(":");
    console.log(`\nTesting proxy #${i + 1}: ${host}:${port}`);
    try {
      const socket = await connectSocks5(host, parseInt(port, 10), "db.gxovfywzftiirdpcskbc.supabase.co", 5432);
      console.log("Success establishing SOCKS5 socket! Closing...");
      socket.destroy();
      console.log(`Found working proxy: ${host}:${port}`);
      break;
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
    }
  }
}

testProxies();
