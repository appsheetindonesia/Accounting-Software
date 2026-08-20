import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tailwind CSS 4 via PostCSS (postcss.config.js handles @tailwindcss/postcss)
})
