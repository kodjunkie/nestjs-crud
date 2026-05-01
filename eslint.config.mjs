import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/lib/**', '**/node_modules/**', 'coverage/**', 'packages/typeorm/test/__fixture__/app/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/!(*.d).ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        project: 'tsconfig.eslint.json',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unnecessary-type-constraint': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'lines-between-class-members': ['error', 'always'],
      'padded-blocks': ['error', 'never'],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'max-len': ['error', { code: 150, comments: 200 }],
      'comma-dangle': ['error', 'always-multiline'],
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: {
            memberTypes: [
              'signature',
              'public-static-field',
              'protected-static-field',
              'private-static-field',
              'public-instance-field',
              'protected-instance-field',
              'private-instance-field',
              'public-abstract-field',
              'protected-abstract-field',
              'public-constructor',
              'protected-constructor',
              'private-constructor',
              'public-static-method',
              'protected-static-method',
              'private-static-method',
              'public-instance-method',
              'protected-instance-method',
              'private-instance-method',
              'public-abstract-method',
              'protected-abstract-method',
            ],
          },
        },
      ],
    },
  },
  prettierConfig,
);
