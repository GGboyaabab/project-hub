// Run explicitly with Electron to evaluate the saved API configuration without exposing its key.
import { app, safeStorage } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ModelApi } from '../electron/model-api.mjs'

const userData = path.join(process.env.APPDATA, '项目中台')
app.setName('项目中台')
app.setPath('userData', userData)
app.whenReady().then(async () => {
const api = new ModelApi(path.join(userData, 'model-api.json'), safeStorage)
await api.init()
const settings = api.getSettings()
console.log(JSON.stringify({ stage: 'configuration', baseUrl: settings.baseUrl, model: settings.model, hasKey: settings.hasKey, error: settings.error }))
if (settings.error || !settings.hasKey) {
  console.log('请先在应用的设置中保存有效 API 密钥。')
  app.exit(3)
} else {
  const cases = [
    { kind: 'question', title: '注意力机制学习笔记', quote: '注意力可粗略理解成“带着问题读前文”。', question: '注意力具体如何做到这一点？请给出可以手算检查的最小数字例子。', content: '' },
    { kind: 'idea', title: '本地模型实验想法', quote: '模型权重占用和 KV Cache 占用是两笔不同的显存账。', question: '我想在一张消费级 GPU 上比较两种小型模型在不同上下文长度下的显存和延迟。怎样把这个想法完善为可复现实验？', content: '目前只是实验想法，还没有测量数据。' },
    { kind: 'explanation', title: '理解多头注意力', quote: '多头让不同子空间分别建立关联。', question: '多头注意力和多个独立大模型有什么区别？请用直观解释、计算过程和一个小例子讲清楚。', content: '' },
  ]
  const report = { requestedModel: settings.model, baseUrl: settings.baseUrl, startedAt: new Date().toISOString(), cases: [] }
  const directory = path.resolve('test-results')
  const output = path.join(directory, 'real-writing-evaluation.json')
  await mkdir(directory, { recursive: true })
  const selectedCases = process.argv.includes('--idea-only') ? cases.filter(input => input.kind === 'idea') : cases
  const reportFile = process.argv.includes('--idea-only') ? path.join(directory, 'real-writing-retest.json') : output
  for (const input of selectedCases) {
    const start = Date.now()
    try {
      const content = await api.complete(input)
      report.cases.push({ ...input, content, elapsedMs: Date.now() - start, success: true })
      console.log(JSON.stringify({ stage: 'completed', kind: input.kind, characters: content.length, elapsedMs: Date.now() - start }))
    } catch (error) {
      report.cases.push({ ...input, elapsedMs: Date.now() - start, success: false, error: error.message })
      console.log(JSON.stringify({ stage: 'failed', kind: input.kind, error: error.message }))
    }
    await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8')
  }
  console.log(JSON.stringify({ stage: 'saved', output: reportFile }))
  app.exit(report.cases.every(item => item.success) ? 0 : 1)
}
}).catch(error => { console.error(error.message); app.exit(1) })
