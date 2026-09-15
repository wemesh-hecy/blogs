/**
 * 查看以下文档了解主题配置
 * - @see https://theme-plume.vuejs.press/config/intro/ 配置说明
 * - @see https://theme-plume.vuejs.press/config/theme/ 主题配置项
 *
 * 请注意，对此文件的修改都会重启 vuepress 服务。
 * 部分配置项的更新没有必要重启 vuepress 服务，建议请在 `.vuepress/config.ts` 文件中配置
 *
 * 特别的，请不要在两个配置文件中重复配置相同的项，当前文件的配置项会被覆盖
 */

import { viteBundler } from '@vuepress/bundler-vite'
import { defineUserConfig } from 'vuepress'
import { plumeTheme } from 'vuepress-theme-plume'
import { knowledgeGraphPlugin } from 'vuepress-plugin-knowledge-graph'

export default defineUserConfig({
  base: '/',
  lang: 'zh-CN',
  title: '微码笔记',
  description: 'Hecy的零碎笔记',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/wemesh-logo.svg' }],
  ],

  bundler: viteBundler(),
  shouldPrefetch: false,

  theme: plumeTheme({
    plugins: {
      mdPower: {
        obsidian: {
          wikiLink: true,
          embedLink: true,
          callout: true,
          comment: true,
        },
      },
    },
  } as any),

  plugins: [
    knowledgeGraphPlugin({
      includeTags: true,        // 将 frontmatter 中的 tags 生成为独立节点
      includeAttachments: true, // 将本地附件生成为节点
      includeMissing: true,     // 将未创建文件的链接生成为半透明节点
    }),
  ],
})
