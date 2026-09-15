/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          coral: '#ff5a47',
          peach: '#ff9b8e',
          dark: '#070709',
          surface: '#0c0c10'
        }
      }
    },
  },
  plugins: [],
}
