const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) {
    try { await browserInstance.pages(); return browserInstance; } catch {}
  }
  browserInstance = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--single-process', '--disable-extensions',
      '--disable-background-networking', '--no-first-run'
    ]
  });
  return browserInstance;
}

app.post('/api/check-bill', async (req, res) => {
  const { caNumber, provider } = req.body;
  if (!caNumber) return res.status(400).json({ success: false, error: 'CA number daalo' });

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Block images/css/fonts for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 900 });

    console.log('[Bot] Website khol raha hoon...');
    await page.goto('https://www.myvi.in/utilities/electricity-bill-payment', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });

    await page.waitForTimeout(3000);

    // Type provider name
    if (provider) {
      console.log('[Bot] Provider dhundh raha hoon:', provider);
      const typed = await page.evaluate((prov) => {
        const inputs = document.querySelectorAll('input');
        for (const inp of inputs) {
          if (inp.offsetParent !== null) {
            inp.value = prov;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      }, provider);
      console.log('[Bot] Provider typed:', typed);
      await page.waitForTimeout(2000);

      // Click provider in dropdown
      await page.evaluate((prov) => {
        const els = document.querySelectorAll('li, [class*="item"], [class*="option"], [class*="result"]');
        for (const el of els) {
          if (el.textContent.toLowerCase().includes(prov.toLowerCase().substring(0, 5))) {
            el.click(); return true;
          }
        }
        return false;
      }, provider);
      await page.waitForTimeout(1500);
    }

    // Enter CA number
    console.log('[Bot] CA number enter kar raha hoon:', caNumber);
    await page.evaluate((ca) => {
      const inputs = document.querySelectorAll('input');
      for (const inp of inputs) {
        if (inp.offsetParent !== null && ['text','number','tel'].includes(inp.type)) {
          inp.value = ca;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
    }, caNumber);
    await page.waitForTimeout(1000);

    // Click submit button
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button, [class*="btn"]');
      for (const btn of btns) {
        const txt = btn.textContent.toLowerCase();
        if (txt.includes('fetch') || txt.includes('proceed') || txt.includes('check') || txt.includes('get bill') || txt.includes('pay')) {
          btn.click(); return true;
        }
      }
    });

    await page.waitForTimeout(5000);

    // Take screenshot - enable images for screenshot
    await page.setRequestInterception(false);
    const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
    await page.close();

    return res.json({ success: true, screenshot: 'data:image/png;base64,' + screenshot });

  } catch (err) {
    console.error('[Bot] Error:', err.message);
    if (page) await page.close().catch(() => {});
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server chal raha hai: http://localhost:${PORT}`));
