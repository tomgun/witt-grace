import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/** Dependency direction: app -> lib + domain; lib -> domain; domain -> other domain modules only (no builtins, no DOM). */
const needsExtension = {
  regex: '^\\.{1,2}/(?!.*\\.(ts|tsx|json)$)',
  message: 'Relative imports need the .ts extension: Node runs this code without a bundler',
};

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'witt-grace-gpt-proto/**',
      'tmp-ref/**',
      '_archive/**',
      'tests/golden/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.ts', 'tests/**/*.ts', '.claude/hooks/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  { files: ['src/**/*.ts', 'src/**/*.tsx'], languageOptions: { globals: globals.browser } },
  {
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['tests/e2e/**/*.ts', 'playwright.config.ts', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            needsExtension,
            {
              regex: '^(?!\\.{1,2}/)',
              message: 'src/domain imports only other domain modules by relative path',
            },
            { regex: '/(lib|app)/', message: 'src/domain must not depend on lib or app' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/domain is pure: no DOM' },
        { name: 'document', message: 'src/domain is pure: no DOM' },
        { name: 'localStorage', message: 'src/domain is pure: no storage' },
        { name: 'fetch', message: 'src/domain is pure: no network' },
      ],
    },
  },
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [needsExtension, { regex: '/app/', message: 'src/lib must not depend on app' }] },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'scripts/**/*.ts', 'tests/**/*.ts'],
    rules: {
      // A TODO must point at a tracked issue: "TODO WG-123: ..." is allowed, a bare TODO is not.
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'start' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  }
);
