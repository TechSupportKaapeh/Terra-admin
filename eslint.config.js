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
    // El Select de Base UI se usa sólo a través de `Selector` (M.7.1). Sin su prop
    // `items`, el botón muestra el value crudo —un UUID— en vez de la etiqueta: el bug
    // del 2026-09-12, que apareció en cinco pantallas a la vez. `Selector` la exige y
    // dibuja las opciones desde esa misma lista. Se restringe el import, y no sólo la
    // prop, porque una regla de lint no puede exigir una prop; el tipo sí.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/Selector.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/components/ui/select', '**/ui/select'],
          message: 'Usá `Selector` (@/components/Selector): el Select crudo sin `items` muestra el id en vez del nombre.',
        }],
      }],
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
