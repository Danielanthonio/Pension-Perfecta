import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
};
export default config;
