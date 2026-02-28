const { spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const rootDir = path.join(__dirname, '..')
const isWin = process.platform === 'win32'
const commands = isWin
  ? [
      ['powershell', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'build.ps1')],
      ['pwsh', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'build.ps1')],
    ]
  : [['bash', path.join(__dirname, 'build.sh')]]

for (const cmd of commands) {
  const [command, ...args] = cmd
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: rootDir,
  })

  if (!result.error && result.status === 0) {
    // 빌드 성공 시 dist/pages를 레포 루트의 docs/로 복사하여 GitHub Pages에서 바로 사용하도록 함
    try {
      const pagesSrc = path.join(rootDir, 'dist', 'pages')
      const docsDest = path.join(rootDir, 'docs')

      if (fs.existsSync(pagesSrc)) {
        // 기존 docs 디렉터리 제거
        fs.rmSync(docsDest, { recursive: true, force: true })
        // Node 16+에서 사용 가능한 fs.cpSync로 전체 복사
        if (typeof fs.cpSync === 'function') {
          fs.cpSync(pagesSrc, docsDest, { recursive: true, force: true })
        } else {
          // cpSync가 없을 경우 간단한 재귀 복사(대체)
          const copyRecursiveSync = (src, dest) => {
            const entries = fs.readdirSync(src, { withFileTypes: true })
            if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
            for (const entry of entries) {
              const srcPath = path.join(src, entry.name)
              const destPath = path.join(dest, entry.name)
              if (entry.isDirectory()) copyRecursiveSync(srcPath, destPath)
              else fs.copyFileSync(srcPath, destPath)
            }
          }
          copyRecursiveSync(pagesSrc, docsDest)
        }
        console.log(`Copied pages to ${docsDest}`)
        // --push 플래그 또는 DOCS_AUTO_PUSH 환경변수가 설정된 경우 변경사항을 커밋하고 푸시
        const shouldPush = process.argv.includes('--push') || Boolean(process.env.DOCS_AUTO_PUSH)
        if (shouldPush) {
          try {
            const git = (args, opts = {}) =>
              spawnSync('git', args, { cwd: rootDir, stdio: opts.stdio || 'pipe', encoding: 'utf8' })

            const inside = git(['rev-parse', '--is-inside-work-tree'])
            if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
              console.warn('Not a git repository; skipping docs commit/push.')
            } else {
              const branchRes = git(['rev-parse', '--abbrev-ref', 'HEAD'])
              const branch = branchRes.status === 0 ? branchRes.stdout.trim() : 'main'

              git(['add', 'docs'], { stdio: 'inherit' })
              const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
              const version = pkg.version || 'unknown'
              const commitRes = git(['commit', '-m', `chore(docs): update site from build v${version}`], { stdio: 'pipe' })
              if (commitRes.status === 0) {
                console.log(`Committed docs; pushing to origin/${branch}`)
                const pushRes = git(['push', 'origin', branch], { stdio: 'inherit' })
                if (pushRes.status !== 0) {
                  console.error('git push failed; please push manually.')
                }
              } else {
                // 커밋이 없거나 실패한 경우
                if (commitRes.stdout && commitRes.stdout.includes('nothing to commit')) {
                  console.log('No changes to commit for docs/.')
                } else {
                  console.warn('git commit returned non-zero status; output:', commitRes.stdout || commitRes.stderr)
                }
              }
            }
          } catch (err) {
            console.error('Failed to commit/push docs/:', err)
          }
        }
      } else {
        console.warn('Warning: dist/pages not found; nothing copied to docs/')
      }
    } catch (err) {
      console.error('Failed to copy pages to docs/:', err)
      process.exit(1)
    }

    process.exit(0)
  }
}

console.error('Build failed: suitable shell/runtime not found.')
process.exit(1)
