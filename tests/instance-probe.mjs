import { app } from 'electron'

app.setPath('userData', process.argv[2])
process.argv.push('--production')
await import('../electron/main.mjs')
