/**
 * 扫描 `docs/` 下每个一级目录：用该目录 README.md 的 frontmatter 生成集合与导航。
 *
 * README 可用字段：
 * - title：导航文案
 * - docs.type：`post` 列表（博客）| `doc` 侧边栏文档（默认）
 * - docs.tags / archives / categories / postList / pagination：仅 post
 * - docs.navbar：是否出现在导航，默认 true
 */
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineCollection } from 'vuepress-theme-plume'
import type { NavItemWithLink, PostsCategoryItem, ThemeCollectionItem, ThemeNavItem } from 'vuepress-theme-plume'
import type { FrontmatterData } from './content-tree'
import {
  flattenContentTree,
  readIndex,
  resolveOrder,
  scanContentTree,
  stripSortPermalink,
  stripSortPrefix,
  toNavbarItems,
  toSidebarItems,
} from './content-tree'

const DOCS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['.vuepress'])

export interface DocsSection {
  name: string
  slug: string
  title: string
  order: number
  type: 'post' | 'doc'
  permalink: string
  navbar: boolean
  tags: boolean
  archives: boolean
  categories: boolean
  postList: boolean
  pagination: number
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean')
    return value
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  return fallback
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value)))
    return Number(value)
  return fallback
}

function ensureSlash(path: string): string {
  const withLead = path.startsWith('/') ? path : `/${path}`
  return withLead.endsWith('/') ? withLead : `${withLead}/`
}

function compareSections(a: DocsSection, b: DocsSection): number {
  if (a.order !== b.order)
    return a.order - b.order
  return a.title.localeCompare(b.title, 'zh-CN')
}

export function scanDocsSections(): DocsSection[] {
  const sections: DocsSection[] = []

  for (const name of readdirSync(DOCS_ROOT)) {
    if (name.startsWith('.') || SKIP_DIRS.has(name))
      continue

    const abs = join(DOCS_ROOT, name)
    if (!statSync(abs).isDirectory())
      continue

    const index = readIndex(abs)
    if (!index)
      continue

    const cfg: FrontmatterData = (index.data.docs && typeof index.data.docs === 'object')
      ? index.data.docs
      : {}
    const slug = stripSortPrefix(name)
    const type = cfg.type === 'post' ? 'post' : 'doc'
    const permalink = ensureSlash(String(index.data.permalink || cfg.permalink || `/${slug}/`))

    sections.push({
      name,
      slug,
      title: String(index.data.title || cfg.title || slug),
      order: resolveOrder(name),
      type,
      permalink,
      navbar: asBool(cfg.navbar, true),
      tags: asBool(cfg.tags, type === 'post'),
      archives: asBool(cfg.archives, type === 'post'),
      categories: asBool(cfg.categories, false),
      postList: asBool(cfg.postList, true),
      pagination: asNumber(cfg.pagination, 15),
    })
  }

  return sections.sort(compareSections)
}

export const docsSections = scanDocsSections()

function stripPrefixFrontmatter(data: { permalink?: string, title?: string }) {
  if (typeof data.permalink === 'string')
    data.permalink = stripSortPermalink(data.permalink)
  if (typeof data.title === 'string')
    data.title = data.title.replace(/^\d{2}[.\-_]/, '')
  return data
}

function transformPostCategories(section: DocsSection) {
  const children = scanContentTree(join(DOCS_ROOT, section.name), section.permalink)
  const bySlug = new Map(
    flattenContentTree(children).map(node => [stripSortPrefix(node.name), node]),
  )

  return (categories: PostsCategoryItem[]) =>
    categories
      .map((item) => {
        const slug = stripSortPrefix(item.name)
        const node = bySlug.get(slug)
        return {
          ...item,
          name: node?.title ?? slug,
          sort: node?.order ?? item.sort,
        }
      })
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'))
}

export const docsCollections: ThemeCollectionItem[] = docsSections.map((section) => {
  if (section.type === 'post') {
    return defineCollection({
      type: 'post',
      dir: section.name,
      title: section.title,
      link: section.permalink,
      linkPrefix: section.permalink,
      postList: section.postList,
      pagination: section.pagination,
      tags: section.tags,
      archives: section.archives,
      categories: section.categories,
      tagsText: '标签',
      archivesText: '归档',
      categoriesText: '分类',
      exclude: ['**/README.md', '**/index.md'],
      autoFrontmatter: {
        title: true,
        createTime: true,
        permalink: 'filepath',
        transform: stripPrefixFrontmatter,
      },
      ...(section.categories ? { categoriesTransform: transformPostCategories(section) } : {}),
    })
  }

  const children = scanContentTree(join(DOCS_ROOT, section.name), section.permalink)
  return defineCollection({
    type: 'doc',
    dir: section.name,
    title: section.title,
    linkPrefix: section.permalink,
    autoFrontmatter: {
      title: true,
      createTime: true,
      permalink: 'filepath',
      transform: stripPrefixFrontmatter,
    },
    sidebar: children.length ? toSidebarItems(children) : 'auto',
  })
})

function postNavbar(section: DocsSection): ThemeNavItem {
  const extras: NavItemWithLink[] = []
  if (section.postList !== false)
    extras.push({ text: '文章', link: section.permalink })
  if (section.tags)
    extras.push({ text: '标签', link: `${section.permalink}tags/` })
  if (section.archives)
    extras.push({ text: '归档', link: `${section.permalink}archives/` })
  if (section.categories)
    extras.push({ text: '分类', link: `${section.permalink}categories/` })

  const suffixes = [
    section.tags ? 'tags/' : '',
    section.archives ? 'archives/' : '',
    section.categories ? 'categories/' : '',
  ].filter(Boolean)
  const activeMatch = suffixes.length
    ? `^${section.permalink}(?:${suffixes.join('|')})?$`
    : `^${section.permalink}$`

  if (extras.length <= 1)
    return { text: section.title, link: section.permalink, activeMatch }

  return {
    text: section.title,
    activeMatch,
    items: extras,
  }
}

function docNavbar(section: DocsSection): ThemeNavItem {
  const children = scanContentTree(join(DOCS_ROOT, section.name), section.permalink)
  const items = toNavbarItems(children)
  if (!items.length)
    return { text: section.title, link: section.permalink, activeMatch: `^${section.permalink}` }

  return {
    text: section.title,
    activeMatch: `^${section.permalink}`,
    items: items.map(item => (
      'link' in item && item.link
        ? { text: item.text || '', link: item.link }
        : item
    )) as NavItemWithLink[],
  }
}

export const docsNavbar: ThemeNavItem[] = docsSections
  .filter(section => section.navbar)
  .map(section => section.type === 'post' ? postNavbar(section) : docNavbar(section))
