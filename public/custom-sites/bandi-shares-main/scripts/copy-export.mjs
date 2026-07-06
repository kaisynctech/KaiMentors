import { cp, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(root, '..')
const outDir = path.join(siteRoot, 'out')
const targetDir = path.resolve(siteRoot, '..', 'bandi-shares', 'v1')

await rm(targetDir, { recursive: true, force: true })
await mkdir(targetDir, { recursive: true })
await cp(outDir, targetDir, { recursive: true })
console.log(`Copied static export to ${targetDir}`)
