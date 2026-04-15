import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const unsafePublicEnvKeys = Object.keys(env).filter((key) => (
    key.startsWith('VITE_')
    && /(SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE_KEY)/i.test(key)
  ));

  if (unsafePublicEnvKeys.length > 0) {
    throw new Error(
      `Unsafe public env vars detected: ${unsafePublicEnvKeys.join(', ')}. `
      + 'VITE_* variables are exposed to the browser. '
      + 'Rename secrets to non-VITE names (example: AUTH0_CLIENT_SECRET).'
    );
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return null;
            if (id.includes('/recharts/')) {
              return 'vendor-charts';
            }
            if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
              return 'vendor-i18n';
            }
            if (id.includes('/@auth0/')) {
              return 'vendor-auth';
            }
            if (id.includes('/date-fns/')) {
              return 'vendor-date';
            }
            if (id.includes('/@fortawesome/')) {
              return 'vendor-icons';
            }
            return 'vendor';
          },
        },
      },
    },
    server: {
      port: 3000,
      // Proxy API requests to PHP development server
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8081',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
