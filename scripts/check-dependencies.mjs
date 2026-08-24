import { execFileSync } from 'node:child_process';

const checks = [
  ['node', ['--version'], true],
  ['npm', ['--version'], true],
];

let requiredFailure = false;

for (const [command, args, required] of checks) {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    console.log(`ok       ${command}: ${output.split('\n')[0]}`);
  } catch (error) {
    const detail = error.stderr?.toString().trim().split('\n')[0] ?? 'not found';
    console.log(`${required ? 'error   ' : 'optional'} ${command}: ${detail}`);
    requiredFailure ||= required;
  }
}

try {
  // npm 11 can misreport incompatible, optional fsevents versions shared by
  // Playwright and Vite on macOS. Validate the complete shipped dependency
  // tree here; the dev tree is exercised by the check and e2e commands.
  execFileSync('npm', ['ls', '--all', '--omit=dev'], { stdio: 'ignore' });
  console.log('ok       npm production dependency tree');
} catch {
  console.log('error    npm production dependency tree is invalid; run npm install');
  requiredFailure = true;
}

if (requiredFailure) {
  process.exitCode = 1;
}
