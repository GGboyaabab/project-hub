import type { SVGProps } from 'react'

/**
 * 定制 duotone 图标集
 * 设计语言：圆角几何主形（实心 currentColor）+ 半透明辅形（fillOpacity 0.28），
 * 在深色侧栏与浅色内容区都保持清晰辨识度。
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 15, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
    ...props,
  }
}

/** 半透明辅形 */
const SOFT = 0.28

/* 全部项目：2x2 圆角方块，对角虚实呼应 */
export const IconGrid = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="7.6" height="7.6" rx="2.4" fill="currentColor" />
    <rect x="12.9" y="12.9" width="7.6" height="7.6" rx="2.4" fill="currentColor" />
    <rect x="12.9" y="3.5" width="7.6" height="7.6" rx="2.4" fill="currentColor" fillOpacity={SOFT} />
    <rect x="3.5" y="12.9" width="7.6" height="7.6" rx="2.4" fill="currentColor" fillOpacity={SOFT} />
  </svg>
)

/* 收藏：空心星（粗描边圆角） */
export const IconStar = (p: IconProps) => (
  <svg {...base(p)}>
    <path
      d="M12 3.4l2.65 5.36 5.92.86-4.28 4.17 1.01 5.89L12 16.98l-5.3 2.7 1.01-5.89L3.43 9.62l5.92-.86L12 3.4z"
      stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
    />
  </svg>
)

/* 已收藏：实心星 + 顶部高光 */
export const IconStarFill = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.4l2.65 5.36 5.92.86-4.28 4.17 1.01 5.89L12 16.98l-5.3 2.7 1.01-5.89L3.43 9.62l5.92-.86L12 3.4z" fill="currentColor" />
    <circle cx="12" cy="9.6" r="1.7" fill="#fff" fillOpacity="0.55" />
  </svg>
)

/* 运行中：实心闪电 */
export const IconBolt = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13.2 2.6L5.1 13.4h5.1l-.9 8 8.1-10.8h-5.1l.9-8z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
)

/* 已归档：箱体 + 箱盖 */
export const IconArchive = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.2" y="8.6" width="17.6" height="11.6" rx="2.4" fill="currentColor" fillOpacity={SOFT} />
    <rect x="3.2" y="3.4" width="17.6" height="4.4" rx="1.8" fill="currentColor" />
    <rect x="9.6" y="11.8" width="4.8" height="2" rx="1" fill="currentColor" />
  </svg>
)

/* 已隐藏：闭眼 + 斜线 */
export const IconEyeOff = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 6.2c-5 0-8.6 4.4-9.6 5.8a16.4 16.4 0 0 0 4.5 4.1M12 6.2c5 0 8.6 4.4 9.6 5.8a16.6 16.6 0 0 1-4.5 4.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" />
    <path d="M4.2 4.2l15.6 15.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

/* 知识广场：书本 + 书签 */
export const IconBook = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5.4 3.2h13.2a1.4 1.4 0 0 1 1.4 1.4v14.8a1.4 1.4 0 0 1-1.4 1.4H5.4a2.2 2.2 0 0 1-2.2-2.2V5.4a2.2 2.2 0 0 1 2.2-2.2z" fill="currentColor" fillOpacity={SOFT} />
    <path d="M8 3.2v6.4l2.2-1.7 2.2 1.7V3.2" fill="currentColor" />
    <path d="M6.6 16.4h10.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

/* 文件夹：背板 + 前板双色 */
export const IconFolder = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.4 6.2a2 2 0 0 1 2-2h3.6l1.9 2.4h7.7a2 2 0 0 1 2 2v1H3.4v-3.4z" fill="currentColor" />
    <rect x="3.4" y="9" width="17.2" height="9.8" rx="2.2" fill="currentColor" fillOpacity={SOFT} />
  </svg>
)

/* 启动：圆角三角 */
export const IconPlay = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 5.1v13.8c0 .98 1.08 1.56 1.9 1.03l10.6-6.9a1.2 1.2 0 0 0 0-2.06L9.9 4.07A1.2 1.2 0 0 0 8 5.1z" fill="currentColor" />
  </svg>
)

