/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#0a0b10',
          card: '#121420',
          border: '#1f2438',
          accent: '#00f0ff',
          pink: '#ff007f',
          yellow: '#ffe600',
          purple: '#9d00ff',
          green: '#00ff66'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        display: ['"Orbitron"', '"Chakra Petch"', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shake': 'shake 0.2s ease-in-out',
        'glow': 'glow 1.5s ease-in-out infinite alternate',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px) translateY(2px)' },
          '75%': { transform: 'translateX(4px) translateY(-2px)' },
        },
        glow: {
          'from': { filter: 'drop-shadow(0 0 5px rgba(0, 240, 255, 0.4))' },
          'to': { filter: 'drop-shadow(0 0 15px rgba(0, 240, 255, 0.8))' },
        }
      }
    },
  },
  plugins: [],
}
