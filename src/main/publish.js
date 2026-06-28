import { listVideos, archiveVideo } from './files.js'

/** 按粉丝量得到单账号单次发布上限（硬上限 10） */
export function fanLimit(f) {
  if (f > 10000) return 10
  if (f >= 3000) return 5
  if (f >= 1000) return 2
  return 0
}

/**
 * 关联 + 归档（+ 可选自动发布）
 * cfg = { folder, accountIds:[], dayTotal, runAutomation:boolean }
 */
export async function runPublish(cfg, db, log = () => {}) {
  const { folder, accountIds, dayTotal, runAutomation } = cfg
  log(`读取文件夹：${folder}`)

  const videos = listVideos(folder)
  const accounts = accountIds
    .map((id) => db.prepare('SELECT * FROM accounts WHERE id = ?').get(id))
    .filter(Boolean)

  const slots = accounts.map((a) => ({ a, cap: Math.min(dayTotal, fanLimit(a.fans)), done: 0 }))
  const totalCap = slots.reduce((s, c) => s + c.cap, 0)
  log(`需关联视频数 = Σ(日发布总数 ∩ 粉丝量上限) = ${totalCap}，源文件夹视频 ${videos.length} 个`)

  const insertTask = db.prepare(
    `INSERT INTO tasks (account_id, account_name, file, src_path, product_id, status)
     VALUES (?, ?, ?, ?, ?, 'wait')`
  )

  let ai = 0
  let ok = 0
  let fail = 0

  for (const v of videos) {
    while (ai < slots.length && slots[ai].done >= slots[ai].cap) ai++
    if (ai >= slots.length) break

    if (v.bad) {
      archiveVideo(folder, v.name, 'error', null)
      fail++
      log(`关联失败 ${v.name}：非视频 / 无法解析商品编号 → 移入 error/`)
      continue
    }

    const cur = slots[ai]
    const dest = archiveVideo(folder, v.name, 'success', v.productId)
    cur.done++
    ok++
    insertTask.run(cur.a.id, cur.a.name, v.name, dest, v.productId)
    log(`已关联 ${v.name} → 账号 ${cur.a.name}（${cur.done}/${cur.cap}）→ success/${v.productId}/`)
  }

  slots.forEach((c) => {
    if (c.done < c.cap) log(`${c.a.name}（粉丝 ${c.a.fans}）可发不足，已发 ${c.done}/${c.cap}`)
  })
  log(`关联完成：成功 ${ok}，失败 ${fail}`)

  if (runAutomation) {
    const { publishOne } = await import('./automation.js')
    const waitTasks = db.prepare("SELECT * FROM tasks WHERE status = 'wait'").all()
    for (const t of waitTasks) {
      db.prepare("UPDATE tasks SET status='ing', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.id)
      log(`▶ 发布任务 #${t.id}（${t.account_name} · ${t.file}）…`)
      try {
        const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(t.account_id)
        await publishOne(
          acc,
          { videoPath: t.src_path, productId: t.product_id, title: t.product_id, topics: [] },
          log
        )
        db.prepare("UPDATE tasks SET status='done', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.id)
        log(`✓ 任务 #${t.id} 发布成功`)
      } catch (err) {
        const reason = String((err && err.message) || err)
        db.prepare("UPDATE tasks SET status='fail', reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reason, t.id)
        log(`✗ 任务 #${t.id} 发布失败：${reason}`)
      }
    }
  }

  return { ok, fail }
}
