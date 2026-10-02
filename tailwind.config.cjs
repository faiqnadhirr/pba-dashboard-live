/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141821", navy: "#1F2A44", slate: "#55627A", mut: "#6B7588",
        surface: "#F5F7FA", card: "#FFFFFF", line: "#E3E7ED",
        crit: "#d03b3b", serious: "#ec835a", warn: "#fab219", good: "#0ca30c",
        s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", s7: "#4a3aa7",
      },
      fontFamily: { sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
