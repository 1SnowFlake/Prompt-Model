const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getDebuggerUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl;
      }
    } catch (e) {
      // retry
    }
    await sleep(500);
  }
  throw new Error('Could not find page target in Chrome');
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message));
        } else {
          resolve(msg.result);
        }
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    return this.send('Runtime.evaluate', { expression, awaitPromise: true });
  }
}

async function captureScreenshot(cdp, outputPath) {
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });

  const buffer = Buffer.from(result.data, 'base64');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Saved: ${outputPath} (${buffer.length} bytes)`);
}

async function main() {
  const tmpUserDataDir = path.join(process.cwd(), '.chrome-user-data');

  console.log('Launching Chrome...');
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${tmpUserDataDir}`,
      '--window-size=1440,900',
      '--hide-scrollbars',
      '--disable-gpu',
      '--no-sandbox',
    ],
    { stdio: 'ignore' }
  );

  try {
    const wsUrl = await getDebuggerUrl();
    console.log('Connected to debugger:', wsUrl);

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => (ws.onopen = resolve));

    const cdp = new CDPClient(ws);

    // Set viewport: 1440x900 at 2x resolution
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });

    const outDir = process.cwd();

    // ──────────────────────────────────────────────────────────
    // 1. FIGURE 5.2: Conversation History Page
    // ──────────────────────────────────────────────────────────
    console.log('Navigating to http://localhost:3000/history...');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/history' });
    await sleep(2500);

    // Remove Next.js dev badges if present
    await cdp.eval(`
      document.querySelectorAll('nextjs-portal, [data-nextjs-toast], [data-next-badge], [id*="next"]').forEach(el => {
        if (el.tagName.toLowerCase() === 'nextjs-portal' || el.hasAttribute('data-next-badge')) el.remove();
      });
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.head.appendChild(style);
    `);
    await sleep(500);

    const historyOut = path.join(outDir, 'figure_5_2_conversation_history.png');
    await captureScreenshot(cdp, historyOut);

    // ──────────────────────────────────────────────────────────
    // 2. FIGURE 5.3: Routed Response with Routing Engine Panel
    // ──────────────────────────────────────────────────────────
    console.log('Navigating to Chat with loaded conversation...');
    await cdp.send('Page.navigate', {
      url: 'http://localhost:3000/?load=396ebd48-8ff3-42a2-bfa4-4004c1241dcc',
    });
    await sleep(2500);

    // Scroll chat area to top so the prompt and assistant response header are visible
    await cdp.eval(`
      document.querySelectorAll('nextjs-portal, [data-nextjs-toast], [data-next-badge]').forEach(el => el.remove());
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.head.appendChild(style);

      // Scroll messages container to top
      const scrollable = document.querySelector('[class*="messagesArea"], .messages-area, [class*="chatContainer"]');
      if (scrollable) {
        scrollable.scrollTop = 0;
      }
      // Also ensure parent container is scrolled to top
      const allDivs = document.querySelectorAll('div');
      allDivs.forEach(d => {
        if (d.scrollHeight > d.clientHeight && d.classList.toString().includes('message')) {
          d.scrollTop = 0;
        }
      });
    `);
    await sleep(500);

    const chatOut = path.join(outDir, 'figure_5_3_routed_response.png');
    await captureScreenshot(cdp, chatOut);

    ws.close();
  } finally {
    console.log('Stopping Chrome...');
    chromeProcess.kill();
    try {
      if (fs.existsSync(tmpUserDataDir)) {
        fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
      }
    } catch (e) {}
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
