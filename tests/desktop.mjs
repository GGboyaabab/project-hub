// Runs the real Electron main process, preload, renderer and IPC with isolated data.
import { app, BrowserWindow, dialog, shell } from 'electron'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-results')
await mkdir(output, { recursive: true })
const fixture = await mkdtemp(path.join(output, 'desktop-'))
const root = path.join(fixture, 'projects')
const alternateRoot = path.join(fixture, 'alternative-root')
await mkdir(path.join(alternateRoot, 'other-project'), { recursive: true })
let chosenRoot = null
const organizationMode = process.argv.includes('--organization')
const knowledgeMode = process.argv.includes('--knowledge')
let openedKnowledgeUrl = null
let revealedKnowledgeFile = null
let closeKnowledgePromptCount = 0
if (organizationMode) {
  for (const name of ['DDos2026', 'ds_harness', 'github', 'job', 'yiliao']) {
    await mkdir(path.join(root, name), { recursive: true })
    await writeFile(path.join(root, name, 'marker.txt'), 'Original files must remain unchanged')
  }
  for (const name of ['repo-a', 'repo-b', 'node_modules', '.cache']) await mkdir(path.join(root, 'github', name))
  await writeFile(path.join(root, 'github/repo-a/package.json'), JSON.stringify({ scripts: { dev: 'node server.cjs' } }))
  await writeFile(path.join(root, 'github/repo-a/server.cjs'), 'console.log("nested-ready",process.cwd()); setInterval(()=>{},1000)')
  await writeFile(path.join(root, 'github/repo-b/main.py'), '# source')
} else {
for (const name of ['alpha-web', 'beta-python', 'empty']) await mkdir(path.join(root, name), { recursive: true })
await writeFile(path.join(root, 'alpha-web/package.json'), JSON.stringify({ description: '前端测试项目', dependencies: { react: '1' }, scripts: { dev: 'node server.cjs' } }))
await writeFile(path.join(root, 'alpha-web/server.cjs'), 'console.log("服务就绪", "CHILD_PID:" + process.pid); console.error("测试错误输出"); setInterval(() => console.log("tick"), 1000)')
await writeFile(path.join(root, 'beta-python/main.py'), '# test')
await writeFile(path.join(root, 'beta-python/README.md'), '# Test\nPython description')
}
const referenceFile = path.join(root, organizationMode ? 'job' : 'alpha-web', 'reference.txt')
dialog.showOpenDialog = async (_window, options) => options.title === '选择项目工作区'
  ? { canceled: !chosenRoot, filePaths: chosenRoot ? [chosenRoot] : [] }
  : { canceled: false, filePaths: [referenceFile] }
if (knowledgeMode) {
  await writeFile(referenceFile, 'Original reference file')
  shell.openExternal = async url => { openedKnowledgeUrl = url }
  shell.showItemInFolder = file => { revealedKnowledgeFile = file }
  dialog.showMessageBoxSync = () => { closeKnowledgePromptCount++; return 0 }
}
process.env.PROJECT_HUB_ROOT = root
process.argv.push('--production')
app.setPath('userData', path.join(fixture, 'user-data'))
const results = []
const errors = []
let window
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (code) => window.webContents.executeJavaScript(code, true)
const dom = (selector) => `document.querySelector(${JSON.stringify(selector)})`

async function waitFor(code) {
  for (let i = 0; i < 150; i++) {
    if (await js(code)) return
    await sleep(50)
  }
  throw new Error('Timeout: ' + code)
}
async function click(selector) {
  if (['.nav-archived','.nav-hidden'].includes(selector) && !await js(`!!${dom(selector)}`)) await click('.more-views')
  assert.ok(await js(`!!${dom(selector)}`), 'Missing control: ' + selector)
  await js(`${dom(selector)}.click()`)
  await sleep(100)
}
async function set(selector, value) {
  await js(`{ const el=${dom(selector)}; const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true})); }`)
  await sleep(100)
}
async function button(text, scope = 'document') {
  await js(`{ const el=[...${scope}.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)}); if(!el)throw Error('Missing button: '+${JSON.stringify(text)}); el.click(); }`)
  await sleep(150)
}
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log('PASS ' + name) }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message) }
}
const cardNames = () => js(`[...document.querySelectorAll('.project-card h3')].map(el=>el.textContent)`)
const state = () => js('window.projectHub.getState()')

app.on('browser-window-created', (_event, created) => {
  if (window) return
  window = created
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') errors.push(details.message)
  })
  window.webContents.on('render-process-gone', (_event, details) => errors.push(JSON.stringify(details)))
  window.webContents.once('did-finish-load', () => void (knowledgeMode ? runKnowledge() : organizationMode ? runOrganization() : run()))
})

