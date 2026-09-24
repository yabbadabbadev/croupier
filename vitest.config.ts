import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporters: ['text', 'lcov'],
      thresholds: {
        lines: 79,
        functions: 83,
        branches: 77,
        statements: 79,
      },
    },
  },
})
