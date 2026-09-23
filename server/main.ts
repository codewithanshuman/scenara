import { loadConfig } from './config.js'
import { JsonDatabase } from './db/store.js'
import { seedDatabase } from './seed.js'
import { ScenaraApplication } from './app.js'
import { createHttpServer } from './http.js'

const config = loadConfig()
const database = new JsonDatabase(config.dataPath)
await database.initialize(seedDatabase())
const application = new ScenaraApplication(config, database)
const server = createHttpServer(application)

server.listen(config.port, '127.0.0.1', () => {
  const mode = application.cloudinary.enabled ? 'Cloudinary' : 'local adapter'
  process.stdout.write(`Scenara API listening on http://127.0.0.1:${config.port} (${mode})\n`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
