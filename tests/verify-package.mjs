import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { extractFile } from '@electron/asar'
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit'

const expected = JSON.parse(await readFile('package.json', 'utf8'))
const archive = path.resolve(process.argv[2] ?? `release/${expected.version}/win-unpacked/resources/app.asar`)
let checked = 0
for (const directory of ['electron', 'dist', 'assets']) {
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    const relative = path.relative(process.cwd(), path.resolve(file))
    assert.deepEqual(extractFile(archive, relative), await readFile(file), relative)
    checked++
  }
}
const packaged = JSON.parse(extractFile(archive, 'package.json'))
assert.equal(packaged.version, expected.version)
console.log(`Verified ${checked} packaged source/build files; version ${packaged.version}`)
const expectedIcons = Data.IconFile.from(await readFile('assets/icon.ico')).icons.map(icon => Buffer.from(icon.data.bin))
const appDirectory = path.dirname(path.dirname(archive))
for (const executable of [path.join(appDirectory, '项目中台.exe'), path.join(path.dirname(appDirectory), `project-hub-${expected.version}.exe`)]) {
  const resources = NtExecutableResource.from(NtExecutable.from(await readFile(executable)))
  const group = Resource.IconGroupEntry.fromEntries(resources.entries)[0]
  assert.ok(group, `No icon group in ${executable}`)
  const icons = group.getIconItemsFromEntries(resources.entries).filter(icon => icon.isRaw()).map(icon => Buffer.from(icon.bin))
  for (const expectedIcon of expectedIcons) assert.ok(icons.some(icon => icon.equals(expectedIcon)), `Custom PH icon missing in ${executable}`)
  console.log(`Verified ${icons.length} embedded PH icon sizes in ${path.basename(executable)}`)
}
