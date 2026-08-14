<script setup>
import { ref, onMounted } from 'vue'
import init, { toMarkdownBytes, formatFromBytes } from '@firecrawl/anydoc-wasm'
import { isOfd, extractOfdText } from './ofd.js'

// —— 常量 ——
const ENGINE = { ANYDOC: 'anydoc', OFD: 'OFD(纯JS)' }
// 可被解析的本地文件类型（anydoc 支持 + OFD 单独处理）
const ACCEPTED =
  '.pdf,.doc,.docx,.odt,.rtf,.epub,.ppt,.pptx,.xls,.xlsx,.ods,.odp,.csv,.ofd'

// —— 状态 ——
const status = ref('init') // init | loading | converting | done | error
const statusText = ref('正在初始化 anydoc WASM 运行时…')
const markdown = ref('')
const ofdText = ref('') // OFD 抽取出的文本
const errorMsg = ref('')
const stats = ref(null)
const detectedFormat = ref('')
const elapsed = ref(0)
const engine = ref(ENGINE.ANYDOC)

function setStatus(s, text) {
  status.value = s
  statusText.value = text
}

function formatBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}

function computeStats(text) {
  return {
    chars: text.length,
    words: (text.match(/\S+/g) || []).length,
    lines: text.split('\n').length,
  }
}

// —— anydoc 路径（PDF / doc / docx / ppt / xlsx …；OFD 除外）——
async function convertBytes(bytes, label) {
  engine.value = ENGINE.ANYDOC
  ofdText.value = ''
  setStatus('converting', `正在用 anydoc 转换 ${label}（${formatBytes(bytes.length)}）…`)
  detectedFormat.value = formatFromBytes(bytes) || '未知（anydoc 未能从内容识别）'
  const t0 = performance.now()
  let md
  try {
    md = toMarkdownBytes(bytes) // PDF 只能走 toMarkdownBytes；toDocument 对 PDF 会报错
  } catch (e) {
    const code = e?.code || e?.message || String(e)
    setStatus('error', `转换失败：${code}`)
    errorMsg.value = e?.stack || String(e)
    return
  }
  elapsed.value = Math.round(performance.now() - t0)
  markdown.value = md
  stats.value = computeStats(md)
  setStatus('done', `${label} 转换完成`)
}

// —— OFD 路径（仅 .ofd 触发，由 ./ofd.js 纯 JS 解析）——
async function handleOfd(file) {
  engine.value = ENGINE.OFD
  markdown.value = ''
  setStatus('converting', `正在用纯 JS 解析 ${file.name}（${formatBytes(file.size)}）…`)
  const t0 = performance.now()
  try {
    const buf = await file.arrayBuffer()
    const { text, pages, codes } = await extractOfdText(buf)
    elapsed.value = Math.round(performance.now() - t0)
    ofdText.value = text
    stats.value = computeStats(text)
    detectedFormat.value = 'ofd'
    setStatus('done', `${file.name} 解析完成（纯 JS 抽取，共 ${pages} 页 / ${codes} 段文本）`)
  } catch (e) {
    const code = e?.message || e?.code || String(e)
    setStatus('error', `OFD 解析失败：${code}`)
    errorMsg.value = e?.stack || String(e)
  }
}

// —— 路由：.ofd 走纯 JS，其余一律走 anydoc ——
async function handleFile(file) {
  if (isOfd(file)) {
    await handleOfd(file)
  } else {
    const buf = await file.arrayBuffer()
    await convertBytes(new Uint8Array(buf), file.name)
  }
}

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (file) handleFile(file)
}

onMounted(async () => {
  try {
    await init() // 加载并实例化 wasm，纯浏览器端、无需后端 / API Key
  } catch (e) {
    setStatus('error', `WASM 初始化失败：${e?.message || e}`)
    errorMsg.value = e?.stack || String(e)
    return
  }
  setStatus('ready', 'WASM 已就绪，请选择本地文件（PDF / Office 或 .ofd）开始解析')
})
</script>

<template>
  <main class="page">
    <header>
      <h1>anydoc + OFD 可用性验证</h1>
      <p class="sub">
        @firecrawl/anydoc-wasm · 纯浏览器端（WebAssembly）· 无后端 / 无 API Key · 文件不离开本机
        <br />PDF / Office 等走 anydoc；<strong>.ofd 走纯 JS(jszip) 文本抽取</strong>（anydoc 不支持 OFD）
      </p>
    </header>

    <section class="controls">
      <label class="upload">
        选择本地文件测试
        <input type="file" :accept="ACCEPTED" @change="onFileChange" />
      </label>
    </section>

    <section class="status" :data-state="status">
      <span class="dot"></span>
      <span class="status-text">{{ statusText }}</span>
      <span v-if="status === 'done' && stats" class="meta">
        引擎：{{ engine }} · 格式：{{ detectedFormat }} ·
        字符 {{ stats.chars.toLocaleString() }} ·
        词 {{ stats.words.toLocaleString() }} ·
        行 {{ stats.lines.toLocaleString() }} ·
        耗时 {{ elapsed }} ms
      </span>
    </section>

    <section v-if="status === 'error'" class="error">
      <pre>{{ errorMsg }}</pre>
    </section>

    <!-- OFD 分支结果：纯 JS 文本抽取（anydoc 不支持 OFD） -->
    <section v-else-if="engine === 'OFD(纯JS)' && ofdText" class="output">
      <div class="output-head">OFD 文本抽取结果（纯 JS · jszip 解包 + 抽 TextCode · 不进 anydoc · 无 OCR）</div>
      <pre class="md">{{ ofdText || '（该 OFD 未抽到可识别文本，可能是图片型 / 扫描型）' }}</pre>
    </section>

    <!-- anydoc 分支结果：Markdown -->
    <section v-else-if="markdown" class="output">
      <div class="output-head">转换结果（GitHub-Flavored Markdown · anydoc）</div>
      <pre class="md">{{ markdown }}</pre>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}
header h1 {
  margin: 0 0 4px;
  font-size: 24px;
}
.sub {
  margin: 0 0 20px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}
.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
button {
  padding: 8px 14px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.upload {
  font-size: 13px;
  color: #374151;
}
.upload input {
  margin-left: 6px;
}
.status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #eef2ff;
  font-size: 14px;
  flex-wrap: wrap;
}
.status[data-state='done'] {
  background: #ecfdf5;
}
.status[data-state='error'] {
  background: #fef2f2;
}
.status .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6366f1;
  flex: none;
}
.status[data-state='done'] .dot {
  background: #10b981;
}
.status[data-state='error'] .dot {
  background: #ef4444;
}
.status .meta {
  font-size: 12px;
  color: #6b7280;
}
.error {
  margin-top: 16px;
  padding: 12px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 8px;
}
.error pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}
.output {
  margin-top: 16px;
}
.output-head {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}
.md {
  max-height: 60vh;
  overflow: auto;
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
