/**
 * 项目中台品牌 Logo
 * 概念：一个中心枢纽向外连接三个项目节点，构成稳定三角——
 * 寓意"中台连接所有本地项目"。与 duotone 图标集同源：
 * 极光渐变圆角底板 + 白色枢纽图形（实点 + 半透明连线）。
 */
export function Logo({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ph-logo-bg" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a855f7" />
          <stop offset="0.52" stopColor="#6a5cff" />
          <stop offset="1" stopColor="#3f8cff" />
        </linearGradient>
        <linearGradient id="ph-logo-sheen" x1="10" y1="6" x2="30" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 圆角底板 */}
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#ph-logo-bg)" />
      <rect x="2" y="2" width="44" height="24" rx="13" fill="url(#ph-logo-sheen)" />

      {/* 枢纽连线 */}
      <g stroke="#ffffff" strokeOpacity="0.5" strokeWidth="3.4" strokeLinecap="round">
        <path d="M24 24 24 12.6" />
        <path d="M24 24 13.9 29.8" />
        <path d="M24 24 34.1 29.8" />
      </g>

      {/* 卫星节点 */}
      <g fill="#ffffff" fillOpacity="0.92">
        <circle cx="24" cy="11.4" r="3.6" />
        <circle cx="13" cy="30.4" r="3.6" />
        <circle cx="35" cy="30.4" r="3.6" />
      </g>

      {/* 中心枢纽：白环 + 镂空芯 */}
      <circle cx="24" cy="24" r="5.6" fill="#ffffff" />
      <circle cx="24" cy="24" r="2.4" fill="#6a5cff" />
    </svg>
  )
}
