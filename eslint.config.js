import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import top from '@ericcornelissen/eslint-plugin-top';

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
    plugins: { top },
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
      // Ban top-level side effects to prevent TDZ bugs and enforce clean modules.
      // allowedCalls: init (app entry), buildXpTable (pure data), test framework globals.
      'top/no-top-level-side-effects': [
        'error',
        {
          allowDerived: true,
          allowedCalls: [
            'Symbol',
            'init',
            'buildXpTable',
            'describe',
            'it',
            'test',
            'beforeEach',
            'afterEach',
            'beforeAll',
            'afterAll',
          ],
        },
      ],
    },
  }
);
