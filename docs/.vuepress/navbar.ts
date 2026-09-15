/**
 * @see https://theme-plume.vuejs.press/config/navigation/ 查看文档了解配置详情
 *
 * 导航由 `docs-sections.ts` 扫描 `docs/` 一级目录生成；首页固定在最前。
 */
import { defineNavbarConfig } from 'vuepress-theme-plume'
import { docsNavbar } from './docs-sections'

export default defineNavbarConfig([
  { text: '首页', link: '/' },
  ...docsNavbar,
])
