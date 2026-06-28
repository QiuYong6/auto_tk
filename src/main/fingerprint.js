// 每账号一套独立「虚拟设备」指纹（轻量自建）。需要更深的指纹伪造或接商业指纹浏览器时再扩展。
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
]

export function generateFingerprint() {
  return {
    ua: UA_POOL[Math.floor(Math.random() * UA_POOL.length)],
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN'
  }
}
