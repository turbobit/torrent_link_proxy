const { spawnSync } = require('node:child_process')
const path = require('node:path')

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
    process.exit(0)
  }
}

console.error('Build failed: suitable shell/runtime not found.')
process.exit(1)
