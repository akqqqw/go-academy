// В SDK 58 плагины reanimated/worklets подключает babel-preset-expo,
// отдельные записи не нужны и только конфликтуют с пресетом.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
  }
}
