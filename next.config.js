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
};

module.exports = nextConfig;
