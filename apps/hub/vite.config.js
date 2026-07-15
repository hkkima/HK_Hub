import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: /HK_Hub/ (리포 이름과 일치) · 로컬 dev: /
const base = process.env.DEPLOY_TARGET === 'ghpages' ? '/HK_Hub/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5400 },
});
