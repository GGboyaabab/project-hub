import { useEffect, useState } from 'react'

export function ModelSettings({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [config, setConfig] = useState({ baseUrl: '', model: '', hasKey: false, error: null as string | null })
  const [key, setKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [busy, setBusy] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    void window.projectHub.getModelSettings().then(saved => { if (active) setConfig(saved) }).catch(() => { if (active) setMessage('无法读取大模型配置，请重新进入设置重试') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [])
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  return <div className="model-settings">
    <h2>大模型 API</h2>
    <p className="model-writing-policy">学习笔记写作规则已启用：讲清原理、给出具体例子、保留原意，区分事实与假设，并减少套话。会按问题、想法或解释分别组织内容。</p>
    <form onChange={() => setDirty(true)} onSubmit={event => { event.preventDefault(); setBusy(true); void window.projectHub.saveModelSettings({ baseUrl: config.baseUrl, model: config.model, apiKey: key, clearKey }).then(saved => { setConfig(saved); setKey(''); setClearKey(false); setDirty(false); setMessage('配置已保存。回到知识广场，在分支中点击 AI 完善分支。') }).catch(error => setMessage(String(error))).finally(() => setBusy(false)) }}>
      <fieldset disabled={busy}>
        <p>默认使用 DeepSeek V4.1 Flash 1017：官方调用名称为 deepseek-flash。</p>
        <button className="secondary-button" type="button" onClick={() => { setConfig({ ...config, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' }); setDirty(true) }}>使用 DeepSeek 1017 配置</button>
        <p>支持兼容 OpenAI Chat Completions 的服务；基础地址包含服务要求的 /v1 等路径，不要填写 /chat/completions。</p>
        <label>API 基础地址<input className="model-base-url" required type="url" value={config.baseUrl} onChange={event => setConfig({ ...config, baseUrl: event.target.value })} /></label>
        <label>模型名称<input className="model-name" required value={config.model} onChange={event => setConfig({ ...config, model: event.target.value })} /></label>
        <label>API 密钥<input className="model-key" type="password" autoComplete="new-password" value={key} placeholder={config.hasKey ? '已加密保存，留空保留；更换地址需重新填写' : '填写服务商提供的密钥；本地无认证服务可留空'} onChange={event => setKey(event.target.value)} /></label>
        <label className="model-clear"><input type="checkbox" checked={clearKey} onChange={event => setClearKey(event.target.checked)} />清除已保存的密钥</label>
        <p>点击 AI 生成时，仅把当前知识标题、所引用文字、问题和已有分支内容发给上述服务；可能产生 API 费用。</p>
        {config.error && <p role="alert">{config.error}</p>}
        <button className="primary-button model-settings-save" type="submit">保存 API 配置</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
  </div>
}
