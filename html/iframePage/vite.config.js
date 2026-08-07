/* global require, __dirname, process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

const path = require('path');

// Web Store review builds set MOCKKIT_STORE_BUILD=1 to hide the self-update
// entry (avoids remote-code-download scrutiny). GitHub-distributed builds
// leave it unset so the self-update UI stays available. The value is exposed
// to client code via import.meta.env.STORE_BUILD.
const isStoreBuild = process.env.MOCKKIT_STORE_BUILD === '1';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), visualizer({
    emitFile: false,
    file: 'stats.html', //分析图生成的文件名
    // open:true
  })],
  base: './',
  define: {
    'import.meta.env.STORE_BUILD': JSON.stringify(isStoreBuild),
  },
  build: {
    // 输出路径
    // outDir: './dist',
    // 自定义底层的 Rollup 打包配置
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, './index.html'),
      },
      output: {
        chunkFileNames: 'static/js/[name]-[hash].js',
        entryFileNames: 'static/js/[name]-[hash].js',
        assetFileNames: 'static/css/[name]-[hash].[ext]',
      }
    },
  }
});
