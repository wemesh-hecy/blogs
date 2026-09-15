/**
 * 扫描内容目录：有 README / index 的文件夹进入导航或分类。
 * 排序只认目录名 / 文件名开头的两位数字 `00`–`99`（`00.tech`、`00.标题.md`）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { NavItemChildren, NavItemWithLink, ThemeSidebarItem } from 'vuepress-theme-plume'

/** `00.` `00-` `00_`，范围 00–99 */
export const SORT_PREFIX = /^(\d{2})[.\-_]/
export const UNPREFIXED_ORDER = 100
const INDEX_FILES = ['README.md', 'index.md'] as const

export interface ContentNode {
  /** 相对扫描根的 posix 路径 */
  path: string
  /** 当前层目录名（含排序前缀） */
  name: string
  title: string
  order: number
  link: string
  children: ContentNode[]
}

export function stripSortPrefix(name: string): string {
  return name.replace(SORT_PREFIX, '')
}

export function resolveOrder(name: string): number {
  const prefix = name.match(SORT_PREFIX)
  return prefix ? Number(prefix[1]) : UNPREFIXED_ORDER
}

export function slugPath(posixPath: string): string {
  return posixPath.split('/').map(stripSortPrefix).filter(Boolean).join('/')
}

export function flattenContentTree(nodes: ContentNode[]): ContentNode[] {
  return nodes.flatMap(node => [node, ...flattenContentTree(node.children)])
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

export type FrontmatterValue = string | number | boolean
export type FrontmatterData = {
  [key: string]: FrontmatterValue | FrontmatterData
}

function coerceFrontmatterValue(raw: string): FrontmatterValue {
  const value = raw.trim()
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  if (value !== '' && /^-?\d+(\.\d+)?$/.test(value))
    return Number(value)
  return value
}

export function parseFrontmatter(content: string): FrontmatterData {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match)
    return {}

  const data: FrontmatterData = {}
  let group: string | null = null
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim())
      continue

    const nested = line.match(/^\s+([\w-]+):\s*(.*)$/)
    if (nested && group) {
      const bucket = data[group]
      if (bucket && typeof bucket === 'object')
        bucket[nested[1]] = coerceFrontmatterValue(nested[2])
      continue
    }

    const top = line.match(/^([\w-]+):\s*(.*)$/)
    if (!top)
      continue

    const key = top[1]
    const raw = top[2].trim()
    if (raw === '') {
      group = key
      data[key] = {}
      continue
    }
    group = null
    data[key] = coerceFrontmatterValue(raw)
  }
  return data
}

export function readIndex(dir: string): { file: string, data: FrontmatterData } | null {
  for (const file of INDEX_FILES) {
    const abs = join(dir, file)
    if (!existsSync(abs))
      continue
    return {
      file,
      data: parseFrontmatter(readFileSync(abs, 'utf8')),
    }
  }
  return null
}

export function stripSortPermalink(permalink: string): string {
  return `/${permalink.split('/').map(part => stripSortPrefix(part)).filter(Boolean).join('/')}/`
}

function compareNodes(a: ContentNode, b: ContentNode): number {
  if (a.order !== b.order)
    return a.order - b.order
  return a.title.localeCompare(b.title, 'zh-CN')
}

export function scanContentTree(root: string, linkPrefix: string): ContentNode[] {
  const prefix = linkPrefix.endsWith('/') ? linkPrefix : `${linkPrefix}/`

  function scanDir(absDir: string): ContentNode[] {
    if (!existsSync(absDir))
      return []

    const nodes: ContentNode[] = []
    for (const name of readdirSync(absDir)) {
      if (name.startsWith('.'))
        continue

      const abs = join(absDir, name)
      if (!statSync(abs).isDirectory())
        continue

      const index = readIndex(abs)
      if (!index)
        continue

      const path = toPosix(relative(root, abs))
      nodes.push({
        path,
        name,
        title: String(index.data.title || stripSortPrefix(name)),
        order: resolveOrder(name),
        link: String(index.data.permalink || `${prefix}${slugPath(path)}/`),
        children: scanDir(abs),
      })
    }

    return nodes.sort(compareNodes)
  }

  return dedupeBySlug(scanDir(root))
}

function dedupeBySlug(nodes: ContentNode[]): ContentNode[] {
  const map = new Map<string, ContentNode>()
  for (const node of nodes) {
    const slug = stripSortPrefix(node.name)
    const prev = map.get(slug)
    if (!prev || (prev.order === UNPREFIXED_ORDER && node.order !== UNPREFIXED_ORDER))
      map.set(slug, { ...node, children: dedupeBySlug(node.children) })
  }
  return [...map.values()].sort(compareNodes)
}

export function toSidebarItems(nodes: ContentNode[]): ThemeSidebarItem[] {
  return nodes.map((node): ThemeSidebarItem => {
    if (node.children.length) {
      return {
        text: node.title,
        prefix: node.name,
        link: node.link,
        collapsed: false,
        items: toSidebarItems(node.children),
      }
    }

    return {
      text: node.title,
      prefix: node.name,
      link: node.link,
      collapsed: true,
      items: 'auto',
    }
  })
}

export function toNavbarItems(nodes: ContentNode[]): (NavItemWithLink | NavItemChildren)[] {
  return nodes.map((node): NavItemWithLink | NavItemChildren => {
    if (!node.children.length)
      return { text: node.title, link: node.link }

    return {
      text: node.title,
      items: node.children.map(child => ({
        text: child.title,
        link: child.link,
      })),
    }
  })
}
