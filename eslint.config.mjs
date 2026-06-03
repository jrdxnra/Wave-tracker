import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/app/**/*.ts', 'src/app/**/*.tsx', 'src/components/**/*.ts', 'src/components/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/firestore',
              importNames: ['setDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'runTransaction'],
              message: 'Use scoped store/gateway actions for Firestore writes instead of UI-level direct writes.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);
