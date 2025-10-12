const keys = [
  'PORT',
  'CHANNEL_IDS',
  'SLACK_SIGNING_SECRET',
  'SLACK_OAUTH_TOKEN',
  'SLACK_APP_ID',
  'SIEGE_SESSION',
] as const

export function getEnv(): Record<(typeof keys)[number], string> {
  return keys
    .map((key) => {
      const value = process.env[key]
      if (!value) {
        throw new Error(`Environment variable ${key} is not set`)
      }
      return [key, value] as const
    })
    .reduce((o, [k, v]) => {
      o[k] = v
      return o
    }, {} as Record<(typeof keys)[number], string>)
}
