import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

const SIZE_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.venv',
  'venv',
  'node_modules',
  'dist',
  'build',
  'release',
  'target',
  '__pycache__',
  '.pytest_cache',
])

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

function cleanDescription(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 180) : ''
}

async function readReadmeDescription(projectPath, entries) {
  const readme = entries.find((entry) => entry.isFile() && /^readme(\..+)?$/i.test(entry.name))
  if (!readme) return ''

  try {
    const content = await readFile(path.join(projectPath, readme.name), 'utf8')
    for (const sourceLine of content.split(/\r?\n/)) {
      const line = sourceLine.trim()
      if (!line || /^(#|<|\[!|!\[|---|```|\|)/.test(line)) continue
      const description = cleanDescription(
        line
          .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
          .replace(/[*_`>~]/g, '')
          .trim(),
      )
      if (description) return description
    }
  } catch {
    return ''
  }
  return ''
}

function detectStack(entries, packageJson) {
  const names = new Set(entries.map((entry) => entry.name))
  const stack = []
  const add = (name) => {
    if (!stack.includes(name)) stack.push(name)
  }
  const hasExtension = (extension) => entries.some((entry) => entry.isFile() && entry.name.endsWith(extension))

  if (packageJson || names.has('package.json')) {
    add('Node.js')
    const packages = { ...packageJson?.dependencies, ...packageJson?.devDependencies }
    if (packages.react) add('React')
    if (packages.vue) add('Vue')
    if (packages.electron) add('Electron')
    if (packages.vite) add('Vite')
  }
  if (names.has('pyproject.toml') || names.has('requirements.txt') || hasExtension('.py')) add('Python')
  if (names.has('go.mod')) add('Go')
  if (names.has('Cargo.toml')) add('Rust')
  if (names.has('pom.xml') || names.has('build.gradle') || names.has('build.gradle.kts')) add('Java')
  if (hasExtension('.sln') || hasExtension('.csproj')) add('.NET')
  if (hasExtension('.ps1')) add('PowerShell')
  if (names.has('Dockerfile') || names.has('docker-compose.yml') || names.has('docker-compose.yaml')) add('Docker')

  return stack.slice(0, 5)
}

async function inspectProject(root, directoryEntry) {
  const projectPath = path.join(root, directoryEntry.name)
  const [entries, projectStats, packageJson] = await Promise.all([
    readdir(projectPath, { withFileTypes: true }),
    stat(projectPath),
    readJson(path.join(projectPath, 'package.json')),
  ])
  const readmeDescription = packageJson?.description
    ? ''
    : await readReadmeDescription(projectPath, entries)
  const scripts = packageJson?.scripts ?? {}
  const suggestedCommand = scripts.dev ? 'npm run dev' : scripts.start ? 'npm start' : ''
  const stack = detectStack(entries, packageJson)

  return {
    id: projectPath,
    name: directoryEntry.name,
    path: projectPath,
    stack,
    itemType: suggestedCommand ? 'app' : stack.length ? 'source' : 'document',
    parentPath: null,
    description: cleanDescription(packageJson?.description) || readmeDescription,
    modifiedAt: projectStats.mtime.toISOString(),
    suggestedCommand,
  }
}

export async function scanProjects(root, expandedPaths = [], parentPath = null) {
  const entries = await readdir(root, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.') && (!parentPath || !SIZE_IGNORED_DIRECTORIES.has(entry.name)))
  const projects = await Promise.all(
    directories.map(async (entry) => {
      try {
        return await inspectProject(root, entry)
      } catch (error) {
        return {
          id: path.join(root, entry.name),
          name: entry.name,
          path: path.join(root, entry.name),
          stack: [],
          description: `读取失败：${error.message}`,
          modifiedAt: new Date(0).toISOString(),
          suggestedCommand: '',
          itemType: 'document',
          parentPath: null,
        }
      }
    }),
  )
  if (parentPath) return projects.map((project) => ({ ...project, parentPath, itemType: project.stack.length ? 'source' : 'document' }))
  for (const project of [...projects]) {
    if (!expandedPaths.includes(project.path)) continue
    try {
      await resolveProject(root, project.path)
      projects.push(...await scanProjects(project.path, [], project.path))
    } catch (error) {
      project.description = `${project.description} 子目录读取失败：${error.message}`.trim()
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function resolveProject(root, candidatePath, expandedPaths = []) {
  if (typeof candidatePath !== 'string' || !candidatePath) throw new Error('项目路径无效')
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(candidatePath)
  const parent = path.dirname(resolved)
  const allowedChild = path.dirname(parent) === resolvedRoot && expandedPaths.includes(parent) && !path.basename(resolved).startsWith('.') && !SIZE_IGNORED_DIRECTORIES.has(path.basename(resolved))
  if (resolved === resolvedRoot || (parent !== resolvedRoot && !allowedChild)) {
    throw new Error('只能管理根目录下的一级项目或已展开的子项目')
  }
  const actualRoot = await realpath(resolvedRoot)
  const actual = await realpath(resolved)
  const expected = path.join(actualRoot, path.relative(resolvedRoot, resolved))
  if (process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected) throw new Error('不能通过符号链接访问其他目录')
  const projectStats = await stat(resolved)
  if (!projectStats.isDirectory()) throw new Error('项目路径不是文件夹')
  return resolved
}

export async function calculateProjectSize(projectPath) {
  let bytes = 0
  let fileCount = 0
  let truncated = false
  const pending = [projectPath]

  while (pending.length && !truncated) {
    const current = pending.pop()
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!entry.isSymbolicLink() && !SIZE_IGNORED_DIRECTORIES.has(entry.name)) pending.push(entryPath)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const fileStats = await lstat(entryPath)
        bytes += fileStats.size
        fileCount += 1
        if (fileCount >= 200000) {
          truncated = true
          break
        }
      } catch {
      }
    }
  }

  return { bytes, truncated }
}
