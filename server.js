const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env file for production standalone environments
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8')
  envConfig.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const index = trimmed.indexOf('=')
    if (index === -1) return
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  })
  console.log('Environment variables loaded from .env file.')
}

// Hot DDL Migration to add password_provisional to profiles table
// Commented out to prevent TCP timeout hangs on Hostinger startup
/*
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const { Client } = require('pg');
  const connectionString = 'postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  client.connect()
    .then(() => {
      console.log('Connected to Supabase PostgreSQL for DDL check...');
      return client.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_provisional TEXT;');
    })
    .then(() => {
      console.log('DDL check completed: profiles.password_provisional is verified/created.');
      return client.end();
    })
    .catch(err => {
      console.error('DDL check failed:', err);
    });
}
*/



const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
// Hostinger Node.js manager passes the port or domain socket in process.env.PORT
const port = process.env.PORT || 3000

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on port ${port}`)
    })
})
