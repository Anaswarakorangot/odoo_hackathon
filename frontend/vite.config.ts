import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Force reload to pick up new dependencies
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
})

