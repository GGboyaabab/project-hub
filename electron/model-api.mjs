import { readFile, writeFile, rename } from 'node:fs/promises'
import { buildBranchMessages } from './branch-writing.mjs'

function cleanConfig(input) {
  let url
  try { url = new URL(input.baseUrl) } catch { throw new Error('请填写完整的 API 基础地址') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址只支持不含账号密码、查询参数的 HTTP 或 HTTPS 地址')
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('远程 API 请使用 HTTPS，本地服务可使用 HTTP')
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 120) throw new Error('请填写模型名称')
  return { baseUrl: url.href.replace(/\/$/, ''), model: input.model.trim() }
}

export class ModelApi {
  constructor(file, encryption, fetcher = fetch) {
    this.file = file
    this.encryption = encryption
    this.fetcher = fetcher
    this.config = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', encryptedKey: '' }
    this.pending = Promise.resolve()
    this.active = false
    this.loadError = null
  }
  async init() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'))
      if (typeof saved.encryptedKey !== 'string') throw new Error('密钥格式无效')
      this.config = { ...cleanConfig(saved), encryptedKey: saved.encryptedKey }
    } catch (error) { if (error.code !== 'ENOENT') this.loadError = '大模型配置读取失败，原配置已保留，请检查 model-api.json' }
  }
  getSettings() { return { baseUrl: this.config.baseUrl, model: this.config.model, hasKey: !!this.config.encryptedKey, error: this.loadError } }
  save(input) {
    const operation = this.pending.then(async () => {
      const cleaned = cleanConfig(input)
      if (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey)) throw new Error('API 密钥格式无效')
      if (typeof input.clearKey !== 'boolean') throw new Error('清除密钥选项无效')
      if (this.loadError) throw new Error(this.loadError)
      let encryptedKey = input.clearKey ? '' : this.config.encryptedKey
      const changingService = cleaned.baseUrl !== this.config.baseUrl
      if (changingService && !input.apiKey.trim()) encryptedKey = ''
      if (input.apiKey.trim()) {
        if (!this.encryption.isEncryptionAvailable()) throw new Error('本机加密不可用，无法安全保存 API 密钥')
        encryptedKey = this.encryption.encryptString(input.apiKey.trim()).toString('base64')
      }
      const next = { ...cleaned, encryptedKey }
      await writeFile(this.file + '.tmp', JSON.stringify(next, null, 2) + '\n', 'utf8')
      await rename(this.file + '.tmp', this.file)
      this.config = next
      return this.getSettings()
    })
    this.pending = operation.catch(() => {})
    return operation
  }
  async complete(input) {
    if (this.active) throw new Error('已有一个分支正在生成，请稍后重试')
    if (this.loadError) throw new Error(this.loadError)
    const { baseUrl, model } = cleanConfig(this.config)
    const fields = ['title', 'quote', 'question', 'content']
    if (!input || fields.some(key => typeof input[key] !== 'string' || input[key].length > 20000) || !input.question.trim() || !input.quote.trim()) throw new Error('请填写引用原文及问题或想法')
    const messages = buildBranchMessages(input)
    let key = ''
    if (new URL(baseUrl).hostname === 'api.deepseek.com' && !this.config.encryptedKey) throw new Error('请先到左侧“设置 → 大模型 API”填写并保存 DeepSeek API 密钥')
    if (this.config.encryptedKey) {
      try { key = this.encryption.decryptString(Buffer.from(this.config.encryptedKey, 'base64')) }
      catch { throw new Error('密钥无法解密，请在设置中重新填写') }
    }
    this.active = true
    try {
      const response = await this.fetcher(baseUrl + '/chat/completions', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model, messages }),
      })
      if (!response.ok) throw new Error(`API 请求失败（HTTP ${response.status}），请检查地址、模型、密钥或额度`)
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) throw new Error('API 未返回文本，请使用支持 Chat Completions 的文本模型')
      return content.slice(0, 20000)
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('生成超过 60 秒，请稍后重试')
      if (error.message.startsWith('API ')) throw error
      throw new Error('无法连接大模型服务，请检查 API 地址与网络')
    } finally { this.active = false }
  }
}
