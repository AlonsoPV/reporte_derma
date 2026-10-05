const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7f7',
          100: '#d9ecec',
          200: '#b3d9d9',
          300: '#7ebfbf',
          400: '#4a9e9e',
          500: '#2f7d7d',
          600: '#246464',
          700: '#1e5050',
          800: '#1a4141',
          900: '#163636',
        },
        ink: '#14212b',
        mist: '#f3f6f8',
        sand: '#eef2f0',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(20, 33, 43, 0.08)',
      },
    },
  },
  plugins: [],
};
