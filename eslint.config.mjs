// ESLint 扁平配置(AUDIT-3 · §11.5 决策③)
//
// 策略:规则严重度仍按风险分 error/warn/off,但 npm script 使用 --max-warnings=0，
// 当前零 warning 基线进入 CI；新增 warning 也会阻断，防止观察期债务回潮。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'dist', 'dev-dist', 'coverage', 'node_modules',
      '**/*.config.{js,ts,mjs,cjs}', 'scripts/**', 'public/**',
      // 桌面版主进程/内嵌服务是 Node CommonJS 构建脚本，不在应用源码lint范围内
      // （require / process / __dirname 会被 no-undef 误报）。
      'electron/**',
      // Capacitor Android 工程是生成目录（Gradle 脚本 + 内嵌的 dist 打包产物），
      // 其中 assets/public/** 是压缩后的 bundle，纳入 lint 只会产生大量无意义报错。
      'android/**',
      // 鸿蒙壳工程同理由生成物组成：rawfile/** 是压缩后的 Web 产物，其余是 ArkTS(.ets)。
      'harmony/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        console: 'readonly', fetch: 'readonly', localStorage: 'readonly',
        sessionStorage: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', Blob: 'readonly',
        URL: 'readonly', crypto: 'readonly', indexedDB: 'readonly',
      },
    },
    rules: {
      // ── 高价值:保持 error ──
      'react-hooks/rules-of-hooks': 'error',

      // ── 观察期降噪(项目现状,先 warn / off,后续收紧)──
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'off', // 纯前端 Dexie/动态结构大量 as any,本就需要
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      'no-control-regex': 'off',
      'no-irregular-whitespace': 'warn', // 中文项目偶有全角空格,观察期 warn
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
)
