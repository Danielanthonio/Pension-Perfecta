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
  console.log('Environment variables loaded from .env inside next.config.js')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Para Hostinger VPS con Node.js: usar `npm run build && npm start`
  // Para hosting estático: descomentar `output: 'export'` y usar la carpeta `out/`
  // output: 'export',

  // Agregar trailing slash para compatibilidad con servidores
  trailingSlash: true,

  // Desactivar optimización de imágenes si vas a usar hosting estático
  images: {
    unoptimized: true,
  },

  // Evitar error de límite de hilos (nproc) en Hostinger
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
};

module.exports = nextConfig;
