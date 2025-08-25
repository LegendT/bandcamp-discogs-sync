import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'out/**'],
  },
  ...compat.config({
    extends: ['next/core-web-vitals', 'prettier'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  }),
  {
    files: ['lib/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default eslintConfig;