/* 停止：圆角方块 */
export const IconStop = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5.5" y="5.5" width="13" height="13" rx="3" fill="currentColor" />
  </svg>
)

/* 刷新：圆弧箭头 */
export const IconRefresh = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    <path d="M20.4 3.6v4.6h-4.6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* 搜索 */
export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="10.8" cy="10.8" r="6.6" stroke="currentColor" strokeWidth="2.4" />
    <path d="m19.8 19.8-4.3-4.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)

/* 详情：实心圆 + i */
export const IconInfo = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.8" fill="currentColor" fillOpacity={SOFT} />
    <path d="M12 11v5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    <circle cx="12" cy="7.8" r="1.35" fill="currentColor" />
  </svg>
)

/* 配置：经典齿轮轮廓 */
export const IconGear = (p: IconProps) => (
  <svg {...base(p)}>
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.85a.49.49 0 0 0-.52-.41h-3.84c-.24 0-.48.17-.52.41l-.36 2.85c-.59.24-1.13.56-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.64 9.16c-.11.2-.06.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.85c.04.24.28.41.52.41h3.84c.24 0 .48-.17.52-.41l.36-2.85a7.3 7.3 0 0 0 1.62-.94l2.39.96c.22.09.47-.02.59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
    />
  </svg>
)

/* 条目类型：芯片 */
export const IconChip = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2.6" fill="currentColor" fillOpacity={SOFT} />
    <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1.4" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M9.4 2.8v2.4M14.6 2.8v2.4M9.4 18.8v2.4M14.6 18.8v2.4M2.8 9.4h2.4M2.8 14.6h2.4M18.8 9.4h2.4M18.8 14.6h2.4" />
    </g>
  </svg>
)

/* 运行日志：终端窗口 */
export const IconTerminal = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4.4" width="18" height="15.2" rx="2.6" fill="currentColor" fillOpacity={SOFT} />
    <path d="m6.8 9.4 3 2.8-3 2.8M11.8 15.6h5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/* 装饰星光 */
export const IconSparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.2l1.85 5.55 5.55 1.85-5.55 1.85L12 18l-1.85-5.55L4.6 10.6l5.55-1.85L12 3.2z" fill="currentColor" />
    <path d="M18.6 15.2l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4z" fill="currentColor" fillOpacity="0.55" />
  </svg>
)

/* 新建：粗体加号 */
export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
)

/* 网页引用：链环 */
export const IconLink = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10.2 13.8a4.6 4.6 0 0 0 6.9.5l2.8-2.8a4.6 4.6 0 0 0-6.5-6.5l-1.5 1.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M13.8 10.2a4.6 4.6 0 0 0-6.9-.5l-2.8 2.8a4.6 4.6 0 0 0 6.5 6.5l1.5-1.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

/* 置顶：图钉 */
export const IconPin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.2 3.4h5.6l.9 6.4 2.6 2.4a.8.8 0 0 1-.56 1.4H6.26a.8.8 0 0 1-.56-1.4l2.6-2.4.9-6.4z" fill="currentColor" />
    <path d="M12 13.8v6.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
)

/* 编辑：铅笔 */
export const IconEdit = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20l.9-3.6L15.6 5.7a1.9 1.9 0 0 1 2.7 2.7L7.6 19.1 4 20z" fill="currentColor" />
    <path d="M13.9 7.4l2.7 2.7" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

/* 删除：桶身 + 桶盖 */
export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5.6" y="6.6" width="12.8" height="13" rx="2.2" fill="currentColor" fillOpacity={SOFT} />
    <rect x="3.6" y="3.8" width="16.8" height="2.6" rx="1.3" fill="currentColor" />
    <rect x="9.6" y="2.4" width="4.8" height="2" rx="1" fill="currentColor" />
  </svg>
)

/* 目录统计：仪表盘 */
export const IconGauge = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.2 15.6a7.8 7.8 0 1 1 15.6 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeOpacity={SOFT} />
    <path d="M12 15.4l3.6-5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    <circle cx="12" cy="15.4" r="1.7" fill="currentColor" />
  </svg>
)
