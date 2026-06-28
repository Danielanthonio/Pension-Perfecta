const { Client } = require("pg");
const dns = require("dns").promises;

const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "sa-east-1",
  "ca-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3"
];

const projectRef = "gxovfywzftiirdpcskbc";
const password = "Villouta2026.";

async function testRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  console.log(`Testing DNS resolution for ${host}...`);
  try {
    const addresses = await dns.resolve4(host);
    console.log(`  DNS OK: ${addresses.join(", ")}`);

    console.log(`  Trying connection to postgres://${host}:6543/postgres ...`);
    // Use transaction pooler port 6543
    const client = new Client({
      host,
      port: 6543,
      database: "postgres",
      user: `postgres.${projectRef}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });

    await client.connect();
    console.log(`  🎉 SUCCESS connected to ${region} pooler!`);
    await client.end();
    return host;
  } catch (err) {
    console.log(`  ❌ Failed for ${region}: ${err.message}`);
    return null;
  }
}

async function main() {
  for (const region of regions) {
    const successfulHost = await testRegion(region);
    if (successfulHost) {
      console.log(`\nFound successful host: ${successfulHost}`);
      break;
    }
  }
}

main();
