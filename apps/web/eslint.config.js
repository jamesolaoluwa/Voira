import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      // This codebase does not use PropTypes (and relies on runtime/backend validation instead).
      'react/prop-types': 'off',
      // React 17+ JSX transform doesn't require React in scope; ignore unused `React` imports.
      // Keep unused vars as warnings for pre-prod scan velocity.
      'no-unused-vars': [
        'warn',
        {
          varsIgnorePattern: '^(React)$',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Allow empty blocks (often used for best-effort cleanup guards) but keep visibility.
      'no-empty': 'warn',
      // Many UI components use custom attributes from third-party libs.
      'react/no-unknown-property': 'off',
      // Marketing/content pages contain literal quotes/apostrophes.
      'react/no-unescaped-entities': 'off',
      // Switch/case patterns in some files use declarations; warn instead of failing lint.
      'no-case-declarations': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['**/*.config.{js,ts}', 'scripts/**/*.js', 'vite.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['tailwind.config.js'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'script',
      },
    },
  },
]
