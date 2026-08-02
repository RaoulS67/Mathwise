import { spawn } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(url, width, height) {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=.impeccable/tmp/chrome-audit',
    `--window-size=${width},${height}`, url
  ], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch {}
    await sleep(250);
  }
  if (!wsUrl) { chrome.kill('SIGKILL'); throw new Error('no target'); }
  await sleep(2000);
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const EXPR = `(() => {
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const overflows = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
    }).slice(0, 12).map(el => ({tag: el.tagName, cls: (el.className||'').toString().slice(0,60), right: Math.round(el.getBoundingClientRect().right)}));
    const links = [...document.querySelectorAll('a, button')].map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { text: (el.textContent||'').trim().slice(0,40), w: Math.round(r.width), h: Math.round(r.height), outline: cs.outlineStyle, outlineW: cs.outlineWidth };
    }).filter(x => x.w || x.h);
    const small = links.filter(l => l.w < 44 || l.h < 44);
    const imgs = [...document.images].map(i => ({src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, loading: i.loading, alt: i.alt}));
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.tagName + ': ' + h.textContent.trim().slice(0,50));
    const landmarks = {
      main: !!document.querySelector('main'),
      nav: !!document.querySelector('nav'),
      footer: !!document.querySelector('footer, .footer'),
      header: !!document.querySelector('header')
    };
    // contrast sample: hero sub
    function lum(hex) {
      const m = hex.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/) || [];
      let r,g,b;
      if (m.length) { r=+m[1]/255; g=+m[2]/255; b=+m[3]/255; }
      else {
        hex = hex.replace('#','');
        if (hex.length===3) hex=hex.split('').map(c=>c+c).join('');
        r=parseInt(hex.slice(0,2),16)/255; g=parseInt(hex.slice(2,4),16)/255; b=parseInt(hex.slice(4,6),16)/255;
      }
      const f=x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);
      return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
    }
    function ratio(fg,bg){ const L1=lum(fg),L2=lum(bg); const [a,b]=L1>L2?[L1,L2]:[L2,L1]; return (a+0.05)/(b+0.05); }
    function solidBg(el){
      let n=el; while(n && n!==document.documentElement){
        const bg=getComputedStyle(n).backgroundColor;
        if (bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent') return bg;
        n=n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    }
    const samples = [];
    for (const sel of ['.mw-hero-sub','.mw-hero-cta','.nav-links a','.mw-about-card-body','.tutor-bio','.mw-review-by','form .fine-print','form label','.footer']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      samples.push({sel, color: cs.color, bg: solidBg(el), ratio: +ratio(cs.color, solidBg(el)).toFixed(2), size: cs.fontSize});
    }
    return { overflowX: overflow, docW: document.documentElement.scrollWidth, viewW: window.innerWidth, overflows, smallTargets: small.slice(0,15), targetCount: links.length, smallCount: small.length, imgs: imgs.slice(0,12), headings, landmarks, samples };
  })()`;
  const out = await new Promise((resolve, reject) => {
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== 1) return;
      if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
      else resolve(msg.result.result.value);
    });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, returnByValue: true }}));
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
  ws.close(); chrome.kill('SIGKILL');
  await sleep(400);
  return out;
}

for (const [url,w,h,name] of [
  ['http://localhost:8000/index.html', 1440, 900, 'home-desktop'],
  ['http://localhost:8000/index.html', 420, 900, 'home-mobile'],
  ['http://localhost:8000/enrol.html', 1440, 900, 'enrol'],
  ['http://localhost:8000/pricing.html', 420, 900, 'pricing-mobile'],
]) {
  try {
    const { spawn: sp } = await import('node:child_process');
    // kill leftover
    try { sp('pkill', ['-f', 'user-data-dir=.impeccable/tmp/chrome-audit']); } catch {}
    await sleep(500);
    console.log('\\n===' + name + '===');
    console.log(JSON.stringify(await measure(url,w,h), null, 2));
  } catch (e) {
    console.log(name, 'ERR', e.message);
  }
}
