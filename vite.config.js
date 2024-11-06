import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.js'),
            name: 'Gantt',
            fileName: () =>
                `frappe-gantt${mode === 'production' ? '.min' : ''}.js`,
        },
        rollupOptions: {
            output: {
                format: 'cjs',
                entryFileNames: `frappe-gantt${mode === 'production' ? '.min' : ''}.js`,
                assetFileNames: `frappe-gantt${mode === 'production' ? '.min' : ''}[extname]`,
            },
        },
        minify: mode === 'production' ? 'terser' : false,
    },
    output: { interop: 'auto' },
    server: {
        watch: { include: ['src/*', 'dist/*'] },
    },
}));
