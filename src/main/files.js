import fs from 'fs'
import path from 'path'

export const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.mkv', '.flv']

/**
 * 从文件名解析商品编号。约定：同商品多视频用 -1 / -2 区分。
 *   商品123-1.mp4  -> { productId: '商品123', seq: 1 }
 *   商品456.mp4    -> { productId: '商品456', seq: null }
 *   说明.txt       -> { bad: true }（非视频，无法关联）
 */
export function parseProduct(filename) {
  const ext = path.extname(filename).toLowerCase()
  const base = path.basename(filename, ext)
  if (!VIDEO_EXT.includes(ext)) return { productId: null, seq: null, bad: true }
  const m = base.match(/^(.*?)(?:-(\d+))?$/)
  const productId = m && m[1] ? m[1] : base
  if (!productId) return { productId: null, seq: null, bad: true }
  return { productId, seq: m && m[2] ? Number(m[2]) : null, bad: false }
}

/** 列出文件夹内的视频文件（按文件名顺序），跳过 success/error 等子目录 */
export function listVideos(folder) {
  if (!folder || !fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((n) => !n.startsWith('.'))
    .sort()
    .map((name) => ({ name, path: path.join(folder, name), ...parseProduct(name) }))
}

/**
 * 关联归档：把视频移入
 *   成功 -> <folder>/success/<productId>/
 *   失败 -> <folder>/error/
 */
export function archiveVideo(folder, fileName, kind, productId) {
  const src = path.join(folder, fileName)
  const destDir =
    kind === 'success'
      ? path.join(folder, 'success', productId || '_unknown')
      : path.join(folder, 'error')
  fs.mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, fileName)
  fs.renameSync(src, dest)
  return dest
}

/** 归档快照：源文件夹视频 + success/<商品编号>/ + error/ */
export function listArchive(folder) {
  const result = { source: [], success: {}, error: [] }
  if (!folder || !fs.existsSync(folder)) return result
  result.source = listVideos(folder)

  const succDir = path.join(folder, 'success')
  if (fs.existsSync(succDir)) {
    for (const pid of fs.readdirSync(succDir)) {
      const p = path.join(succDir, pid)
      if (fs.statSync(p).isDirectory()) {
        result.success[pid] = fs.readdirSync(p).filter((n) => !n.startsWith('.'))
      }
    }
  }

  const errDir = path.join(folder, 'error')
  if (fs.existsSync(errDir)) {
    result.error = fs.readdirSync(errDir).filter((n) => !n.startsWith('.'))
  }
  return result
}
