// OFD（国标版式文档 .ofd）纯 JS 解析
//
// 方案：OFD 本质是一个 ZIP + XML 容器。用 jszip 解包，再逐页抽取 <TextCode> 文本。
// 免费、无授权、无外部渲染内核 / 字体，纯浏览器端运行。
//
// 注意：
// - 仅做文本抽取，不做矢量渲染预览（ofd.js 走商业授权、无授权版缺 FreeType 内核，均不可行）；
// - 原生无 OCR，图片型 / 扫描型 OFD 抽到的文本会缺失。
import JSZip from 'jszip'

// 仅 .ofd 才命中：anydoc 不支持 OFD，非 OFD 文件绝不能走此逻辑
export function isOfd(file) {
  const name = file?.name || ''
  if (name.toLowerCase().endsWith('.ofd')) return true
  // 兜底：部分浏览器对 .ofd 没有标准 MIME，仅作补充判断
  return /ofd/i.test(file?.type || '')
}

// 从 OFD 容器（ArrayBuffer）抽取全部文本
// 返回 { text, pages, codes }
export async function extractOfdText(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const names = Object.keys(zip.files)

  // 1) 定位根文档 Document.xml（OFD.xml 内的 DocRoot 指向它）
  const ofdXmlName = names.find((n) => /OFD\.xml$/i.test(n))
  let docPath = ''
  if (ofdXmlName) {
    const raw = await zip.file(ofdXmlName).async('string')
    docPath = (raw.match(/<[^>]*:?DocRoot>([^<]+)</) || [])[1] || ''
  }
  if (!docPath) docPath = names.find((n) => /Document\.xml$/i.test(n)) || ''
  if (!docPath) throw new Error('未在 OFD 容器中找到 Document.xml')

  const docXml = await zip.file(docPath).async('string')
  const base = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : ''

  // 2) 收集页面路径（每个 <Page BaseLoc="Pages/Page_0.xml"/>）
  const pageLocs = [...docXml.matchAll(/BaseLoc="([^"]+)"/g)].map((m) => m[1])
  if (pageLocs.length === 0) throw new Error('未在 Document.xml 中解析到任何页面')

  // 3) 逐页抽取 <TextCode> 文本（命名空间前缀可选，用 :? 兼容）
  const perPage = []
  for (const loc of pageLocs) {
    const full = (base + loc).replace(/\/{2,}/g, '/')
    const f = zip.file(full)
    if (!f) continue
    const xml = await f.async('string')
    const codes = [...xml.matchAll(/<[^>]*:?TextCode>([\s\S]*?)<\/[^>]*:?TextCode>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean)
    perPage.push(codes)
  }

  const text = perPage.map((p) => p.join('\n')).join('\n\n')
  return { text, pages: perPage.length, codes: perPage.flat().length }
}