async function run() {
  try {
    await waitFor(`document.querySelectorAll('.project-card').length === 3`)
    await check('首次扫描、技术栈、默认命令、详情加载', async () => {
      const s = await state()
      assert.equal(s.projects.length, 3)
      assert.deepEqual(s.projects[0].stack, ['Node.js', 'React'])
      assert.equal(s.projects[0].command, 'npm run dev')
      assert.equal(await js(`document.querySelector('.details-header h2').textContent`), 'alpha-web')
    })
    for (const query of ['ALPHA', 'React', '前端测试项目', root, '不存在的项目']) {
      await check('搜索：' + (query === root ? '路径' : query), async () => {
        await set('.search-input', query)
        assert.equal((await cardNames()).length, query === root ? 3 : query === '不存在的项目' ? 0 : 1)
      })
    }
    await check('无结果提示与查看全部项目', async () => {
      assert.ok(await js(`!!document.querySelector('.empty-list')`))
      await button('查看全部项目')
      assert.equal((await cardNames()).length, 3)
    })
    await check('收藏切换、收藏数量与收藏筛选', async () => {
      await click('.project-card .favorite-button')
      await waitFor(`document.querySelector('.project-card .favorite-button').textContent === '已收藏'`)
      await click('.nav-favorite')
      assert.deepEqual(await cardNames(), ['alpha-web'])
      await button('取消收藏')
      await waitFor(`document.querySelectorAll('.project-card').length === 0`)
      await click('.nav-all')
    })
    await check('新建分组与重复名称错误提示', async () => {
      await click('.group-create-toggle')
      await set('.new-group-form input', '测试分组')
      await click('.new-group-form button')
      await waitFor(`document.querySelectorAll('.group-select').length === 1`)
      await click('.group-create-toggle')
      await set('.new-group-form input', '测试分组')
      await click('.new-group-form button')
      await waitFor(`document.querySelector('.toast')?.textContent.includes('同名')`)
      await set('.new-group-form input', '')
      await click('.group-create-toggle')
    })
    await check('保存分组、中文标签去重、备注及命令', async () => {
      const s = await state()
      await set('.project-form select', s.groups[0].id)
      await set('.project-form input', '前端， 工作,前端')
      await set('.project-form textarea', '备注搜索标记')
      await set('.project-form label:last-of-type input', 'node server.cjs')
      await click('.save-button')
      await waitFor(`document.querySelector('.toast')?.textContent === '项目配置已保存'`)
      const project = (await state()).projects[0]
      assert.deepEqual(project.tags, ['前端', '工作'])
      assert.equal(project.notes, '备注搜索标记')
      assert.equal(project.command, 'node server.cjs')
      assert.equal(project.groupId, s.groups[0].id)
    })
    for (const query of ['工作', '备注搜索标记']) {
      await check('搜索标签或备注：' + query, async () => {
        await set('.search-input', query)
        assert.deepEqual(await cardNames(), ['alpha-web'])
        await set('.search-input', '')
      })
    }
    await check('分组筛选、重命名与取消', async () => {
      await click('.group-select')
      assert.deepEqual(await cardNames(), ['alpha-web'])
      await click('.group-menu-toggle')
      await button('重命名')
      await button('取消', `document.querySelector('.group-actions')`)
      await button('重命名')
      await set('.group-actions input', '重命名分组')
      await button('保存', `document.querySelector('.group-actions')`)
      await waitFor(`document.querySelector('h1').textContent === '重命名分组'`)
    })
    await check('删除分组取消确认保留数据', async () => {
      await js('void (window.confirm = () => false)')
      await click('.group-menu-toggle')
      await button('删除分组')
      assert.equal((await state()).groups.length, 1)
    })
    await check('删除分组保留项目配置，再次保存不恢复已删除分组', async () => {
      await js('void (window.confirm = () => true)')
      await button('删除分组')
      await waitFor(`document.querySelectorAll('.group-select').length === 0`)
      assert.equal((await state()).projects[0].groupId, null)
      await click('.save-button')
      await sleep(100)
      assert.equal((await state()).projects[0].groupId, null)
      assert.equal((await state()).projects[0].notes, '备注搜索标记')
    })
    await check('按名称、最近修改、收藏优先排序', async () => {
      await set('.sort-select', 'name')
      assert.deepEqual(await cardNames(), ['alpha-web', 'beta-python', 'empty'])
      await set('.sort-select', 'modified')
      const s = await state()
      assert.deepEqual(await cardNames(), [...s.projects].sort((a,b) => new Date(b.modifiedAt)-new Date(a.modifiedAt)).map(p => p.name))
      await set('.sort-select', 'name')
      await click('.project-card:last-child .favorite-button')
      await set('.sort-select', 'favorite')
      assert.equal((await cardNames())[0], 'empty')
    })
    await check('卡片选择、无命令启动提示', async () => {
      await click('.project-card:first-child .secondary-button')
      await set('.item-type-select', 'app')
      await click('.save-button')
      await click('.project-card:first-child .project-card-actions .primary-button')
      await waitFor(`document.querySelector('.toast')?.textContent.includes('设置启动命令')`)
      assert.equal(await js(`document.querySelector('.details-header h2').textContent`), 'empty')
      await set('.sort-select', 'name')
      await click('.project-card:first-child .secondary-button')
    })
    await check('计算目录大小', async () => {
      await button('计算目录大小')
      await waitFor(`!!document.querySelector('.size-result')`)
      assert.ok(await js(`document.querySelector('.size-result').textContent.includes('目录大小')`))
    })
    await check('打开项目文件夹（调用真实 Windows 文件管理器）', async () => {
      const p = (await state()).projects[0].path
      await js(`window.projectHub.openFolder(${JSON.stringify(p)})`)
    })
    await check('详情启动、实时日志、运行中筛选与 PID', async () => {
      await button('启动项目')
      await waitFor(`document.querySelector('.log-viewer').textContent.includes('服务就绪')`)
      await waitFor(`document.querySelector('.log-viewer').textContent.includes('测试错误输出')`)
      assert.ok((await state()).projects[0].runtime.pid)
      await click('.nav-running')
      assert.deepEqual(await cardNames(), ['alpha-web'])
      assert.ok(await js(`!!document.querySelector('.running-dot')`))
      chosenRoot = alternateRoot
      const message = await js(`window.projectHub.chooseRoot().then(()=>'',error=>error.message)`)
      assert.match(message, /停止运行/)
      assert.equal((await state()).root, root)
      chosenRoot = null
    })
    await check('卡片停止进程、运行数量归零、清空日志', async () => {
      await click('.project-card .stop-button')
      await waitFor(`document.querySelector('.details-header .runtime-badge').textContent === '已退出'`)
      assert.equal((await cardNames()).length, 0)
      await button('清空', `document.querySelector('.log-section')`)
      await waitFor(`!!document.querySelector('.log-empty')`)
      await click('.nav-all')
    })
    await check('卡片重新启动、详情停止', async () => {
      await click('.project-card:first-child .primary-button')
      await waitFor(`document.querySelector('.details-header .runtime-badge').textContent === '运行中'`)
      await button('停止项目')
      await waitFor(`document.querySelector('.details-header .runtime-badge').textContent === '已退出'`)
    })
    await check('错误命令显示异常退出和错误日志', async () => {
      await set('.project-form label:last-of-type input', 'project_hub_command_does_not_exist_123')
      await button('启动项目')
      await waitFor(`document.querySelector('.details-header .runtime-badge').textContent === '异常退出'`)
      assert.ok((await state()).projects[0].runtime.logs.some(log => log.stream === 'stderr'))
    })
    await check('刷新发现新增项目，删除后刷新移除项目', async () => {
      await mkdir(path.join(root, 'new-project'))
      await button('刷新项目')
      await waitFor(`document.querySelectorAll('.project-card').length === 4`)
      const { rmdir } = await import('node:fs/promises')
      await rmdir(path.join(root, 'new-project'))
      await button('刷新项目')
      await waitFor(`document.querySelectorAll('.project-card').length === 3`)
    })
    await check('27 个项目时卡片不压缩，宽窄窗口和侧栏收起均可滚动到完整操作区', async () => {
      const names = Array.from({length:24}, (_,i) => `layout-${String(i).padStart(2,'0')}${i === 23 ? '-very-long-project-name-for-layout' : ''}`)
      try {
        for (const name of names) await mkdir(path.join(root,name))
        await writeFile(path.join(root,names[0],'package.json'),JSON.stringify({description:'用于检查项目较多时的卡片布局，简介换行后仍应保留完整的标签与操作按钮。'.repeat(3)}))
        await button('刷新项目')
        await waitFor(`document.querySelectorAll('.project-card').length===27`)
        await js(`window.projectHub.updateProject(${JSON.stringify(path.join(root,names[0]))},{tags:${JSON.stringify(Array.from({length:8},(_,i)=>`较长的测试标签内容${i}`))}})`)
        await button('刷新项目')
        await waitFor(`document.querySelectorAll('.project-card').length===27`)
        window.show()
        for (const width of [1480,1120]) {
          window.setSize(width,width===1120?720:920)
          for (const collapsed of [false,true]) {
            if (await js(`document.querySelector('.sidebar').classList.contains('is-collapsed')`) !== collapsed) await click('.sidebar-toggle')
            await js(`document.querySelector('.project-grid').scrollTop=0`)
            await sleep(600)
            const metrics=await js(`(()=>{const grid=document.querySelector('.project-grid');return{minHeight:Math.min(...[...grid.querySelectorAll('.project-card')].map(card=>card.getBoundingClientRect().height)),clipped:[...grid.querySelectorAll('.project-card')].filter(card=>card.querySelector('.project-card-actions').getBoundingClientRect().bottom>card.getBoundingClientRect().bottom+1).map(card=>card.querySelector('h3').textContent),scroll:grid.scrollHeight>grid.clientHeight,horizontal:document.documentElement.scrollWidth>innerWidth}})()`)
            assert.ok(metrics.minHeight>=240,JSON.stringify({width,collapsed,...metrics}))
            assert.equal(metrics.scroll,true)
            assert.equal(metrics.horizontal,false)
            assert.deepEqual(metrics.clipped,[], 'Long descriptions and wrapped tags must not clip actions')
            await js(`document.querySelector('.project-card:last-child').scrollIntoView({block:'end'})`)
            await sleep(150)
            assert.ok(await js(`(()=>{const card=document.querySelector('.project-card:last-child'), r=card.getBoundingClientRect(),a=card.querySelector('.project-card-actions').getBoundingClientRect(),g=document.querySelector('.project-grid').getBoundingClientRect();return a.top>=r.top&&a.bottom<=r.bottom&&a.bottom<=g.bottom&&a.top>=g.top})()`),'Last card action area must be visible and inside the card')
            if(!collapsed){
              await js(`document.querySelector('.project-grid').scrollTop=0`)
              await sleep(150)
              await writeFile(path.join(output,`projects-27-${width}.png`),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG())
            }
          }
        }
      } finally {
        if(await js(`document.querySelector('.sidebar').classList.contains('is-collapsed')`))await click('.sidebar-toggle')
        window.setSize(1480,920)
        for(const name of names)await rm(path.join(root,name),{recursive:true,force:true})
        await button('刷新项目')
        await waitFor(`document.querySelectorAll('.project-card').length===3`)
      }
    })
    await check('IPC 拒绝根目录和项目目录外的操作', async () => {
      for (const method of ['updateProject', 'startProject', 'stopProject', 'clearLogs', 'calculateSize', 'openFolder']) {
        const message = await js(`window.projectHub.${method}(${JSON.stringify(root)},{}).then(()=>'',error=>error.message)`)
        assert.match(message, /一级项目/)
      }
    })
    await check('重新加载后收藏、标签、备注、启动命令持久化', async () => {
      const before = await state()
      window.reload()
      await new Promise(resolve => window.webContents.once('did-finish-load', resolve))
      await waitFor(`document.querySelectorAll('.project-card').length === 3`)
      const after = await state()
      assert.deepEqual(after.projects.map(p => [p.favorite,p.groupId,p.tags,p.notes,p.command]), before.projects.map(p => [p.favorite,p.groupId,p.tags,p.notes,p.command]))
    })
    await check('最小窗口布局无横向溢出', async () => {
      window.setSize(1120, 720)
      await sleep(300)
      assert.ok(await js('document.documentElement.scrollWidth <= window.innerWidth'))
      await writeFile(path.join(output, 'desktop-minimum.png'), (await window.webContents.capturePage()).toPNG())
      window.setSize(1480, 920)
    })
    await check('侧边栏层级、按需创建、更多视图、收起导航和偏好持久化', async () => {
      assert.equal(await js(`document.querySelectorAll('nav[aria-label="工作台"] > button').length`), 2)
      assert.equal(await js(`!!document.querySelector('.new-group-form')`), false)
      assert.equal(await js(`document.querySelector('.sidebar-footer .settings-nav').getAttribute('aria-label')`), '设置')
      await click('.more-views')
      assert.equal(await js(`!!document.querySelector('.nav-archived')`), true)
      await click('.more-views')
      assert.equal(await js(`!!document.querySelector('.nav-archived')`), false)
      await click('.sidebar-toggle')
      assert.ok(await js(`document.querySelector('.sidebar').clientWidth <= 64`))
      await click('.knowledge-nav')
      assert.ok(await js(`!!document.querySelector('.knowledge-square')`))
      await click('.settings-nav')
      assert.ok(await js(`!!document.querySelector('.model-settings')`))
      await click('.nav-all')
      window.reload()
      await new Promise(resolve => window.webContents.once('did-finish-load', resolve))
      await waitFor(`!!document.querySelector('.sidebar.is-collapsed')`)
      window.setSize(1120,720)
      await sleep(200)
      assert.ok(await js(`document.documentElement.scrollWidth <= innerWidth`))
      await writeFile(path.join(output,'sidebar-collapsed.png'), (await window.webContents.capturePage()).toPNG())
      await click('.sidebar-toggle')
      window.setSize(1480,920)
      await sleep(200)
    })
    await check('工作区目录查看、取消、切换、持久化与原配置保留', async () => {
      const before = await state()
      await click('.workspace-trigger')
      assert.equal(await js(`document.querySelector('.workspace-popover code').textContent`), root)
      await button('切换目录…')
      assert.equal((await state()).root,root)
      const invalidRoot = path.join(fixture, 'not-a-directory.txt')
      await writeFile(invalidRoot, 'not a directory')
      chosenRoot = invalidRoot
      const invalidMessage = await js(`window.projectHub.chooseRoot().then(()=>'',error=>error.message)`)
      assert.match(invalidMessage, /有效的目录/)
      assert.equal((await state()).root,root)
      chosenRoot = alternateRoot
      await click('.workspace-trigger')
      await button('切换目录…')
      await waitFor(`document.querySelector('.workspace-trigger strong').textContent==='alternative-root'`)
      assert.deepEqual(await cardNames(), ['other-project'])
      const {SettingsStore}=await import('../electron/settings-store.mjs')
      const reopened=new SettingsStore(path.join(fixture,'user-data/settings.json'))
      await reopened.init()
      assert.equal(reopened.getManagedRoot(),alternateRoot)
      chosenRoot=root
      await click('.workspace-trigger')
      await button('切换目录…')
      await waitFor(`document.querySelectorAll('.project-card').length===3`)
      const after=await state()
      assert.deepEqual(after.projects.map(p=>[p.path,p.notes,p.tags,p.favorite,p.command]),before.projects.map(p=>[p.path,p.notes,p.tags,p.favorite,p.command]))
      chosenRoot=null
    })
    await check('渲染器无错误、隔离与沙箱开启', async () => {
      assert.deepEqual(errors, [])
      const preferences = window.webContents.getLastWebPreferences()
      assert.equal(preferences.sandbox, true)
      assert.equal(preferences.contextIsolation, true)
      assert.equal(preferences.nodeIntegration, false)
      assert.equal(await js('typeof window.require'), 'undefined')
    })
    await writeFile(path.join(output, 'desktop.png'), (await window.webContents.capturePage()).toPNG())
    await check('磁盘配置由全新设置实例读取', async () => {
      const { SettingsStore } = await import('../electron/settings-store.mjs')
      const reopened = new SettingsStore(path.join(fixture, 'user-data/settings.json'))
      await reopened.init()
      const s = await state()
      for (const p of s.projects) {
        const saved = reopened.getProject(p.path)
        assert.deepEqual([saved.favorite,saved.groupId,saved.tags,saved.notes,saved.command], [p.favorite,p.groupId,p.tags,p.notes,p.command])
      }
      assert.ok(JSON.parse(await readFile(reopened.filePath, 'utf8')))
    })
    await check('空管理目录、空详情和恢复刷新', async () => {
      for (const name of ['alpha-web', 'beta-python', 'empty']) await rm(path.join(root, name), { recursive: true })
      await button('刷新项目')
      await waitFor(`!!document.querySelector('.empty-details') && !!document.querySelector('.empty-list')`)
      await mkdir(path.join(root, 'shutdown-test'))
      await writeFile(path.join(root, 'shutdown-test/package.json'), JSON.stringify({scripts:{dev:'node server.cjs'}}))
      await writeFile(path.join(root, 'shutdown-test/server.cjs'), 'console.log("CHILD_PID:" + process.pid); setInterval(() => {},1000)')
      await button('刷新项目')
      await waitFor(`document.querySelectorAll('.project-card').length === 1`)
    })
    await set('.project-form label:last-of-type input', 'node server.cjs')
    await button('启动项目')
    await waitFor(`document.querySelector('.log-viewer').textContent.includes('CHILD_PID:')`)
    const childPid = Number((await js(`document.querySelector('.log-viewer').textContent`)).match(/CHILD_PID:(\d+)/)[1])
    app.once('will-quit', (event) => {
      event.preventDefault()
      void check('关闭窗口自动停止其项目进程树', async () => {
        let alive = true
        for (let i = 0; i < 100; i++) {
          try { process.kill(childPid, 0) } catch (error) {
            if (error.code !== 'ESRCH') throw error
            alive = false
            break
          }
          await sleep(50)
        }
        assert.equal(alive, false, `Project process ${childPid} survived application shutdown`)
      }).then(finish)
    })
    window.close()
    return
  } catch (error) { results.push({name:'测试运行器',passed:false,error:error.stack}) }
  await finish()
}

