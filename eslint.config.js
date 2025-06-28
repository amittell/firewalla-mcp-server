import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // TypeScript-specific type safety rules
      '@typescript-eslint/no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_|node|context|items',
        varsIgnorePattern: '^_|node|context|items',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off', // TypeScript infers types well
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-call': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-member-access': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-return': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-argument': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/strict-boolean-expressions': 'off', // Too strict for existing patterns
      '@typescript-eslint/prefer-nullish-coalescing': 'off', // Many patterns use || for backward compatibility
      '@typescript-eslint/prefer-optional-chain': 'off', // Existing code patterns work fine
      '@typescript-eslint/no-non-null-assertion': 'off', // Used appropriately in validation code
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'off', // Many async functions are prepared for future async operations
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/promise-function-async': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'warn',
      '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
      '@typescript-eslint/consistent-indexed-object-style': ['warn', 'record'],
      '@typescript-eslint/method-signature-style': ['warn', 'property'],
      
      // Enhanced null/undefined checking
      '@typescript-eslint/no-unnecessary-condition': 'off', // Conflicts with defensive coding
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      
      // Function and parameter rules
      '@typescript-eslint/explicit-member-accessibility': 'off', // Too strict for existing code
      '@typescript-eslint/parameter-properties': 'off',
      '@typescript-eslint/no-parameter-properties': 'off',
      
      // General JavaScript best practices
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
      'eqeqeq': 'error',
      'curly': 'error',
      'no-throw-literal': 'error',
      'no-return-await': 'error',
      'prefer-template': 'error',
      'prefer-object-spread': 'error',
      'prefer-destructuring': ['error', { object: true, array: false }],
      'object-shorthand': 'error',
      'no-duplicate-imports': 'error',
      'no-unused-vars': 'off', // Use TypeScript version instead
      'no-useless-return': 'error',
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'no-unneeded-ternary': 'error',
      'yoda': 'error',
      
      // Error handling
      'no-empty': 'error',
      
      // Security and safety
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-caller': 'error',
      'no-proto': 'error',
      'no-extend-native': 'error',
      
      // Performance
      'no-loop-func': 'error'
    }
  },
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.test.json'
      },
      globals: {
        jest: 'readonly',
        expect: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        process: 'readonly',
        console: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Relaxed rules for test files
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_|^mock',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-call': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-member-access': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-return': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/no-unsafe-argument': 'off', // Too many warnings for existing API patterns
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off', // Used appropriately in validation code
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      'no-console': 'off', // Allow console.log in tests
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', '!eslint.config.js', 'coverage/']
  }
];