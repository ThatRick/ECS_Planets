import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        globals: true,
    },
    resolve: {
        alias: {
            // Handle .js imports in TypeScript source
            './Vector2.js': './Vector2.ts',
            '../lib/Vector2.js': '../lib/Vector2.ts',
            '../../lib/Vector2.js': '../../lib/Vector2.ts',
            './common.js': './common.ts',
            '../../lib/common.js': '../../lib/common.ts',
        }
    }
})
