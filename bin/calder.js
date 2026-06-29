#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const os = require('os');

const { version } = require('../package.json');
const APP_DIR = path.join(os.homedir(), '.calder', 'app');
const VERSION_FILE = path.join(APP_DIR, 'version.json');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const APP_PATH = isWin ? path.join(APP_DIR, 'Calder.exe') : path.join(APP_DIR, 'Calder.app');
const REPO = 'batuhanyuksel/calder';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const RELEASE_CHECKSUMS_PATH = path.join(__dirname, 'release-checksums.json');

function getAssetName() {
  if (isWin) {
    return `Calder-${version}-win-${process.arch === 'arm64' ? 'arm64' : 'x64'}.zip`;
  }
  if (isMac) {
    return process.arch === 'arm64'
      ? `Calder-${version}-arm64-mac.zip`
      : `Calder-${version}-mac.zip`;
  }
  return `Calder-${version}-linux-${process.arch}.AppImage`;
}

function getInstalledVersion() {
  try {
    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    return data.version;
  } catch {
    return null;
  }
}

function loadReleaseChecksums() {
  try {
    const parsed = JSON.parse(fs.readFileSync(RELEASE_CHECKSUMS_PATH, 'utf8'));
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function assertDownloadChecksum(assetName, filePath) {
  const checksums = loadReleaseChecksums();
  const versionEntry = checksums[version];
  const expected =
    versionEntry && typeof versionEntry === 'object' ? versionEntry[assetName] : undefined;

  const actual = sha256File(filePath);
  if (typeof expected === 'string' && expected.length > 0) {
    if (actual !== expected) {
      throw new Error(
        `Download checksum mismatch for ${assetName}. Expected ${expected}, got ${actual}.`,
      );
    }
    return actual;
  }

  if (process.env.CALDER_REQUIRE_CHECKSUM === '1') {
    throw new Error(
      `No pinned checksum for ${assetName} in release-checksums.json. Refusing download.`,
    );
  }

  console.warn(`Warning: no pinned checksum for ${assetName}. Stored SHA-256: ${actual}`);
  return actual;
}

function followRedirects(url, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }
    const mod = url.startsWith('https') ? https : require('http');
    mod
      .get(url, { headers: { 'User-Agent': 'calder-cli' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(followRedirects(res.headers.location, maxRedirects - 1));
        } else {
          resolve(res);
        }
      })
      .on('error', reject);
  });
}

async function download(assetName) {
  const url = `${RELEASES_URL}/download/v${version}/${assetName}`;
  const tmpFile = path.join(APP_DIR, `${assetName}.tmp`);

  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.rmSync(tmpFile, { force: true });

  console.log(`Downloading Calder v${version} for ${process.platform}-${process.arch}...`);

  const res = await followRedirects(url);

  if (res.statusCode === 404) {
    throw new Error(`Release v${version} not found. Download manually from: ${RELEASES_URL}`);
  }
  if (res.statusCode !== 200) {
    throw new Error(`Download failed with status ${res.statusCode}`);
  }

  const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
  const totalMB = totalBytes ? (totalBytes / 1048576).toFixed(1) : null;

  return new Promise((resolve, reject) => {
    let receivedBytes = 0;
    const file = fs.createWriteStream(tmpFile);
    const digest = crypto.createHash('sha256');

    file.on('error', (err) => {
      res.destroy();
      fs.rmSync(tmpFile, { force: true });
      reject(err);
    });

    res.on('data', (chunk) => {
      receivedBytes += chunk.length;
      digest.update(chunk);
      if (totalBytes) {
        const pct = Math.round((receivedBytes / totalBytes) * 100);
        const receivedMB = (receivedBytes / 1048576).toFixed(1);
        process.stdout.write(`\r  ${pct}% (${receivedMB}/${totalMB} MB)`);
      }
    });

    res.on('error', (err) => {
      file.destroy();
      fs.rmSync(tmpFile, { force: true });
      reject(err);
    });

    res.pipe(file);

    file.on('finish', () => {
      console.log('\n');
      resolve({ tmpFile, sha256: digest.digest('hex') });
    });
  });
}

function extract(zipPath, sha256) {
  console.log('Extracting...');

  fs.rmSync(APP_PATH, { recursive: true, force: true });

  if (isWin) {
    const psEscape = (p) => p.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${psEscape(zipPath)}' -DestinationPath '${psEscape(APP_DIR)}'"`,
      { stdio: 'ignore' },
    );
  } else {
    execSync(`unzip -oq "${zipPath}" -d "${APP_DIR}"`);
  }
  fs.unlinkSync(zipPath);

  if (isMac) {
    try {
      execSync(`xattr -rd com.apple.quarantine "${APP_PATH}"`, { stdio: 'ignore' });
    } catch {
      // xattr may fail if no quarantine attribute
    }
  }

  fs.writeFileSync(VERSION_FILE, JSON.stringify({ version, sha256, assetSha256: sha256 }));
  console.log('Done.');
}

function launch(args) {
  let child;
  if (isWin) {
    child = spawn(APP_PATH, args, {
      detached: true,
      stdio: 'ignore',
    });
  } else {
    child = spawn('open', [APP_PATH, '--args', ...args], {
      detached: true,
      stdio: 'ignore',
    });
  }
  child.unref();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Calder v${version} — Terminal-centric IDE for AI-powered CLI tools

Usage: calder [options]

Options:
  --update    Force re-download of the latest app build
  --version   Print version and exit
  --help      Show this help message

Any other arguments are forwarded to the Calder app.`);
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    const installed = getInstalledVersion();
    console.log(`calder v${version} (app: ${installed ? `v${installed}` : 'not installed'})`);
    return;
  }

  if (!isMac && !isWin) {
    console.error('The npm launcher currently supports macOS and Windows.');
    console.error(`For Linux, download from: ${RELEASES_URL}`);
    process.exit(1);
  }

  const assetName = getAssetName();
  const forceUpdate = args.includes('--update');
  const passthroughArgs = args.filter((a) => a !== '--update');

  const installedVersion = getInstalledVersion();
  const needsDownload = forceUpdate || installedVersion !== version || !fs.existsSync(APP_PATH);

  if (needsDownload) {
    const { tmpFile: zipPath, sha256: streamedSha256 } = await download(assetName);
    const verifiedSha256 = assertDownloadChecksum(assetName, zipPath);
    if (verifiedSha256 !== streamedSha256) {
      fs.rmSync(zipPath, { force: true });
      throw new Error('Download integrity check failed before extraction.');
    }
    extract(zipPath, verifiedSha256);
  }

  launch(passthroughArgs);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
