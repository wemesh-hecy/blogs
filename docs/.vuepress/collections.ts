/**
 * @see https://theme-plume.vuejs.press/guide/collection/ 查看文档了解配置详情。
 *
 * 集合由 `docs-sections.ts` 扫描 `docs/` 一级目录生成。
 * 每个目录的 README.md frontmatter 决定 type（post / doc）及标签、归档等开关。
 */
import { defineCollections } from 'vuepress-theme-plume'
import { docsCollections } from './docs-sections'

export default defineCollections(docsCollections)
