import { decodeTextBuffer } from './decode'
import { isStandaloneChapterHeading, matchVolumeHeading } from './headings'
import { MAX_EPUB_ENTRY_BYTES, MAX_EPUB_TOTAL_BYTES } from './limits'
import { finalizeBook, parseTxtText, titleFromFileName } from './txt'
import type { ImportWarning, ParsedBook, ParsedChapter, ParsedVolume } from './types'
import { ImportError } from './types'

const OPS_NS = 'http://www.idpf.org/2007/ops'
const XHTML_TYPES = new Set(['application/xhtml+xml', 'text/html', 'application/xml', 'text/xml', ''])

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'aside',
  'main',
  'nav',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ul',
  'ol',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'figure',
  'figcaption',
  'hr',
])

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'math', 'rt', 'rp'])

interface ZipEntry {
  async(type: 'uint8array'): Promise<Uint8Array>
}

interface ManifestItem {
  id: string
  href: string
  mediaType: string
  properties: string
}

interface TocNode {
  title: string
  path: string
  fragment: string
  level: number
  hasChildren: boolean
  children: TocNode[]
}

interface TocEntry {
  title: string
  path: string
  fragment: string
  volumeTitle: string
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function resolveZipPath(baseDir: string, href: string): string {
  const rawPath = href.split('#')[0]
  let decoded = rawPath
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    /* keep raw path */
  }
  const parts = [...(baseDir ? baseDir.split('/') : []), ...decoded.replace(/\\/g, '/').split('/')]
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

function parseHtmlDocument(text: string): Document {
  const xmlDoc = new DOMParser().parseFromString(text, 'application/xhtml+xml')
  const failed =
    xmlDoc.documentElement?.localName.toLowerCase() === 'parsererror' ||
    xmlDoc.getElementsByTagName('parsererror').length > 0
  if (!failed) return xmlDoc
  return new DOMParser().parseFromString(text, 'text/html')
}

function findElements(root: Document | Element, localName: string): Element[] {
  const all = root.getElementsByTagName('*')
  const lower = localName.toLowerCase()
  const out: Element[] = []
  for (let i = 0; i < all.length; i++) {
    if (all[i].localName.toLowerCase() === lower) out.push(all[i])
  }
  return out
}

function textOfFirst(root: Document | Element, localName: string): string {
  const element = findElements(root, localName)[0]
  return element?.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function decodeDocument(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 200))
  const match = head.match(/encoding\s*=\s*["']([^"']+)["']/i)
  if (match) {
    const label = match[1].toLowerCase()
    const normalized = label === 'gb2312' || label === 'gbk' ? 'gb18030' : label
    try {
      return new TextDecoder(normalized).decode(bytes)
    } catch {
      /* fall through to auto-detection */
    }
  }
  const buffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : (bytes.slice().buffer as ArrayBuffer)
  return decodeTextBuffer(buffer).text
}

