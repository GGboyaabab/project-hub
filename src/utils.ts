import type { ItemType, RuntimeStatus } from './types'

export const itemTypeLabels: Record<ItemType, string> = {
  app: '应用', source: '源码', dataset: '数据集', document: '资料',
}

export const runtimeLabels: Record<RuntimeStatus, string> = {
  idle: '未运行',
  running: '运行中',
  stopping: '停止中',
  exited: '已退出',
  error: '异常退出',
}

const modifiedFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatModified(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return '时间未知'
  return modifiedFormatter.format(date)
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`
}
