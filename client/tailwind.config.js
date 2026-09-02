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
          purple: '#A24CF3',
          dark: '#0A0A0C',
          card: '#141414'
        }
      }
    },
  },
  plugins: [],
}
