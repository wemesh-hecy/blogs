/**
 * @see https://theme-plume.vuejs.press/config/navigation/ 查看文档了解配置详情
 *
 * Navbar 配置文件，它在 `.vuepress/plume.config.ts` 中被导入。
 */

import { defineNavbarConfig } from 'vuepress-theme-plume'

export default defineNavbarConfig([
  { text: '首页', link: '/' },
  { text: '博客', link: '/blog/' },
  { text: '标签', link: '/blog/tags/' },
  { text: '归档', link: '/blog/archives/' },
  { text: '分类', link: '/blog/categories/' },
  {
    text: '程序员手册',
    items: [
      { text: '前端', link: '/handbook/frontend/' },
      { text: '后端', link: '/handbook/backend/' },
      { text: '数据库', link: '/handbook/database/' },
      { text: '工具', link: '/handbook/tools/' },
    ],
  },
])