async function finish() {
  await writeFile(path.join(output, knowledgeMode ? 'knowledge.json' : organizationMode ? 'organization.json' : 'desktop.json'), JSON.stringify({ fixture, results, errors }, null, 2))
  console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,output}))
  app.exit(results.some(r => !r.passed) ? 1 : 0)
}

async function selectProject(name) {
  await js(`{ const card=[...document.querySelectorAll('.project-card')].find(el=>el.querySelector('h3').textContent===${JSON.stringify(name)}); if(!card)throw Error('Missing project '+${JSON.stringify(name)}); card.click(); }`)
  await waitFor(`document.querySelector('.details-header h2')?.textContent === ${JSON.stringify(name)}`)
  await sleep(100)
}

async function rejected(code, pattern) {
  assert.match(await js(`(${code}).then(()=>'',error=>error.message)`), pattern)
}

async function runOrganization() {
  const projectPath = name => path.join(root, name)
  const preferences = async name => (await state()).projects.find(p => p.path === projectPath(name))
  try {
    await waitFor(`document.querySelectorAll('.project-card').length === 6`)
    await check('五类目录预设分组、标签、类型及旧工具归档', async () => {
      const s = await state()
      assert.equal(s.projects.length, 7)
      assert.equal(s.groups.length, 5)
      for (const [name, type, group] of [['DDos2026','dataset','毕业设计'],['ds_harness','source','工具归档'],['github','source','开源学习'],['job','document','求职资料'],['yiliao','dataset','医疗研究']]) {
        const p = await preferences(name)
        assert.equal(p.itemType, type)
        assert.equal(s.groups.find(g => g.id === p.groupId).name, group)
        assert.ok(p.tags.length && p.notes.length)
      }
      assert.equal((await preferences('ds_harness')).visibility, 'archived')
      assert.ok(!(await cardNames()).includes('ds_harness'))
    })
    await check('GitHub 默认展开一层且跳过依赖目录，子项目继承分组', async () => {
      const parent = await preferences('github')
      const child = await preferences('github/repo-a')
      assert.equal(parent.expanded, true)
      assert.equal(child.parentPath, parent.path)
      assert.equal(child.groupId, parent.groupId)
      assert.equal(child.itemType, 'source')
      assert.equal((await state()).projects.some(p => p.name === 'node_modules' || p.name === '.cache'), false)
      await selectProject('repo-a')
      assert.equal(await js(`!!document.querySelector('.expand-children')`), false)
      await rejected(`window.projectHub.updateProject(${JSON.stringify(child.path)},{expanded:true})`, /一层/)
    })
    await check('非应用条目只显示打开目录，IPC 也拒绝启动', async () => {
      assert.equal(await js(`[...document.querySelectorAll('.project-card-actions button')].some(el=>el.textContent==='启动')`), false)
      assert.equal(await js(`!!document.querySelector('.process-actions .primary-button')`), false)
      assert.equal(await js(`!!document.querySelector('.log-section')`), false)
      for (const name of ['DDos2026','job','github/repo-a']) await rejected(`window.projectHub.startProject(${JSON.stringify(projectPath(name))},'echo should-not-run')`, /只有应用/)
    })
    await check('应用、源码、数据集、资料的类型筛选', async () => {
      for (const [type, count] of [['dataset',2],['document',1],['source',3],['app',0]]) {
        await set('.type-filter', type)
        assert.equal((await cardNames()).length, count)
      }
      await button('查看全部项目')
      assert.equal((await cardNames()).length, 6)
    })
    await check('预设标签参与搜索', async () => {
      await set('.search-input', '实验结果')
      assert.deepEqual(await cardNames(), ['DDos2026'])
      await set('.search-input', '')
    })
    await check('归档、归档视图、收藏计数与恢复，不改动文件', async () => {
      await selectProject('DDos2026')
      await button('收藏项目')
      await button('归档')
      assert.ok(!(await cardNames()).includes('DDos2026'))
      assert.equal(await js(`document.querySelector('.nav-favorite b') === null`), true)
      await click('.nav-archived')
      assert.deepEqual((await cardNames()).sort(), ['DDos2026','ds_harness'].sort())
      await selectProject('DDos2026')
      assert.equal((await preferences('DDos2026')).favorite, true)
      await button('恢复到日常视图')
      assert.equal((await preferences('DDos2026')).visibility, 'active')
      await click('.nav-all')
      assert.ok((await cardNames()).includes('DDos2026'))
    })
    await check('隐藏、隐藏视图与恢复', async () => {
      await selectProject('job')
      await button('隐藏')
      assert.ok(!(await cardNames()).includes('job'))
      await click('.nav-hidden')
      assert.deepEqual(await cardNames(), ['job'])
      await button('恢复到日常视图')
      await click('.nav-all')
      assert.equal((await preferences('job')).visibility, 'active')
    })
    await check('子项目切换为应用并保存独立命令、标签和备注', async () => {
      await selectProject('repo-a')
      await set('.item-type-select', 'app')
      await set('.project-form label:last-of-type input', 'node server.cjs')
      await set('.project-form input', '独立子项目')
      await set('.project-form textarea', '子项目用途说明')
      await click('.save-button')
      await waitFor(`document.querySelector('.details-header .runtime-badge').textContent === '未运行'`)
      assert.equal((await preferences('github/repo-a')).itemType, 'app')
    })
    await check('嵌套项目在自身目录执行命令并输出日志', async () => {
      await button('启动项目')
      await waitFor(`document.querySelector('.log-viewer')?.textContent.includes('nested-ready')`)
      assert.ok(await js(`document.querySelector('.log-viewer').textContent.includes(${JSON.stringify(projectPath('github/repo-a'))})`))
      assert.ok((await preferences('github/repo-a')).runtime.pid)
    })
    await check('运行中禁止改类型、归档、隐藏或收起包含它的目录', async () => {
      const child = JSON.stringify(projectPath('github/repo-a'))
      const parent = JSON.stringify(projectPath('github'))
      for (const patch of [{itemType:'source'}, {visibility:'archived'}, {visibility:'hidden'}]) await rejected(`window.projectHub.updateProject(${child},${JSON.stringify(patch)})`, /请先停止/)
      for (const patch of [{expanded:false}, {visibility:'archived'}, {visibility:'hidden'}]) await rejected(`window.projectHub.updateProject(${parent},${JSON.stringify(patch)})`, /请先停止/)
      assert.equal((await preferences('github')).expanded, true)
      await button('停止项目')
      await waitFor(`document.querySelector('.details-header .runtime-badge').textContent === '已退出'`)
    })
    await check('收起停止扫描子项目，重新展开保留独立配置', async () => {
      await selectProject('github')
      await click('.expand-children input')
      await waitFor(`document.querySelectorAll('.project-card').length === 4`)
      await rejected(`window.projectHub.openFolder(${JSON.stringify(projectPath('github/repo-a'))})`, /一级项目或已展开/)
      await click('.expand-children input')
      await waitFor(`document.querySelectorAll('.project-card').length === 6`)
      const p = await preferences('github/repo-a')
      assert.equal(p.itemType, 'app')
      assert.deepEqual(p.tags, ['独立子项目'])
      assert.equal(p.notes, '子项目用途说明')
    })
    await check('归档父目录暂时收起子项目，恢复后配置仍保留', async () => {
      await button('归档')
      await waitFor(`document.querySelectorAll('.project-card').length === 3`)
      await click('.nav-archived')
      await selectProject('github')
      await button('恢复到日常视图')
      await click('.nav-all')
      await waitFor(`document.querySelectorAll('.project-card').length === 6`)
      assert.equal((await preferences('github/repo-a')).notes, '子项目用途说明')
    })
    await check('单独隐藏子项目且不影响父目录和其他仓库', async () => {
      await selectProject('repo-b')
      await button('隐藏')
      assert.ok((await cardNames()).includes('github'))
      assert.ok((await cardNames()).includes('repo-a'))
      assert.ok(!(await cardNames()).includes('repo-b'))
      await click('.nav-hidden')
      await selectProject('repo-b')
      await button('恢复到日常视图')
      await click('.nav-all')
    })
    await check('恢复旧工具后刷新与重新加载不会重新归档', async () => {
      await click('.nav-archived')
      await selectProject('ds_harness')
      await button('恢复到日常视图')
      await button('刷新项目')
      window.reload()
      await new Promise(resolve => window.webContents.once('did-finish-load', resolve))
      await waitFor(`document.querySelectorAll('.project-card').length === 7`)
      assert.equal((await preferences('ds_harness')).visibility, 'active')
    })
    await check('所有原目录和标记文件保持不变，分类信息已写入磁盘', async () => {
      for (const name of ['DDos2026','ds_harness','github','job','yiliao']) assert.equal(await readFile(path.join(root,name,'marker.txt'),'utf8'), 'Original files must remain unchanged')
      const { SettingsStore } = await import('../electron/settings-store.mjs')
      const reopened = new SettingsStore(path.join(fixture,'user-data/settings.json'))
      await reopened.init()
      assert.equal(reopened.getProject(projectPath('github/repo-a')).notes, '子项目用途说明')
      assert.equal(reopened.getProject(projectPath('ds_harness')).visibility, 'active')
    })
    await check('分类界面最小窗口布局与渲染器检查', async () => {
      await selectProject('DDos2026')
      window.show()
      window.setSize(1120,720)
      await sleep(300)
      assert.ok(await js('document.documentElement.scrollWidth <= window.innerWidth'))
      assert.ok(await js(`document.querySelector('.toolbar').scrollWidth <= document.querySelector('.toolbar').clientWidth`))
      assert.deepEqual(errors, [])
      await writeFile(path.join(output,'organization-minimum.png'),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG())
      window.setSize(1480,920)
      await sleep(200)
      await writeFile(path.join(output,'organization.png'),(await window.webContents.capturePage()).toPNG())
    })
  } catch (error) { results.push({name:'分类测试运行器',passed:false,error:error.stack}) }
  // Ensure a failed test cannot leave its sample service running.
  for (const p of (await state()).projects) if (['running','stopping'].includes(p.runtime.status)) await js(`window.projectHub.stopProject(${JSON.stringify(p.path)})`)
  await sleep(500)
  await finish()
}

