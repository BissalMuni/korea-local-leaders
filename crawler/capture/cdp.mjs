// headless Chrome를 CDP(WebSocket)로 제어해 임의 URL의 "화면을 뜨는" 저수준 래퍼.
//
// 왜 이렇게: 각 지자체 홈페이지는 구조가 제각각이고 메뉴가 JS로 렌더되며 iframe·팝업이
// 많아, 정적 HTML 파싱(BeautifulSoup)만으로는 슬로건·CI·인사말·공약 위치를 못 잡는다.
// 그래서 실제 브라우저로 렌더한 뒤 (1) 전체 페이지 PNG 와 (2) 렌더된 DOM 스냅샷을 떠서
// 뒤 단계(Claude 비전)가 눈으로 보고 목표 자료를 수집하게 한다.
//
// 추가 설치 없음: 설치된 Chrome/Edge + Node24 내장 WebSocket/fetch 만 사용(Playwright 불필요).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const DEBUG_PORT = Number(process.env.CDP_PORT ?? 9222);

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const hit = BROWSER_CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error('Chrome/Edge 실행파일을 찾지 못했습니다.');
  return hit;
}

// CDP 명령 1건을 보내고 응답을 기다리는 얇은 래퍼 + 이벤트 구독.
function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  const listeners = new Map(); // method -> Set<fn>
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  });
  // 각 명령에 타임아웃을 둔다. 페이지/렌더러가 멈추면 CDP 응답이 영영 안 와서
  // 전체 실행이 wedge 되므로, 일정 시간 지나면 reject 해 상위에서 스킵하게 한다.
  const send = (method, params = {}, timeoutMs = 30000) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      const timer = setTimeout(() => {
        if (pending.has(mid)) {
          pending.delete(mid);
          reject(new Error(`CDP timeout: ${method} (${timeoutMs}ms)`));
        }
      }, timeoutMs);
      pending.set(mid, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  send.on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
    return () => listeners.get(method)?.delete(fn);
  };
  return send;
}

async function waitForPageTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      const targets = await r.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* 아직 디버그 포트 안 열림 */
    }
    await sleep(200);
  }
  throw new Error('Chrome 디버그 타깃을 찾지 못했습니다.');
}

/**
 * 헤드리스 브라우저를 띄우고 CDP 세션(cdp 함수)과 종료 핸들을 돌려준다.
 * 여러 URL 을 한 세션에서 순차 캡처하도록 브라우저는 한 번만 띄운다.
 */
export async function launch({ width = 1440, height = 3000, scale = 1 } = {}) {
  const browser = findBrowser();
  const userDir = new URL('./.chrome-capture-profile', import.meta.url).pathname.replace(/^\//, '');
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      // 일부 지자체 사이트가 자동화 브라우저를 감지해 차단하므로 자동화 표식을 줄인다.
      '--disable-blink-features=AutomationControlled',
      '--disable-features=Translate,CalculateNativeWinOcclusion,AutomationControlled',
      `--user-data-dir=${userDir}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      `--window-size=${width},${height}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  child.on('error', (e) => console.error('[chrome]', e.message));

  const target = await waitForPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const cdp = makeClient(ws);
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  // 페이지 로드 전에 자동화 탐지 표식(navigator.webdriver)을 감춘다.
  await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });",
  }).catch(() => {});
  await cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });

  return {
    cdp,
    close() {
      try { ws.close(); } catch {}
      child.kill();
    },
  };
}

export { sleep };
