// push の前に、CI の項目のうちコミット前の確認に入っていないものを手元で流す（.githooks/pre-push から呼ぶ）。
// 作業ツリーには別の作業の未コミットの変更があるので、push するコミットを一時的な worktree に出して確かめる。
import { spawnSync } from 'node:child_process'
import { symlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'

// hook の中では GIT_DIR などが入っていて、別の worktree での git を邪魔する
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key]

// Ctrl-C で止めても一時的な worktree を消せるよう、子のプロセスだけ止まるようにする
process.on('SIGINT', () => {})

const ZERO = /^0+$/
const BUILD = /^(src\/|index\.html$|package(-lock)?\.json$|vite\.config|tsconfig|scripts\/(build|lint)\/)/
const E2E = /^(src\/|e2e\/|index\.html$|package(-lock)?\.json$|vite\.config|playwright\.config)/
const DATABASE = /^supabase\/(migrations|tests)\//

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' })
const out = (...args) => git(...args).stdout.trim()

/** 前に push した位置からの差分。比べる先が分からなければ null（全部の項目を流す） */
function changedFiles(sha, remoteSha) {
  const known = !ZERO.test(remoteSha) && git('cat-file', '-e', `${remoteSha}^{commit}`).status === 0
  const base = known ? remoteSha : out('merge-base', sha, 'origin/dev')
  if (!base) return null
  const diff = git('diff', '--name-only', base, sha)
  return diff.status === 0 ? diff.stdout.split('\n').filter(Boolean) : null
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer().once('error', reject)
    server.listen(0, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function checksFor(files) {
  const touches = (pattern) => files === null || files.some((file) => pattern.test(file))
  const checks = [['書式', 'npm run format:check']]
  if (touches(BUILD)) {
    checks.push(['型とビルド', 'npx tsc -b --force && npx vite build --manifest'])
    checks.push(['型の抜けの数', 'npm run lint:unchecked-index'])
    checks.push(['起動時の大きさ', 'node scripts/build/startup-size.mjs'])
  }
  if (touches(E2E)) checks.push(['e2e', 'npm run test:e2e'])
  return checks
}

async function verify(sha, files) {
  const repo = dirname(out('rev-parse', '--path-format=absolute', '--git-common-dir'))
  const dir = join(repo, '.claude', 'worktrees', `pre-push-${process.pid}`)
  const added = git('worktree', 'add', '--detach', dir, sha)
  if (added.status !== 0) {
    console.error(`pre-push: 確かめる場所を作れませんでした\n${added.stderr}`)
    return false
  }
  try {
    symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'))
    const env = { ...process.env, CI: '1', E2E_PORT: String(await freePort()) }
    for (const [label, command] of checksFor(files)) {
      console.error(`pre-push: ${label}`)
      const { status } = spawnSync(command, { cwd: dir, env, shell: true, stdio: ['ignore', 'inherit', 'inherit'] })
      if (status !== 0) {
        console.error(`\npre-push: 「${label}」で落ちたので push を止めました（CI でも落ちます）`)
        return false
      }
    }
    return true
  } finally {
    git('worktree', 'remove', '--force', dir)
  }
}

let input = ''
for await (const chunk of process.stdin) input += chunk

const pushes = input
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split(' '))
  .filter(([, sha]) => !ZERO.test(sha))

for (const [, sha, , remoteSha] of pushes) {
  const files = changedFiles(sha, remoteSha)
  if (files && files.length === 0) continue
  if (!(await verify(sha, files))) process.exit(1)
  if (files?.some((file) => DATABASE.test(file))) {
    console.error('pre-push: migration か pgTAP が変わっています。手元では確かめていないので CI の database を見てください')
  }
}
