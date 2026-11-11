import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
const localCargo = path.join(root, '.tools', 'cargo');
if (existsSync(path.join(localCargo, 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo'))) {
    env.CARGO_HOME = localCargo;
    env.RUSTUP_HOME = path.join(root, '.tools', 'rustup');
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
    env[pathKey] = path.join(localCargo, 'bin') + path.delimiter + (env[pathKey] || '');
}
const child = spawn(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...process.argv.slice(2)], {
    cwd: root, env, stdio: 'inherit'
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
