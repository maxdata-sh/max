export const useColor = () => {
  const { env, stdout } = process

  // 1. Check for NO_COLOR (https://no-color.org/)
  if (env.NO_COLOR !== undefined) return false
  if (env.TERM === 'dumb') return false
  if (process.argv.includes('--no-color')) return false

  // 2. Force switches (The "Yes"s)
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true
  if (process.argv.includes('--color')) return true

  // 3. TTY Check (Standard behavior)
  if (stdout && stdout.isTTY) return true

  // 4. CI Fallback
  const isCI =
    ('CI' in env && (env.CI === 'true' || env.CI === '1')) ||
    'GITHUB_ACTIONS' in env ||
    'TEAMCITY_VERSION' in env

  return isCI
}
