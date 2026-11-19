import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('.', import.meta.url));
const versionsPath = join(repository, 'versions.json');

async function fetchRelease(url, method = 'GET') {
  const response = await fetch(url, { method, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`PHP.net returned HTTP ${response.status} for ${url}`);
  }
  return response;
}

async function findUpdate(branch, current) {
  const response = await fetchRelease(
    `https://www.php.net/releases/index.php?json&version=${branch}&cachebuster=${Date.now()}`,
  );
  const release = await response.json();
  const latest = /^(\d+\.\d+)\.(\d+)$/.exec(release.version);
  const installed = /^(\d+\.\d+)\.(\d+)$/.exec(current.version);
  if (latest?.[1] !== branch || installed?.[1] !== branch) {
    throw new Error(`Invalid PHP release metadata for ${branch}`);
  }
  if (Number(latest[2]) <= Number(installed[2])) {
    return null;
  }

  const filename = `php-${release.version}.tar.xz`;
  const archive = release.source?.find((source) => source.filename === filename);
  if (!/^[0-9a-f]{64}$/i.test(archive?.sha256 ?? '')) {
    throw new Error(`Missing SHA-256 checksum for ${filename}`);
  }

  const url = `https://www.php.net/distributions/${filename}`;
  const ascUrl = `${url}.asc`;
  await Promise.all([fetchRelease(url, 'HEAD'), fetchRelease(ascUrl, 'HEAD')]);
  return { branch, version: release.version, url, ascUrl, sha256: archive.sha256 };
}

async function update() {
  const versions = JSON.parse(readFileSync(versionsPath, 'utf8'));
  const stable = Object.entries(versions)
    .filter(([branch, current]) => /^\d+\.\d+$/.test(branch) && current);
  const changes = (await Promise.all(stable.map(([branch, current]) => findUpdate(branch, current))))
    .filter(Boolean);
  if (changes.length === 0) {
    console.log('Tracked stable PHP releases are up to date.');
    return;
  }

  for (const { branch, ...release } of changes) {
    console.log(`PHP ${versions[branch].version} → ${release.version}`);
    Object.assign(versions[branch], release);
  }

  const staging = mkdtempSync(join(tmpdir(), 'php-update-'));
  try {
    const templateFiles = ['apply-templates.sh', 'Dockerfile-linux.template', '.jq-template.awk', 'apache2-foreground'];
    for (const name of readdirSync(repository)) {
      if (templateFiles.includes(name) || name.startsWith('docker-php-')) {
        cpSync(join(repository, name), join(staging, name), { preserveTimestamps: true });
      }
    }

    const metadata = `${JSON.stringify(versions, null, 2)}\n`;
    writeFileSync(join(staging, 'versions.json'), metadata);
    const branches = changes.map(({ branch }) => branch);
    const result = spawnSync('bash', ['./apply-templates.sh', ...branches], { cwd: staging, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      throw result.error ?? new Error(`Dockerfile generation failed (${result.signal ?? result.status})`);
    }

    for (const branch of branches) {
      cpSync(join(staging, branch), join(repository, branch), { recursive: true });
    }
    writeFileSync(versionsPath, metadata);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  await update();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
