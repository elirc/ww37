import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        paper: '#f8fafc',
        brand: {
          50: '#f5f7ff',
          100: '#e6ebff',
          200: '#cfd8ff',
          300: '#a7b9ff',
          400: '#728fff',
          500: '#4f6ef7',
          600: '#3f56d6',
          700: '#3446aa',
        },
      },
    },
  },
  plugins: [],
};

export default config;
