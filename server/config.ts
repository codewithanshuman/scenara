import path from 'node:path'

export interface ServerConfig {
  port: number
  dataPath: string
  publicOrigin: string
  cloudinary: {
    cloudName?: string
    apiKey?: string
    apiSecret?: string
    uploadFolder: string
    notificationUrl?: string
    enabled: boolean
  }
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function integer(name: string, fallback: number): number {
  const raw = optional(name)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be a valid TCP port`)
  }
  return parsed
}

export function loadConfig(): ServerConfig {
  const cloudName = optional('CLOUDINARY_CLOUD_NAME')
  const apiKey = optional('CLOUDINARY_API_KEY')
  const apiSecret = optional('CLOUDINARY_API_SECRET')

  return {
    port: integer('SCENARA_PORT', 8787),
    dataPath: path.resolve(optional('SCENARA_DATA_PATH') ?? './data/scenara.db.json'),
    publicOrigin: optional('SCENARA_PUBLIC_ORIGIN') ?? 'http://127.0.0.1:5173',
    cloudinary: {
      cloudName,
      apiKey,
      apiSecret,
      uploadFolder: optional('CLOUDINARY_UPLOAD_FOLDER') ?? 'scenara',
      notificationUrl: optional('CLOUDINARY_NOTIFICATION_URL'),
      enabled: Boolean(cloudName && apiKey && apiSecret),
    },
  }
}
