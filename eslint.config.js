import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Los componentes que genera shadcn exportan sus variantes y hooks
    // (`buttonVariants`, `useSidebar`) junto al componente: así los escribe la
    // CLI. Separarlos haría chocar cada `shadcn add` con el código local. El
    // costo es menor: editar uno de estos archivos recarga la página entera en
    // vez de hacer fast refresh. Geocore DECISIONS #24.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
