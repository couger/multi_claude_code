import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          // 清除 ELECTRON_RUN_AS_NODE 环境变量
          // VS Code 终端会设置此变量，导致 Electron 以 Node.js 模式运行
          delete process.env.ELECTRON_RUN_AS_NODE;
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // 确保 electron 模块被正确外部化
              external: ['electron', 'node-pty', 'ws', 'fs', 'path', 'os', 'crypto', 'http', 'url'],
              output: {
                entryFileNames: 'main.js',
                format: 'cjs',
                // 确保模块被正确引用
                interop: 'auto',
              },
            },
            // 确保 CommonJS 模块被正确处理
            commonjsOptions: {
              strictRequires: true,
              transformMixedEsModules: true,
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                entryFileNames: 'preload.js',
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@timur00kh/whisper.wasm'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});