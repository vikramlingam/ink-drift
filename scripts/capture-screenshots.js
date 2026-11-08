import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SCREENSHOT_DIR = path.resolve('docs/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function startStaticServer(port = 4173) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm'
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(path.resolve('dist'), req.url.split('?')[0]);
    if (filePath.endsWith('/') || !path.extname(filePath)) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`[Server] Static server running on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    ws.addEventListener('message', (event) => {
      try {
        const text = typeof event.data === 'string' ? event.data : event.data.toString();
        const data = JSON.parse(text);
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(filename, buffer);
    console.log(`[Captured] ${path.basename(filename)} (${Math.round(buffer.length / 1024)} KB)`);
  }
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const port = 4173;
  const staticServer = await startStaticServer(port);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkdrift-cdp-'));
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--user-data-dir=${tmpDir}`,
    '--remote-debugging-port=9333',
    '--window-size=1440,900',
    '--enable-webgl',
    '--use-gl=angle',
    '--hide-scrollbars',
    'about:blank'
  ]);

  let cdpUrl = null;
  for (let i = 0; i < 30; i++) {
    await wait(300);
    try {
      const res = await fetch('http://127.0.0.1:9333/json/list');
      const list = await res.json();
      const pageTarget = list.find((t) => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        cdpUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // retry
    }
  }

  if (!cdpUrl) {
    console.error('Failed to connect to Chrome CDP.');
    chromeProc.kill();
    staticServer.close();
    process.exit(1);
  }

  console.log('[CDP] Connected to:', cdpUrl);
  const ws = new WebSocket(cdpUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));

  const client = new CDPClient(ws);
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  // Navigate to game
  console.log('[Navigating] Loading game...');
  await client.send('Page.navigate', { url: `http://127.0.0.1:${port}` });

  // Wait for countdown
  console.log('[Game] Waiting for countdown...');
  await wait(4500);

  // Accelerate car into turn for action shot
  console.log('[Game] Driving car for action shot...');
  await client.eval(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
  `);
  await wait(2200);

  // Drift into the corner
  await client.eval(`
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }));
  `);
  await wait(800);

  // 1. Capture Day Mode
  await client.captureScreenshot(path.join(SCREENSHOT_DIR, 'gameplay-day.png'));

  // Release keys
  await client.eval(`
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
  `);

  // 2. Switch to Night Mode
  console.log('[Theme] Toggling Night Mode...');
  await client.eval(`
    if (window.gameApp) {
      window.gameApp.toggleTheme();
    }
  `);
  await wait(1500);
  await client.captureScreenshot(path.join(SCREENSHOT_DIR, 'gameplay-night.png'));

  // Switch back to Day
  await client.eval(`
    if (window.gameApp) {
      window.gameApp.toggleTheme();
    }
  `);
  await wait(500);

  // 3. Open Garage
  console.log('[Garage] Opening customization garage...');
  await client.eval(`
    if (window.gameApp && window.gameApp.garageModal) {
      window.gameApp.garageModal.show();
    }
  `);
  await wait(1500);
  await client.captureScreenshot(path.join(SCREENSHOT_DIR, 'garage.png'));

  // Close Garage
  await client.eval(`
    if (window.gameApp && window.gameApp.garageModal) {
      window.gameApp.garageModal.hide();
    }
  `);
  await wait(500);

  // 4. Open Settings
  console.log('[Settings] Opening settings modal...');
  await client.eval(`
    if (window.gameApp && window.gameApp.settingsModal) {
      window.gameApp.settingsModal.show();
    }
  `);
  await wait(1500);
  await client.captureScreenshot(path.join(SCREENSHOT_DIR, 'settings.png'));

  // Close Settings
  await client.eval(`
    if (window.gameApp && window.gameApp.settingsModal) {
      window.gameApp.settingsModal.hide();
    }
  `);
  await wait(500);

  // 5. Victory celebration
  console.log('[Victory] Showing celebration podium...');
  await client.eval(`
    if (window.gameApp) {
      window.gameApp.raceManager.position = 1;
      window.gameApp.raceManager.totalTime = 84.82;
      window.gameApp.raceManager.bestLapTime = 27.14;
      window.gameApp.raceManager.lapTimes = [28.91, 28.77, 27.14];
      window.gameApp.showRecapCard();
    }
  `);
  await wait(1500);
  await client.captureScreenshot(path.join(SCREENSHOT_DIR, 'victory.png'));

  console.log('[Complete] All screenshots captured successfully!');

  // Cleanup
  ws.close();
  chromeProc.kill();
  staticServer.close();
  setTimeout(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }, 1000);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