async function runKnowledge() {
  const selectKnowledge = async title => {
    await js(`{const card=[...document.querySelectorAll('.knowledge-card')].find(el=>el.querySelector('h2')?.textContent===${JSON.stringify(title)});if(!card)throw Error('Missing knowledge card');card.click();}`)
    await sleep(100)
  }
  const clearFilters = async () => {
    await set('.knowledge-search','')
    await set('.knowledge-category-filter','all')
    await set('.knowledge-kind-filter','all')
    if (await js(`document.querySelector('.knowledge-pinned-filter').getAttribute('aria-pressed')==='true'`)) await click('.knowledge-pinned-filter')
  }
  try {
    await waitFor(`document.querySelectorAll('.project-card').length === 3`)
    await check('知识广场入口、空状态与统计',async()=>{
      await click('.knowledge-nav')
      await waitFor(`!!document.querySelector('.knowledge-square')`)
      assert.equal(await js(`document.querySelector('.knowledge-header h1').textContent`),'知识广场')
      assert.ok(await js(`document.querySelector('.knowledge-empty').textContent.includes('从一条笔记开始')`))
      assert.equal((await state()).knowledge.length,0)
    })
    await check('设置独立入口、空知识库可配置及未保存保护',async()=>{
      assert.equal(await js(`document.querySelector('.knowledge-square .model-settings')`),null)
      await click('.settings-nav')
      await waitFor(`document.querySelector('.model-name')?.value==='deepseek-flash'`)
      assert.equal(await js(`document.querySelector('.settings-page h1').textContent`),'设置')
      await set('.model-name','unsaved-model')
      await js('void(window.confirm=()=>false)')
      await click('.knowledge-nav')
      assert.ok(await js(`!!document.querySelector('.settings-page')`))
      await js('void(window.confirm=()=>true)')
      await click('.knowledge-nav')
      assert.ok(await js(`!!document.querySelector('.knowledge-square')`))
    })
    await check('项目资料自动列出非应用目录并跳转到项目详情',async()=>{
      await button('项目资料')
      assert.equal(await js(`document.querySelectorAll('.resource-card').length`),2)
      await click('.resource-card')
      await waitFor(`document.querySelector('.details-header h2')?.textContent === 'beta-python'`)
      await click('.knowledge-nav')
    })
    await check('新建笔记、中文标签去重、置顶与关联项目',async()=>{
      await click('.knowledge-new')
      await set('.knowledge-title-input','毕设实验笔记')
      await set('.knowledge-category-input','毕业设计')
      await set('.knowledge-tags-input','科研， 数据,科研')
      await set('.knowledge-project-input',path.join(root,'alpha-web'))
      await set('.knowledge-content-input','实验步骤\n复现标记\n<img src=x onerror=alert(1)>')
      await click('.knowledge-pin-label input')
      await click('.knowledge-save')
      await waitFor(`document.querySelectorAll('.knowledge-card').length===1 && !document.querySelector('.knowledge-form')`)
      const entry=(await state()).knowledge[0]
      assert.deepEqual(entry.tags,['科研','数据'])
      assert.equal(entry.pinned,true)
      assert.equal(entry.projectPath,path.join(root,'alpha-web'))
      assert.equal(await js(`document.querySelector('.knowledge-nav b').textContent`),'1')
      assert.ok(await js(`document.querySelector('.knowledge-body').textContent.includes('<img')`))
      assert.equal(await js(`document.querySelectorAll('.knowledge-body img').length`),0)
    })
    await check('标题、正文、分类、标签与关联路径搜索',async()=>{
      for (const query of ['实验笔记','复现标记','毕业设计','科研',path.join(root,'alpha-web')]) {
        await set('.knowledge-search',query)
        assert.equal(await js(`document.querySelectorAll('.knowledge-card').length`),1)
      }
      await set('.knowledge-search','不匹配的知识')
      assert.equal(await js(`document.querySelectorAll('.knowledge-card').length`),0)
      await clearFilters()
    })
    await check('关联项目详情跳转并保留知识',async()=>{
      await click('.knowledge-open-project')
      await waitFor(`document.querySelector('.details-header h2')?.textContent==='alpha-web'`)
      await click('.knowledge-nav')
      assert.equal((await state()).knowledge.length,1)
    })
    await check('新建网页引用、摘要和浏览器调用参数',async()=>{
      await click('.knowledge-new')
      await set('.knowledge-title-input','参考论文网页')
      await set('.knowledge-kind-input','link')
      await set('.knowledge-category-input','参考资料')
      await set('.knowledge-target-input','https://example.com/research')
      await set('.knowledge-content-input','论文重点摘要')
      await click('.knowledge-save')
      await waitFor(`document.querySelectorAll('.knowledge-card').length===2 && !document.querySelector('.knowledge-form')`)
      await click('.knowledge-open-source')
      assert.equal(openedKnowledgeUrl,'https://example.com/research')
    })
    await check('IPC 拒绝危险 URL、无效关联项目与缺失文件',async()=>{
      const count=(await state()).knowledge.length
      for (const target of ['javascript:alert(1)','file:///C:/Windows/notepad.exe','data:text/html,test']) await rejected(`window.projectHub.saveKnowledge({title:'bad',kind:'link',target:${JSON.stringify(target)}})`,/HTTP/)
      await rejected(`window.projectHub.saveKnowledge({title:'bad',kind:'note',projectPath:${JSON.stringify(root)}})`,/一级项目/)
      await rejected(`window.projectHub.saveKnowledge({title:'bad',kind:'file',target:${JSON.stringify(referenceFile+'.missing')}})`,/不存在/)
      assert.equal((await state()).knowledge.length,count)
      assert.equal(openedKnowledgeUrl,'https://example.com/research')
    })
    await check('选择本机文件并保存引用，不复制原文件',async()=>{
      await click('.knowledge-new')
      await set('.knowledge-title-input','数据说明文件')
      await set('.knowledge-kind-input','file')
      await click('.knowledge-pick-file')
      await waitFor(`document.querySelector('.knowledge-target-input').value===${JSON.stringify(referenceFile)}`)
      await set('.knowledge-category-input','参考资料')
      await set('.knowledge-content-input','文件引用说明')
      await click('.knowledge-save')
      await waitFor(`document.querySelectorAll('.knowledge-card').length===3 && !document.querySelector('.knowledge-form')`)
      assert.equal((await state()).knowledge.find(entry=>entry.title==='数据说明文件').target,referenceFile)
      await click('.knowledge-open-source')
      assert.equal(revealedKnowledgeFile,referenceFile)
      assert.equal(await readFile(referenceFile,'utf8'),'Original reference file')
    })
    await check('文件移动后提示失效，知识条目仍然保留',async()=>{
      await rm(referenceFile)
      await click('.knowledge-open-source')
      await waitFor(`document.querySelector('.toast')?.textContent.includes('已移动')`)
      assert.equal((await state()).knowledge.length,3)
      await writeFile(referenceFile,'Original reference file')
    })
    await check('知识分类、类型及置顶组合筛选',async()=>{
      await set('.knowledge-category-filter','参考资料')
      assert.equal(await js(`document.querySelectorAll('.knowledge-card').length`),2)
      await set('.knowledge-kind-filter','link')
      assert.equal(await js(`document.querySelectorAll('.knowledge-card').length`),1)
      await clearFilters()
      await click('.knowledge-pinned-filter')
      assert.equal(await js(`document.querySelectorAll('.knowledge-card').length`),1)
      assert.equal(await js(`document.querySelector('.knowledge-card h2').textContent`),'毕设实验笔记')
      await clearFilters()
    })
    await check('编辑保存保留身份和创建时间，支持取消置顶',async()=>{
      await selectKnowledge('毕设实验笔记')
      const before=(await state()).knowledge.find(entry=>entry.title==='毕设实验笔记')
      await click('.knowledge-edit')
      await set('.knowledge-title-input','毕设实验笔记（已整理）')
      await set('.knowledge-content-input','已整理的实验步骤\n结论说明')
      await click('.knowledge-save')
      await waitFor(`document.querySelector('.knowledge-detail-header h2')?.textContent==='毕设实验笔记（已整理）'`)
      const after=(await state()).knowledge.find(entry=>entry.id===before.id)
      assert.equal(after.createdAt,before.createdAt)
      assert.equal((await state()).knowledge.length,3)
      await click('.knowledge-pin')
      assert.equal((await state()).knowledge.find(entry=>entry.id===before.id).pinned,false)
    })
    await check('未保存内容的页面切换、条目切换与取消保护',async()=>{
      await click('.knowledge-edit')
      await set('.knowledge-content-input','不能悄悄丢掉的草稿')
      await js('void(window.confirm=()=>false)')
      await click('.nav-all')
      assert.ok(await js(`!!document.querySelector('.knowledge-form')`))
      await selectKnowledge('参考论文网页')
      assert.equal(await js(`document.querySelector('.knowledge-content-input').value`),'不能悄悄丢掉的草稿')
      await click('.knowledge-cancel')
      assert.ok(await js(`!!document.querySelector('.knowledge-form')`))
    })
    await check('关闭窗口时提示未保存知识，继续编辑保留草稿',async()=>{
      window.close()
      await sleep(500)
      assert.equal(window.isDestroyed(),false)
      assert.ok(closeKnowledgePromptCount>0)
      assert.equal(await js(`document.querySelector('.knowledge-content-input').value`),'不能悄悄丢掉的草稿')
      await js('void(window.confirm=()=>true)')
      await click('.knowledge-cancel')
      assert.equal((await state()).knowledge.find(entry=>entry.title==='毕设实验笔记（已整理）').content,'已整理的实验步骤\n结论说明')
    })
    await check('删除确认取消保留记录，确认删除不触碰原文件',async()=>{
      await selectKnowledge('数据说明文件')
      await js('void(window.confirm=()=>false)')
      await click('.knowledge-delete')
      assert.equal((await state()).knowledge.length,3)
      await js('void(window.confirm=()=>true)')
      await click('.knowledge-delete')
      await waitFor(`document.querySelectorAll('.knowledge-card').length===2`)
      assert.equal(await readFile(referenceFile,'utf8'),'Original reference file')
      assert.equal((await state()).knowledge.some(entry=>entry.title==='数据说明文件'),false)
    })
    await check('重新加载与独立存储实例均可读取完整知识',async()=>{
      const before=(await state()).knowledge
      window.reload()
      await new Promise(resolve=>window.webContents.once('did-finish-load',resolve))
      await waitFor(`!!document.querySelector('.knowledge-nav')`)
      await click('.knowledge-nav')
      assert.deepEqual((await state()).knowledge,before)
      const {KnowledgeStore}=await import('../electron/knowledge-store.mjs')
      const reopened=new KnowledgeStore(path.join(fixture,'user-data/knowledge.json'))
      await reopened.init()
      assert.deepEqual(reopened.getEntries(),before)
    })
    await check('引用原文创建分支、继续追问、编辑与搜索',async()=>{
      await selectKnowledge('毕设实验笔记（已整理）')
      await js(`{const text=document.querySelector('.knowledge-paragraph p').firstChild; const range=document.createRange();range.setStart(text,0);range.setEnd(text,3);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('.knowledge-body').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));}`)
      await sleep(100)
      await click('.branch-from-selection')
      assert.equal(await js(`document.querySelector('.branch-quote-input').value`),'已整理')
      await set('.branch-title-input','注意力如何实现')
      await set('.branch-kind-input','explanation')
      await set('.branch-content-input','Q 与 K 的匹配分数，再加权 V')
      await click('.branch-save')
      await waitFor(`document.querySelectorAll('.knowledge-branch').length===1 && !document.querySelector('.branch-form')`)
      await button('继续分支')
      await set('.branch-title-input','为什么需要缩放')
      await set('.branch-content-input','避免分数过大')
      await click('.branch-save')
      await waitFor(`document.querySelectorAll('.knowledge-branch').length===2 && !document.querySelector('.branch-form')`)
      const entry=(await state()).knowledge.find(e=>e.title==='毕设实验笔记（已整理）')
      assert.equal(entry.branches[1].parentId,entry.branches[0].id)
      await set('.knowledge-search','避免分数过大')
      assert.equal(await js(`document.querySelectorAll('.knowledge-card').length`),1)
      await clearFilters()
      await click('.branch-actions button:nth-child(2)')
      await set('.branch-content-input','修改后的解释')
      await click('.branch-save')
      await waitFor(`!document.querySelector('.branch-form')`)
      assert.ok(await js(`document.querySelector('.knowledge-branches').textContent.includes('修改后的解释')`))
    })
    await check('大模型 API 配置及分支生成，用户确认保存后持久化',async()=>{
      const {createServer}=await import('node:http')
      let received
      const server=createServer(async(req,res)=>{
        let body='';for await(const chunk of req) body+=chunk
        received={url:req.url,body:JSON.parse(body)}
        res.setHeader('Content-Type','application/json')
        res.end(JSON.stringify({choices:[{message:{content:'AI 测试解释：先计算匹配，再汇总信息。\n\n可继续追问\n1. 为什么需要缩放？\n2. 多头注意力有什么作用？\n3. KV Cache 缓存哪些内容？'}}]}))
      })
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
      try {
        await click('.settings-nav')
        await waitFor(`!!document.querySelector('.model-base-url') && !document.querySelector('.model-settings fieldset').disabled`)
        await set('.model-base-url',`http://127.0.0.1:${server.address().port}/v1`)
        await set('.model-name','test-model')
        await set('.model-key','local-test-secret')
        await click('.model-settings-save')
        await waitFor(`document.querySelector('.model-settings').textContent.includes('配置已保存')`)
        await writeFile(path.join(output,'settings.png'),(await window.webContents.capturePage()).toPNG())
        await click('.knowledge-nav')
        await selectKnowledge('毕设实验笔记（已整理）')
        assert.equal(await js(`!!document.querySelector('.knowledge-square .model-settings')`),false)
        await click('.paragraph-actions button')
        await set('.branch-title-input','请解释注意力')
        await set('.branch-kind-input','idea')
        await click('.workspace-trigger')
        await button('切换目录…')
        assert.ok(await js(`document.querySelector('.toast').textContent.includes('请先保存')`))
        assert.equal(await js(`document.querySelector('.branch-title-input').value`),'请解释注意力')
        assert.equal((await state()).root,root)
        const before=(await state()).knowledge.find(e=>e.title==='毕设实验笔记（已整理）').branches.length
        await click('.branch-ai')
        await waitFor(`document.querySelector('.branch-content-input').value.includes('AI 测试解释')`)
        assert.equal((await state()).knowledge.find(e=>e.title==='毕设实验笔记（已整理）').branches.length,before)
        assert.equal(received.url,'/v1/chat/completions')
        assert.equal(received.body.model,'test-model')
        assert.equal(JSON.parse(received.body.messages[1].content).分支类型,'idea')
        assert.ok(received.body.messages[0].content.includes('最小验证方法'))
        assert.ok(received.body.messages[0].content.includes('不能只罗列术语'))
        assert.ok(!(await readFile(path.join(fixture,'user-data/model-api.json'),'utf8')).includes('local-test-secret'))
        const settings=await js('window.projectHub.getModelSettings()')
        assert.equal(settings.hasKey,true)
        assert.ok(!JSON.stringify(settings).includes('local-test-secret'))
        await click('.branch-save')
        await waitFor(`!document.querySelector('.branch-form')`)
        window.reload()
        await new Promise(resolve=>window.webContents.once('did-finish-load',resolve))
        await waitFor(`!!document.querySelector('.knowledge-nav')`)
        await click('.knowledge-nav')
        await selectKnowledge('毕设实验笔记（已整理）')
        assert.ok(await js(`document.querySelector('.knowledge-branches').textContent.includes('AI 测试解释')`))
      } finally { await new Promise(resolve=>server.close(resolve)) }
    })
    await check('知识图谱节点、关系、标签筛选、局部图谱、缩放与打开分支',async()=>{
      await click('.knowledge-graph-tab')
      await waitFor(`document.querySelectorAll('.graph-node').length>0`)
      assert.equal(await js(`document.querySelectorAll('[data-node-kind="knowledge"]').length`),2)
      assert.equal(await js(`document.querySelectorAll('[data-edge-kind="branch"]').length`),3)
      await click('.graph-tags')
      assert.equal(await js(`document.querySelectorAll('[data-node-kind="tag"]').length`),0)
      await click('.graph-local')
      assert.equal(await js(`document.querySelectorAll('[data-node-kind="knowledge"]').length`),1)
      await click('[aria-label="放大图谱"]')
      assert.ok(await js(`document.querySelector('.graph-zoom').textContent.includes('120%')`))
      await click('.graph-reset')
      assert.ok(await js(`document.querySelector('.graph-zoom').textContent.includes('100%')`))
      const node=await js(`document.querySelector('[data-node-kind="explanation"]').getAttribute('data-node-id')`)
      await js(`document.querySelector('[data-node-id="'+${JSON.stringify(node)}+'"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
      await sleep(100)
      assert.ok(await js(`document.querySelector('.graph-preview h3').textContent.includes('注意力')`))
      window.show()
      await sleep(300)
      window.focus()
      const beforeTransform=await js(`document.querySelector('[data-node-id="'+${JSON.stringify(node)}+'"]').getAttribute('transform')`)
      const point=await js(`(()=>{const r=document.querySelector('[data-node-id="'+${JSON.stringify(node)}+'"] .node-core').getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      window.webContents.sendInputEvent({type:'mouseMove',...point})
      window.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1})
      window.webContents.sendInputEvent({type:'mouseMove',x:point.x+35,y:point.y-25})
      window.webContents.sendInputEvent({type:'mouseUp',x:point.x+35,y:point.y-25,button:'left',clickCount:1})
      await sleep(150)
      assert.notEqual(await js(`document.querySelector('[data-node-id="'+${JSON.stringify(node)}+'"]').getAttribute('transform')`),beforeTransform)
      const canvas=await js(`(()=>{const r=document.querySelector('.graph-canvas').getBoundingClientRect();return{x:Math.round(r.x+8),y:Math.round(r.y+8)}})()`)
      const beforePan=await js(`document.querySelector('.graph-transform').getAttribute('transform')`)
      window.webContents.sendInputEvent({type:'mouseDown',...canvas,button:'left',clickCount:1})
      window.webContents.sendInputEvent({type:'mouseMove',x:canvas.x+40,y:canvas.y+15})
      window.webContents.sendInputEvent({type:'mouseUp',x:canvas.x+40,y:canvas.y+15,button:'left',clickCount:1})
      await sleep(100)
      assert.notEqual(await js(`document.querySelector('.graph-transform').getAttribute('transform')`),beforePan)
      window.webContents.sendInputEvent({type:'mouseWheel',x:canvas.x+30,y:canvas.y+30,deltaY:-100,deltaX:0})
      await sleep(100)
      assert.notEqual(await js(`document.querySelector('.graph-zoom span').textContent`),'100%')
      await click('.graph-reset')
      await writeFile(path.join(output,'knowledge-graph.png'),(await window.webContents.capturePage()).toPNG())
      window.setSize(1120,720)
      await sleep(300)
      assert.ok(await js(`document.documentElement.scrollWidth<=window.innerWidth && document.querySelector('.graph-canvas').clientHeight>150`))
      await writeFile(path.join(output,'knowledge-graph-minimum.png'),(await window.webContents.capturePage()).toPNG())
      window.setSize(1480,920)
      await sleep(200)
      await click('.graph-open')
      await waitFor(`!!document.querySelector('.knowledge-branches')`)
      assert.equal(await js(`document.querySelector('.knowledge-reading-tab').getAttribute('aria-selected')`),'true')
      assert.ok(await js(`document.querySelector('.knowledge-reading').scrollTop>0`))
    })
    await check('猜你想问建立可编辑子分支、保护草稿、保存关联和避免重复',async()=>{
      await selectKnowledge('毕设实验笔记（已整理）')
      const original=(await state()).knowledge.find(e=>e.title==='毕设实验笔记（已整理）')
      const parent=original.branches.find(b=>b.title==='请解释注意力')
      const section=`.suggested-questions[data-parent-id="${parent.id}"]`
      assert.equal(await js(`document.querySelector(${JSON.stringify(section)}).querySelectorAll('.suggested-question').length`),3)
      await click(section+' .suggested-question')
      assert.equal(await js(`document.querySelector('.branch-title-input').value`),'为什么需要缩放？')
      assert.equal(await js(`document.querySelector('.branch-kind-input').value`),'question')
      assert.equal(await js(`document.querySelector('.branch-content-input').value`),'')
      assert.equal(await js(`document.querySelector('.branch-quote-input').value`),'AI 测试解释：先计算匹配，再汇总信息。')
      assert.equal((await state()).knowledge.find(e=>e.id===original.id).branches.length,original.branches.length)
      await js(`void(window.confirm=()=>false)`)
      await set('.branch-title-input','我尚未保存的问题')
      await click(section+' .suggested-question:nth-child(2)')
      assert.equal(await js(`document.querySelector('.branch-title-input').value`),'我尚未保存的问题')
      await js(`void(window.confirm=()=>true)`)
      await click(section+' .suggested-question:nth-child(2)')
      assert.equal(await js(`document.querySelector('.branch-title-input').value`),'多头注意力有什么作用？')
      await click(section+' .suggested-own')
      assert.equal(await js(`document.querySelector('.branch-title-input').value`),'')
      await click(section+' .suggested-question')
      await set('.branch-content-input','继续探索的手写答案')
      await click('.branch-save')
      await waitFor(`!document.querySelector('.branch-form')`)
      const saved=(await state()).knowledge.find(e=>e.id===original.id)
      assert.equal(saved.branches.length,original.branches.length+1)
      assert.equal(saved.branches.at(-1).parentId,parent.id)
      assert.equal(saved.branches.at(-1).title,'为什么需要缩放？')
      assert.equal(saved.branches.find(b=>b.id===parent.id).content,parent.content)
      window.reload()
      await new Promise(resolve=>window.webContents.once('did-finish-load',resolve))
      await waitFor(`!!document.querySelector('.knowledge-nav')`)
      await click('.knowledge-nav')
      await selectKnowledge('毕设实验笔记（已整理）')
      assert.equal(await js(`document.querySelector(${JSON.stringify(section)}).querySelector('.suggested-question').disabled`),true)
      await js(`document.querySelector(${JSON.stringify(section)}).scrollIntoView({block:'center'})`)
      await sleep(300)
      await writeFile(path.join(output,'suggested-questions.png'),(await window.webContents.capturePage()).toPNG())
    })
    await check('长正文顶部浏览分支、层级目录、自动展开、返回阅读位置与草稿保留',async()=>{
      const content=Array.from({length:40},(_,i)=>`第${i+1}段：`+'长正文阅读位置与分支浏览测试。'.repeat(12)).join('\n\n')
      const branches=[
        {id:'browse-root',parentId:null,kind:'question',title:'注意力如何工作？',quote:'第1段：',content:'父分支原理说明。\n'.repeat(35)},
        {id:'browse-child',parentId:'browse-root',kind:'explanation',title:'缩放为什么有效？',quote:'父分支原理说明。',content:'子分支的机制解释。\n'.repeat(20)},
        {id:'browse-other',parentId:null,kind:'idea',title:'怎样设计对照实验？',quote:'第20段：',content:'另一条思路的实验步骤。\n'.repeat(35)},
      ]
      const saved=await js(`window.projectHub.saveKnowledge(${JSON.stringify({title:'分支阅读定位测试',kind:'note',category:'测试',content,branches,tags:[]})})`)
      try {
        window.reload()
        await new Promise(resolve=>window.webContents.once('did-finish-load',resolve))
        await waitFor(`!!document.querySelector('.knowledge-nav')`)
        await click('.knowledge-nav')
        await selectKnowledge('分支阅读定位测试')
        assert.equal(await js(`document.querySelectorAll('.branch-jump-select option').length`),4)
        assert.ok(await js(`document.querySelector('.branch-jump-select option[value="browse-child"]').textContent.includes('↳')`))
        await js(`document.querySelector('.knowledge-reading').scrollTop=700`)
        await click('.branch-browse')
        assert.ok(await js(`document.querySelector('.knowledge-reading').scrollTop>2000`))
        const pinnedOffset=await js(`document.querySelector('.branch-navigation').getBoundingClientRect().top-document.querySelector('.knowledge-reading').getBoundingClientRect().top`)
        assert.ok(pinnedOffset>=0&&pinnedOffset<=32, `Pinned navigation offset: ${pinnedOffset}`)
        await click('.branch-read-body')
        assert.ok(await js(`Math.abs(document.querySelector('.knowledge-reading').scrollTop-700)<2`))
        await js(`document.querySelectorAll('.knowledge-branch').forEach(branch=>branch.open=false)`)
        await set('.branch-jump-select','browse-child')
        assert.ok(await js(`document.getElementById('branch-browse-root').open&&document.getElementById('branch-browse-child').open`))
        assert.ok(await js(`document.getElementById('branch-browse-child').classList.contains('branch-focused')`))
        assert.ok(await js(`document.getElementById('branch-browse-child').getBoundingClientRect().top>=document.querySelector('.branch-navigation').getBoundingClientRect().bottom`))
        await click('#branch-browse-child .branch-back')
        assert.equal(await js(`document.querySelector('.branch-jump-select').value`),'browse-root')
        await set('.branch-jump-select','browse-other')
        await click('#branch-browse-other .branch-back')
        assert.ok(await js(`(()=>{const p=document.getElementById('knowledge-paragraph-19').getBoundingClientRect(),r=document.querySelector('.knowledge-reading').getBoundingClientRect();return p.top>=r.top&&p.top<r.bottom})()`))
        await click('.paragraph-actions button')
        await set('.branch-title-input','尚未保存的阅读想法')
        await set('.branch-jump-select','browse-child')
        await click('.branch-read-body')
        assert.equal(await js(`document.querySelector('.branch-title-input').value`),'尚未保存的阅读想法')
        await js(`void(window.confirm=()=>true)`)
        await click('.branch-form .branch-actions button:last-child')
        window.setSize(1120,720)
        await set('.branch-jump-select','browse-child')
        await sleep(300)
        assert.ok(await js(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.branch-navigation').scrollWidth<=document.querySelector('.branch-navigation').clientWidth`))
        await writeFile(path.join(output,'branch-navigation-minimum.png'),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG())
        window.setSize(1480,920)
        await set('.branch-jump-select','browse-other')
        await sleep(300)
        await writeFile(path.join(output,'branch-navigation.png'),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG())
        const current=(await state()).knowledge.find(entry=>entry.id===saved.id)
        assert.deepEqual(current.branches,branches)
      } finally {
        window.setSize(1480,920)
        await js(`window.projectHub.deleteKnowledge(${JSON.stringify(saved.id)})`)
        window.reload()
        await new Promise(resolve=>window.webContents.once('did-finish-load',resolve))
        await waitFor(`!!document.querySelector('.knowledge-nav')`)
        await click('.knowledge-nav')
      }
    })
    await check('最小窗口布局、文本安全和无渲染器错误',async()=>{
      await selectKnowledge('毕设实验笔记（已整理）')
      window.show()
      window.setSize(1120,720)
      await sleep(800)
      assert.ok(await js(`document.documentElement.scrollWidth<=window.innerWidth`))
      assert.ok(await js(`document.querySelector('.knowledge-toolbar').scrollWidth<=document.querySelector('.knowledge-toolbar').clientWidth`))
      assert.ok(await js(`document.querySelector('.knowledge-detail').clientWidth > document.querySelector('.knowledge-main').clientWidth * 2`), 'Knowledge content must occupy the main reading area')
      assert.deepEqual(errors,[])
      await writeFile(path.join(output,'knowledge-minimum.png'),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG())
      window.setSize(1480,920)
      await sleep(800)
      await writeFile(path.join(output,'knowledge.png'),(await window.webContents.capturePage(undefined,{stayAwake:true})).toPNG())
    })
    await check('重复启动复用已有窗口，避免多个实例同时写入知识库',async()=>{
      const { spawn } = await import('node:child_process')
      let received = false
      const listener = () => { received = true }
      app.once('second-instance',listener)
      const child = spawn(process.execPath,[fileURLToPath(new URL('./instance-probe.mjs',import.meta.url)),app.getPath('userData')],{stdio:'ignore',windowsHide:true,env:process.env})
      let timer
      try {
        const code=await new Promise((resolve,reject)=>{
          timer=setTimeout(()=>{child.kill();reject(Error('Second instance did not exit'))},8000)
          child.once('error',reject)
          child.once('exit',resolve)
        })
        assert.equal(code,0)
        assert.equal(received,true)
        assert.equal(BrowserWindow.getAllWindows().length,1)
      } finally {clearTimeout(timer);app.removeListener('second-instance',listener)}
    })
  } catch(error) {results.push({name:'知识测试运行器',passed:false,error:error.stack})}
  await finish()
}

setTimeout(() => { console.error('Desktop test timeout'); app.exit(2) }, 150000).unref()
await import('../electron/main.mjs')
