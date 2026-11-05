// Metro должен видеть общие пакеты из ../packages и соседние node_modules.
// Это стандартная настройка монорепозитория Expo, но без npm workspaces:
// lock-файл и установка зависимостей web остаются нетронутыми.
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.join(repoRoot, 'packages'),
]

config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(repoRoot, 'node_modules'),
]

// Явные алиасы: пакеты лежат вне node_modules, поэтому Metro ищет их здесь.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@shared/types': path.join(repoRoot, 'packages/shared-types/src'),
  '@shared/utils': path.join(repoRoot, 'packages/shared-utils/src'),
  '@shared/learning': path.join(repoRoot, 'packages/shared-learning/src'),
  '@shared/validation': path.join(repoRoot, 'packages/shared-validation/src'),
  '@shared/content': path.join(repoRoot, 'packages/shared-content/src'),
}

config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx']

module.exports = config
