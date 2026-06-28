import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { generateFingerprint } from './fingerprint.js'

// 为已存在但缺少列的 accounts 表补列（幂等）
function ensureColumns(db) {
  const cols = db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name)
  const add = (name, def) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${def}`)
  }
  add('account_type', "TEXT DEFAULT '发布帐户'")
  add('live_room', 'TEXT')
  add('note', 'TEXT')
  add('clip_structure', 'TEXT')
  add('clip_method', 'TEXT')
  add('ad_config', 'INTEGER DEFAULT 0')
  add('roi_weight', 'REAL DEFAULT 1')
  add('budget', 'INTEGER DEFAULT 0')
  add('avatar', 'TEXT')
  add('login_time', 'TEXT')
  add('timezone', 'TEXT')
  add('locale', 'TEXT')
}

// 给没有指纹（ua 为空）的账号生成并回填一套指纹
function backfillFingerprint(db) {
  const rows = db.prepare("SELECT id FROM accounts WHERE ua IS NULL OR ua = ''").all()
  const upd = db.prepare('UPDATE accounts SET ua = ?, timezone = ?, locale = ? WHERE id = ?')
  for (const r of rows) {
    const f = generateFingerprint()
    upd.run(f.ua, f.timezone, f.locale, r.id)
  }
}

export function initDb() {
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const db = new Database(path.join(dir, 'douyin.db'))
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT,
      dy_name    TEXT,
      dy_id      TEXT,
      fans       INTEGER DEFAULT 0,
      status     TEXT DEFAULT '启用',
      logged_in  INTEGER DEFAULT 0,
      proxy      TEXT,
      ua         TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id   INTEGER,
      account_name TEXT,
      file         TEXT,
      src_path     TEXT,
      product_id   TEXT,
      status       TEXT DEFAULT 'wait',
      reason       TEXT,
      updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)

  const n = db.prepare('SELECT COUNT(*) AS c FROM accounts').get().c
  if (n === 0) {
    // 演示账号全部为「未登录」，方便逐个测试扫码登录
    const ins = db.prepare(
      `INSERT INTO accounts (name, dy_name, dy_id, fans, status, logged_in, proxy, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    ins.run('美妆小铺', '', '', 0, '启用', 0, '', '')
    ins.run('零食日记', '', '', 0, '启用', 0, '', '')
    ins.run('家居好物', '', '', 0, '启用', 0, '', '')
    ins.run('数码测评', '', '', 0, '启用', 0, '', '')
  }

  // 一次性迁移：把现有库里的所有账号重置为「未登录」（仅执行一次；
  // 之后真实扫码登录的状态会正常保留，不会被再次重置）。
  const ver = db.pragma('user_version', { simple: true })
  if (ver < 2) {
    db.prepare('UPDATE accounts SET logged_in = 0').run()
    db.pragma('user_version = 2')
  }

  ensureColumns(db)
  backfillFingerprint(db)

  // 确保有「子苏」账号（与发布列表演示数据对应；已存在则不重复加）
  const hasZisu = db.prepare('SELECT COUNT(*) AS c FROM accounts WHERE name = ?').get('子苏').c
  if (!hasZisu) {
    const f = generateFingerprint()
    db.prepare(
      `INSERT INTO accounts (name, account_type, status, logged_in, ua, timezone, locale)
       VALUES ('子苏', '发布帐户', '启用', 0, ?, ?, ?)`
    ).run(f.ua, f.timezone, f.locale)
  }

  return db
}
