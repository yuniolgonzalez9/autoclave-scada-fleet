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
          cyan: '#00f3ff',
          magenta: '#ff007f',
          violet: '#7928ca',
          dark: '#0a0a14'
        },
        tactical: {
          slate: '#0f172a',
          emerald: '#10b981',
          border: '#334155'
        },
        hybrid: {
          amber: '#f59e0b',
          electric: '#06b6d4'
        },
        clinical: {
          bg: '#f8fafc',
          navy: '#0f294a',
          accent: '#0284c7'
        }
      },
      animation: {
        'laser-slide': 'laserSlide 3s linear infinite',
      },
      keyframes: {
        laserSlide: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        }
      }
    },
  },
  plugins: [],
}
