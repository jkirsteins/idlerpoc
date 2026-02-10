import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import noSideEffectsBeforeDefinitions from './eslint-rules/no-side-effects-before-definitions.js';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    ignores: ['dist/**', 'eslint-rules/**', 'docs/**', 'vite.config.ts', 'eslint.config.js'],
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      local: {
        rules: {
          'no-side-effects-before-definitions': noSideEffectsBeforeDefinitions,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Prevent TDZ crashes on Safari/iOS: flag let/const used before declaration.
      // Functions are allowed (hoisted), classes/variables/typedefs are not.
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: false,
          classes: true,
          variables: true,
          allowNamedExports: true,
        },
      ],
      // Enforce strict equality, except for idiomatic == null / != null checks.
      eqeqeq: ['error', 'smart'],
      // Ensure switch statements over union types handle every member.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Prevent TDZ from hoisted functions: all const/let declarations must
      // appear before any top-level side effects (calls, try blocks, etc.).
      'local/no-side-effects-before-definitions': 'error',
    },
  }
);
