// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The vendor-global boundary: narrow casts of globalThis are the one
    // sanctioned assertion site (see PRD §7.6).
    files: ['src/adapters/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },
);