function extractTextFromElement(root: Node): string {
  const out: string[] = []

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent || '')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as Element
    const tag = element.localName.toLowerCase()
    if (SKIP_TAGS.has(tag)) return
    if (tag === 'br') {
      out.push('\n')
      return
    }
    const block = BLOCK_TAGS.has(tag)
    if (block) out.push('\n')
    for (let i = 0; i < element.childNodes.length; i++) walk(element.childNodes[i])
    if (block) out.push('\n')
  }

  walk(root)
  return out
    .join('')
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function firstHeading(doc: Document): string {
  for (const tag of ['h1', 'h2', 'h3', 'h4']) {
    const element = findElements(doc, tag).find((el) => (el.textContent || '').trim().length > 0)
    if (element) return (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
  }
  return ''
}

function flattenToc(nodes: TocNode[], currentVolume = ''): TocEntry[] {
  const out: TocEntry[] = []
  let volume = currentVolume

  for (const node of nodes) {
    // A top-level TOC node with children is treated as a volume. Flat TOCs
    // mark volumes with titles such as "第一卷" / "Volume 1".
    if (node.level === 0 && node.hasChildren) {
      out.push(...flattenToc(node.children, node.title || volume))
      volume = node.title || volume
      continue
    }
    if (!node.hasChildren && matchVolumeHeading(node.title)) {
      volume = node.title || volume
      continue
    }
    if (node.hasChildren) {
      out.push(...flattenToc(node.children, volume))
      continue
    }
    if (node.path) {
      out.push({ title: node.title, path: node.path, fragment: node.fragment, volumeTitle: volume })
    }
  }

  return out
}

function parseNavToc(doc: Document, baseDir: string): TocNode[] {
  const navs = Array.from(doc.getElementsByTagName('nav'))
  const tocNav =
    navs.find((nav) => (nav.getAttributeNS(OPS_NS, 'type') || '').split(/\s+/).includes('toc')) ||
    navs.find((nav) => (nav.getAttribute('role') || '') === 'doc-toc') ||
    navs.find((nav) => nav.querySelector('ol'))
  if (!tocNav) return []
  const rootList = tocNav.querySelector('ol')
  if (!rootList) return []

  const parseList = (list: Element, level: number): TocNode[] => {
    const nodes: TocNode[] = []
    for (const li of Array.from(list.children)) {
      if (li.localName.toLowerCase() !== 'li') continue
      const children = Array.from(li.children)
      const label = children.find((el) => ['a', 'span'].includes(el.localName.toLowerCase()))
      const anchor = label && label.localName.toLowerCase() === 'a' ? label : null
      const title = (label?.textContent || '').replace(/\s+/g, ' ').trim()
      const href = anchor?.getAttribute('href') || ''
      const [pathPart, fragment = ''] = href.split('#')
      const childList = children.find((el) => el.localName.toLowerCase() === 'ol')
      const childNodes = childList ? parseList(childList, level + 1) : []
      if (!title && !href && childNodes.length === 0) continue
      nodes.push({
        title,
        path: pathPart ? resolveZipPath(baseDir, pathPart) : '',
        fragment,
        level,
        hasChildren: childNodes.length > 0,
        children: childNodes,
      })
    }
    return nodes
  }

  return parseList(rootList, 0)
}

function parseNcxToc(doc: Document, baseDir: string): TocNode[] {
  const navMap = findElements(doc, 'navmap')[0]
  if (!navMap) return []

  const parsePoints = (parent: Element, level: number): TocNode[] => {
    const nodes: TocNode[] = []
    for (const child of Array.from(parent.children)) {
      if (child.localName.toLowerCase() !== 'navpoint') continue
      const label = Array.from(child.children).find((el) => el.localName.toLowerCase() === 'navlabel')
      const textElement = label
        ? Array.from(label.getElementsByTagName('*')).find((el) => el.localName.toLowerCase() === 'text')
        : null
      const content = Array.from(child.children).find((el) => el.localName.toLowerCase() === 'content')
      const src = content?.getAttribute('src') || ''
      const [pathPart, fragment = ''] = src.split('#')
      const childNodes = parsePoints(child, level + 1)
      nodes.push({
        title: (textElement?.textContent || '').replace(/\s+/g, ' ').trim(),
        path: pathPart ? resolveZipPath(baseDir, pathPart) : '',
        fragment,
        level,
        hasChildren: childNodes.length > 0,
        children: childNodes,
      })
    }
    return nodes
  }

  return parsePoints(navMap, 0)
}

function findAnchor(doc: Document, fragment: string): Element | null {
  if (!fragment) return null
  try {
    const byId = doc.getElementById(fragment)
    if (byId) return byId
  } catch {
    /* ignore */
  }
  const all = doc.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    if (all[i].getAttribute('id') === fragment || all[i].getAttribute('name') === fragment) {
      return all[i]
    }
  }
  return null
}

function splitDocByEntries(
  doc: Document,
  entries: TocEntry[],
  fallbackText: string,
  warnings: ImportWarning[],
): { title: string; text: string }[] {
  if (entries.length === 1) {
    return [{ title: entries[0].title, text: fallbackText }]
  }

  const anchors = entries.map((entry) => findAnchor(doc, entry.fragment))
  if (anchors.every((anchor) => anchor !== null)) {
    const parts: { title: string; text: string }[] = []
    const bodyEnd = doc.body?.lastChild || doc.documentElement
    for (let i = 0; i < entries.length; i++) {
      const range = doc.createRange()
      range.setStartBefore(anchors[i] as Element)
      const next = anchors[i + 1]
      if (next) range.setEndBefore(next)
      else range.setEndAfter(bodyEnd)
      const container = doc.createElement('div')
      container.appendChild(range.cloneContents())
      parts.push({ title: entries[i].title, text: extractTextFromElement(container) })
    }
    return parts
  }

  warnings.push({ code: 'fragmentFallback' })
  return entries.map((entry, index) => ({
    title: entry.title,
    text: index === 0 ? fallbackText : '',
  }))
}

