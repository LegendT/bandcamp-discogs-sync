module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        jsx: 'react'
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(p-throttle)/)'
  ],
  extensionsToTreatAsEsm: ['.ts']
};