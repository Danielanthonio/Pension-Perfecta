import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // `src/utils` TAMBIÉN declara clases: los sellos de cotejo con GoHighLevel
    // (`ghlMatch.ts`) y los colores de las notas (`notas.ts`) viven ahí porque
    // son la regla, no la pintura. Sin esta línea Tailwind no los lee y las
    // clases NO generan CSS: el chip sale sin fondo ni color y nadie ve un
    // error, solo un sello descolorido. Los tonos que había funcionaban de pura
    // suerte —los mismos `teal-*` aparecían en 18 componentes—, y el primer
    // color que no se usara en otro sitio se habría perdido en silencio.
    "./src/utils/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Medios pasos de espaciado (4.5, 9.5, ...) que Tailwind NO trae de fábrica
      // pero que la UI usa por todos lados. Igual que con los tonos intermedios
      // de color de más abajo, sin esto las clases NO generan CSS y el estilo se
      // pierde en silencio. El caso más visible era `pl-9.5` en los inputs con
      // icono: al no existir, el padding quedaba en 0 y el icono se montaba
      // encima del texto (se veía "todo enredado"). 1 paso = 0.25rem, así que
      // el medio paso son 0.125rem.
      spacing: {
        "4.5": "1.125rem",
        "5.5": "1.375rem",
        "6.5": "1.625rem",
        "7.5": "1.875rem",
        "8.5": "2.125rem",
        "9.5": "2.375rem",
        "10.5": "2.625rem",
        "11.5": "2.875rem",
        "12.5": "3.125rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "17": "4.25rem",
        "18": "4.5rem",
      },
      colors: {
        primary: {
          DEFAULT: "#0f172a", // slate-900
          light: "#334155", // slate-700
        },
        accent: {
          DEFAULT: "#3b82f6", // blue-500
          hover: "#2563eb", // blue-600
        },
        success: "#10b981", // emerald-500
        warning: "#f59e0b", // amber-500
        background: "#f8fafc", // slate-50

        // Intermediate half-step shades (150, 250, ... 850) that Tailwind does
        // not ship by default but which the UI uses extensively. Interpolated
        // from the official palette. Merged into (not replacing) the defaults,
        // so the standard 50–950 shades stay intact. See reference: these were
        // silently producing no CSS before this was added.
        slate: { 150: "#eaeff5", 250: "#d7dfe9", 350: "#b0bccd", 450: "#7c8ca2", 550: "#56657a", 650: "#3d4b5f", 750: "#293548", 850: "#172033" },
        gray: { 150: "#eceef1", 250: "#dbdee3", 350: "#b7bcc5", 450: "#848b98", 550: "#5b6472", 650: "#414b5a", 750: "#2b3544", 850: "#18212f" },
        zinc: { 150: "#ececee", 250: "#dcdce0", 350: "#bbbbc1", 450: "#898992", 550: "#62626b", 650: "#494951", 750: "#333338", 850: "#202023" },
        neutral: { 150: "#ededed", 250: "#dddddd", 350: "#bcbcbc", 450: "#8b8b8b", 550: "#636363", 650: "#494949", 750: "#333333", 850: "#1f1f1f" },
        stone: { 150: "#eeedec", 250: "#dfdcdb", 350: "#bfbbb8", 450: "#908a85", 550: "#68625d", 650: "#4e4a45", 750: "#373330", 850: "#231f1e" },
        red: { 150: "#fed6d6", 250: "#fdb8b8", 350: "#fa8b8b", 450: "#f45b5b", 550: "#e63535", 650: "#cb2121", 750: "#a91c1c", 850: "#8c1c1c" },
        orange: { 150: "#ffe2c0", 250: "#fec98f", 350: "#fca658", 450: "#fa8329", 550: "#f26611", 650: "#d64d0c", 750: "#ae3b0f", 850: "#8b3112" },
        amber: { 150: "#feeda9", 250: "#fddd6c", 350: "#fcc939", 450: "#f8af18", 550: "#e78b09", 650: "#c76508", 750: "#a34a0c", 850: "#853b0f" },
        yellow: { 150: "#fef5a7", 250: "#fee869", 350: "#fcd62e", 450: "#f2c00f", 550: "#da9f06", 650: "#b67606", 750: "#93580b", 850: "#7b4610" },
        green: { 150: "#ccfadc", 250: "#a1f3be", 350: "#68e796", 450: "#36d26f", 550: "#1cb454", 650: "#169244", 750: "#167339", 850: "#155c31" },
        emerald: { 150: "#bcf7db", 250: "#8bedc4", 350: "#51dda8", 450: "#22c68d", 550: "#0ba875", 650: "#058760", 750: "#056c4f", 850: "#065741" },
        teal: { 150: "#b3f9eb", 250: "#7cf0dc", 350: "#46dfca", 450: "#21c6b3", 550: "#11a697", 650: "#0e857b", 750: "#106a64", 850: "#125652" },
        cyan: { 150: "#baf7fd", 250: "#86eefb", 350: "#45def4", 450: "#14c5e1", 550: "#07a4c3", 650: "#0b83a1", 750: "#126983", 850: "#16566c" },
        sky: { 150: "#cdecfe", 250: "#9cddfd", 350: "#5bc8fa", 450: "#23b1f1", 550: "#0895d8", 650: "#0377b4", 750: "#056193", 850: "#0a527a" },
        blue: { 150: "#cde3fe", 250: "#a9d0fe", 350: "#7ab5fc", 450: "#4e94f8", 550: "#3073f1", 650: "#2159e2", 750: "#1e47c4", 850: "#1e3d9d" },
        indigo: { 150: "#d4ddff", 250: "#b6c3fd", 350: "#93a0fa", 450: "#7279f5", 550: "#5956eb", 650: "#493fd8", 750: "#3d34b7", 850: "#342f92" },
        violet: { 150: "#e5e0fe", 250: "#d1c6fe", 350: "#b6a0fc", 450: "#9974f8", 550: "#844bf2", 650: "#7531e3", 750: "#6425c8", 850: "#541fa6" },
        purple: { 150: "#eedfff", 250: "#e1c5ff", 350: "#cc9cfd", 450: "#b46dfa", 550: "#9e44f1", 650: "#892bdc", 750: "#7522bb", 850: "#621f98" },
        fuchsia: { 150: "#f8dcff", 250: "#f3befd", 350: "#ec92fb", 450: "#e160f4", 550: "#cd36e1", 650: "#b121c1", 750: "#941b9f", 850: "#7b1a82" },
        pink: { 150: "#fcdbee", 250: "#fabcde", 350: "#f78dc5", 450: "#f05da8", 550: "#e43888", 650: "#cd206a", 750: "#ae1855", 850: "#901848" },
        rose: { 150: "#ffd9dd", 250: "#feb9c1", 350: "#fc8b9a", 450: "#f85872", 550: "#eb2e53", 650: "#d01842", 750: "#af123b", 850: "#941338" },
      },
    },
  },
  plugins: [],
};
export default config;
