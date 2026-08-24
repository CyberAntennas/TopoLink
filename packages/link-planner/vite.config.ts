import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: [
        'maplibre-gl',
        'lucide-react',
        'pmtiles',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'three',
      ],
    },
    sourcemap: true,
  },
});