function normalizeForTitle(text: string): string {
  return text
    .replace(/^[#\s]+/, '')
    .replace(/\s+/g, '')
    .trim()
}

/** Remove the chapter heading that XHTML extraction leaves at the top. */
function stripLeadingTitle(text: string, title: string): string {
  const normalizedTitle = normalizeForTitle(title)
  if (!normalizedTitle) return text
  const lines = text.split('\n')
  if (lines.length <= 1) return text
  const first = normalizeForTitle(lines[0])
  if (isStandaloneChapterHeading(lines[0]) && first.includes(normalizedTitle)) {
    return lines.slice(1).join('\n').trim()
  }
  return text
}

function appendToVolumes(volumes: Map<string, ParsedChapter[]>, volumeTitle: string, title: string, content: string) {
  const trimmed = stripLeadingTitle(content, title).trim()
  if (!trimmed) return
  const key = volumeTitle || '正文'
  if (!volumes.has(key)) volumes.set(key, [])
  volumes.get(key)?.push({ title: title || `第${(volumes.get(key)?.length || 0) + 1}章`, content: trimmed })
}

/**
 * Parse an EPUB file entirely in the browser. Throws ImportError with a
 * machine-readable code for unsupported / DRM-protected / empty books.
 */
export async function parseEpub(file: File): Promise<ParsedBook> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new ImportError('INVALID_EPUB', '文件不是有效的 EPUB（ZIP）格式')
  }

  const jszipModule: any = await import('jszip')
  const ZipCtor = jszipModule.default || jszipModule
  const zip = await ZipCtor.loadAsync(buffer)

  const entries = new Map<string, ZipEntry>()
  zip.forEach((relativePath: string, entry: any) => {
    if (entry.dir) return
    entries.set(normalizeZipPath(relativePath), entry)
  })

  let totalUncompressed = 0
  const readBytes = async (path: string): Promise<Uint8Array | null> => {
    const entry = entries.get(normalizeZipPath(path))
    if (!entry) return null
    const data = await entry.async('uint8array')
    totalUncompressed += data.byteLength
    if (data.byteLength > MAX_EPUB_ENTRY_BYTES || totalUncompressed > MAX_EPUB_TOTAL_BYTES) {
      throw new ImportError('EPUB_TOO_LARGE', 'EPUB 解压后的内容过大')
    }
    return data
  }

  if (entries.has('meta-inf/rights.xml')) {
    throw new ImportError('DRM_PROTECTED', '该 EPUB 受 DRM 保护，无法导入')
  }
  const encryptionBytes = await readBytes('META-INF/encryption.xml')
  if (encryptionBytes) {
    const encryptionDoc = parseXml(decodeDocument(encryptionBytes))
    const refs = findElements(encryptionDoc, 'cipherreference').map((el) => el.getAttribute('URI') || '')
    const encryptedText = refs.some((uri) => /\.(x?html?|opf|ncx|xml)$/i.test(uri.split('#')[0]))
    if (encryptedText) {
      throw new ImportError('DRM_PROTECTED', '该 EPUB 的正文经过加密（DRM），无法导入')
    }
  }

  const containerBytes = await readBytes('META-INF/container.xml')
  let opfPath = ''
  if (containerBytes) {
    const containerDoc = parseXml(decodeDocument(containerBytes))
    const rootfile = findElements(containerDoc, 'rootfile')[0]
    opfPath = rootfile?.getAttribute('full-path') || ''
  }
  if (!opfPath) {
    opfPath = Array.from(entries.keys()).find((path) => path.endsWith('.opf')) || ''
  }
  if (!opfPath) {
    throw new ImportError('INVALID_EPUB', 'EPUB 中找不到 OPF 文件')
  }

  const normalizedOpfPath = normalizeZipPath(opfPath)
  const opfBytes = await readBytes(normalizedOpfPath)
  if (!opfBytes) {
    throw new ImportError('INVALID_EPUB', 'EPUB 的 OPF 文件无法读取')
  }
  const opfDoc = parseXml(decodeDocument(opfBytes))
  const opfDir = dirname(normalizedOpfPath)

  const bookTitle = textOfFirst(opfDoc, 'title')
  const author = textOfFirst(opfDoc, 'creator')
  const language = textOfFirst(opfDoc, 'language')
  const description = textOfFirst(opfDoc, 'description')

  const manifest = new Map<string, ManifestItem>()
  for (const item of findElements(opfDoc, 'item')) {
    const id = item.getAttribute('id') || ''
    const href = item.getAttribute('href') || ''
    if (!id || !href) continue
    manifest.set(id, {
      id,
      href,
      mediaType: (item.getAttribute('media-type') || '').toLowerCase(),
      properties: item.getAttribute('properties') || '',
    })
  }

  const spineElement = findElements(opfDoc, 'spine')[0]
  const spineTocId = spineElement?.getAttribute('toc') || ''
  const spineItems: { idref: string; linear: string | null }[] = []
  for (const itemref of findElements(opfDoc, 'itemref')) {
    const idref = itemref.getAttribute('idref') || ''
    if (idref) spineItems.push({ idref, linear: itemref.getAttribute('linear') })
  }

  const navItem = Array.from(manifest.values()).find((item) => item.properties.split(/\s+/).includes('nav')) || null
  const ncxItem =
    (spineTocId ? manifest.get(spineTocId) : undefined) ||
    Array.from(manifest.values()).find((item) => item.mediaType === 'application/x-dtbncx+xml') ||
    null

  const warnings: ImportWarning[] = []

  let tocEntries: TocEntry[] = []
  if (navItem) {
    const navPath = resolveZipPath(opfDir, navItem.href)
    const navBytes = await readBytes(navPath)
    if (navBytes) {
      const navDoc = parseHtmlDocument(decodeDocument(navBytes))
      tocEntries = flattenToc(parseNavToc(navDoc, dirname(navPath)))
    }
  }
  if (tocEntries.length === 0 && ncxItem) {
    const ncxPath = resolveZipPath(opfDir, ncxItem.href)
    const ncxBytes = await readBytes(ncxPath)
    if (ncxBytes) {
      const ncxDoc = parseXml(decodeDocument(ncxBytes))
      tocEntries = flattenToc(parseNcxToc(ncxDoc, dirname(ncxPath)))
    }
  }

  const fallbackTitle = bookTitle || titleFromFileName(file.name)
  const chapterMap = new Map<string, ParsedChapter[]>()

  const entriesByPath = new Map<string, TocEntry[]>()
  for (const entry of tocEntries) {
    const key = normalizeZipPath(entry.path)
    if (!entriesByPath.has(key)) entriesByPath.set(key, [])
    entriesByPath.get(key)?.push(entry)
  }

  if (tocEntries.length === 0) {
    // No usable TOC: treat each spine document as a chapter, merging very
    // short documents into the previous one. If a document contains several
    // "Chapter N" headings, split it with the TXT parser.
    warnings.push({ code: 'tocIncomplete' })
  }

  // Process one spine document at a time so the raw XHTML and DOM of the
  // whole book are not kept alive while parsing.
  let spineIndex = 0
  for (const spineItem of spineItems) {
    if (spineItem.linear === 'no') continue
    const item = manifest.get(spineItem.idref)
    if (!item) continue
    if (item.properties.split(/\s+/).includes('nav')) continue
    if (!XHTML_TYPES.has(item.mediaType)) continue
    const docPath = resolveZipPath(opfDir, item.href)
    const docBytes = await readBytes(docPath)
    if (!docBytes) continue
    const doc = parseHtmlDocument(decodeDocument(docBytes))
    const text = extractTextFromElement(doc.body || doc.documentElement)
    if (text.length < 20) continue
    spineIndex += 1
    const title = firstHeading(doc) || `第${spineIndex}章`

    if (tocEntries.length === 0) {
      const split = parseTxtText(text, file.name, [], title)
      const splitChapters = split.volumes.flatMap((volume) => volume.chapters)
      if (splitChapters.length > 1) {
        for (const chapter of splitChapters) appendToVolumes(chapterMap, '正文', chapter.title, chapter.content)
      } else {
        appendToVolumes(chapterMap, '正文', title, text)
      }
      continue
    }

    const entries = entriesByPath.get(normalizeZipPath(docPath))
    if (entries && entries.length > 0) {
      const parts = splitDocByEntries(doc, entries, text, warnings)
      for (let i = 0; i < parts.length; i++) {
        appendToVolumes(chapterMap, entries[i].volumeTitle, parts[i].title, parts[i].text)
      }
    } else {
      // Content not covered by the TOC: keep it as a chapter so nothing is lost.
      warnings.push({ code: 'tocIncomplete' })
      appendToVolumes(chapterMap, '', title, text)
    }
  }

  const volumes: ParsedVolume[] = Array.from(chapterMap.entries()).map(([title, chapters]) => ({
    title,
    chapters,
  }))

  if (volumes.length === 0 || volumes.every((volume) => volume.chapters.length === 0)) {
    throw new ImportError('EMPTY_BOOK', '未检测到可导入的文本内容（可能是图片版或 DRM 保护的 EPUB）')
  }

  return finalizeBook(volumes, {
    title: fallbackTitle,
    author: author || undefined,
    description: description || undefined,
    language: language || undefined,
    format: 'epub',
    warnings,
  })
}
