/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ps: {
          blue: '#00439c',
          accent: '#0070d1',
          cyan: '#00d4ff',
          coral: '#ff4a68',
        }
      },
      boxShadow: {
        'ps-glow': '0 0 25px rgba(0, 112, 209, 0.25)',
        'ps-card': '0 8px 30px rgba(0, 0, 0, 0.12)',
        'ps-card-dark': '0 8px 30px rgba(0, 0, 0, 0.4)',
      }
    },
  },
  plugins: [],
}
