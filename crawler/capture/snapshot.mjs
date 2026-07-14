// 렌더된 한 페이지에서 (1) 전체 화면 PNG 와 (2) 목표 자료 탐색용 DOM 스냅샷을 뜬다.
//
// 스냅샷은 뒤 단계(Claude 비전)가 "어디에 무엇이 있는지" 판단하도록 돕는 구조 정보다:
//  - og/타이틀 : 슬로건 후보
//  - menu      : 상단/좌측 내비게이션의 목차(라벨 트리)  ← "목차구조 파악"
//  - hinted    : 인사말/공약/CI 로 보이는 링크(href)     ← 하위 페이지로 이동해 사진·공약 수집
//  - ciImages  : 헤더의 로고성 이미지(절대 URL)          ← CI 후보
import { sleep } from './cdp.mjs';

// 페이지 안에서 실행돼 구조를 JSON 으로 걷어오는 스크립트(문자열로 주입).
// 브라우저 컨텍스트라 DOM API 만 쓴다. 힌트 키워드는 홈페이지 구조 편차를 흡수한다.
const SNAPSHOT_FN = `(() => {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();

  const GREETING = ['인사말','구청장','시장','군수','도지사','청장','greeting','mayor','governor','인사'];
  const PLEDGE   = ['공약','민선','시정목표','구정목표','군정목표','정책','비전','pledge','vision'];
  const CI       = ['상징','심볼','symbol','ci','로고','logo','엠블럼','emblem','브랜드','brand','bi'];

  // 내비게이션(목차) 라벨 트리 — header/nav 안의 링크 텍스트를 순서대로.
  const navRoots = [...document.querySelectorAll('header nav, nav, header ul, .gnb, #gnb, .lnb, #lnb, [role=navigation]')];
  const menuSeen = new Set();
  const menu = [];
  for (const root of navRoots) {
    for (const a of root.querySelectorAll('a')) {
      const t = clean(a.textContent);
      const href = abs(a.getAttribute('href'));
      if (!t || t.length > 24) continue;
      const key = t + '|' + href;
      if (menuSeen.has(key)) continue;
      menuSeen.add(key);
      menu.push({ text: t, href });
      if (menu.length >= 250) break;
    }
    if (menu.length >= 250) break;
  }

  // 힌트별 링크 후보 — 텍스트 또는 href 에 키워드가 있으면 채택.
  const hinted = { greeting: [], pledge: [], ci: [] };
  const hintSeen = { greeting: new Set(), pledge: new Set(), ci: new Set() };
  const pushHint = (bucket, text, href) => {
    if (!href || hintSeen[bucket].has(href)) return;
    if (href.startsWith('javascript') || href.startsWith('mailto')) return;
    // 기사·게시물 상세(mode=view / &cid= / bbs)는 목차 링크가 아니라 뉴스 노이즈다.
    if (/mode=view|[?&]cid=|bbs|board|articleview/i.test(href)) return;
    // 메뉴형 링크는 짧다. 긴 텍스트(기사 본문이 링크에 딸려온 경우)는 버린다.
    if (clean(text).length > 22) return;
    hintSeen[bucket].add(href);
    hinted[bucket].push({ text: clean(text), href });
  };
  for (const a of document.querySelectorAll('a[href]')) {
    const t = clean(a.textContent).toLowerCase();
    const href = abs(a.getAttribute('href'));
    const h = (href || '').toLowerCase();
    const hay = t + ' ' + h;
    if (GREETING.some((k) => hay.includes(k.toLowerCase()))) pushHint('greeting', a.textContent, href);
    if (PLEDGE.some((k) => hay.includes(k.toLowerCase())))   pushHint('pledge', a.textContent, href);
    if (CI.some((k) => hay.includes(k.toLowerCase())))       pushHint('ci', a.textContent, href);
  }
  for (const k of Object.keys(hinted)) hinted[k] = hinted[k].slice(0, 12);

  // 헤더 로고성 이미지(CI 후보).
  const header = document.querySelector('header, #header, .header, .top, #top');
  const ciImages = [];
  const ciSeen = new Set();
  const scanImgs = (scope) => {
    if (!scope) return;
    for (const img of scope.querySelectorAll('img')) {
      const src = abs(img.getAttribute('src') || img.getAttribute('data-src'));
      if (!src || ciSeen.has(src)) continue;
      ciSeen.add(src);
      ciImages.push({ src, alt: clean(img.getAttribute('alt')), w: img.naturalWidth, h: img.naturalHeight });
      if (ciImages.length >= 8) break;
    }
  };
  scanImgs(header);
  // 헤더에서 못 찾았으면 문서 전체에서 로고 힌트(src/alt) 이미지를, 그래도 없으면 og:image 를 CI 후보로.
  const CIH = ['logo', 'symbol', 'ci_', '/ci', 'bi_', 'emblem', 'symbolmark', '로고', '심볼'];
  if (ciImages.length < 3) {
    for (const img of document.querySelectorAll('img')) {
      const src = abs(img.getAttribute('src') || img.getAttribute('data-src'));
      if (!src || ciSeen.has(src)) continue;
      const hay = (src + ' ' + (img.getAttribute('alt') || '') + ' ' + (img.className || '')).toLowerCase();
      if (!CIH.some((k) => hay.includes(k))) continue;
      ciSeen.add(src);
      ciImages.push({ src, alt: clean(img.getAttribute('alt')), w: img.naturalWidth, h: img.naturalHeight });
      if (ciImages.length >= 8) break;
    }
  }
  const ogImg = (() => { const m = document.querySelector('meta[property="og:image"]'); return m ? abs(m.getAttribute('content')) : null; })();
  if (ogImg && !ciSeen.has(ogImg)) ciImages.push({ src: ogImg, alt: 'og:image', w: 0, h: 0 });

  // 본문의 큰 이미지(초상·비주얼 후보) — 인사말 페이지에서 기관장 사진 URL 을 잡는다.
  // 화면엔 사진이 보여도 URL 은 DOM 에만 있으므로, 면적 큰 순으로 후보를 담아 뒤에서 고른다.
  const contentImages = [];
  const seenC = new Set();
  const addCand = (src, alt, w, h, top) => {
    const a = abs(src);
    if (!a || seenC.has(a)) return;
    seenC.add(a);
    contentImages.push({ src: a, alt: clean(alt), w: w || 0, h: h || 0, top: Math.round(top || 0), area: (w || 200) * (h || 200) });
  };
  for (const img of document.querySelectorAll('img')) {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
    if (!src) continue;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    // 실측 크기를 알면 아이콘 배제, 지연로딩으로 0 이면 렌더 박스 크기로 대체 판단.
    const r = img.getBoundingClientRect();
    const bw = w || Math.round(r.width);
    const bh = h || Math.round(r.height);
    if (bw < 140 || bh < 140) continue;
    addCand(src, img.getAttribute('alt'), bw, bh, r.top);
  }
  // CSS background-image 로 깐 큰 비주얼(히어로·초상)도 후보로. url(...) 추출.
  for (const el of document.querySelectorAll('[style*="background"], .visual, .hero, [class*="visual"], [class*="mayor"], [class*="greeting"], [class*="portrait"]')) {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\\(\\s*['"]?([^'")]+)['"]?\\s*\\)/);
    if (!m || !m[1] || m[1].startsWith('data:')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 160) continue;
    addCand(m[1], el.getAttribute('aria-label') || el.className || '', Math.round(r.width), Math.round(r.height), r.top);
  }
  contentImages.sort((a, b) => b.area - a.area);
  const topImages = contentImages.slice(0, 12).map(({ area, ...x }) => x);

  const meta = (sel) => { const m = document.querySelector(sel); return m ? clean(m.getAttribute('content')) : null; };

  return {
    finalUrl: location.href,
    title: clean(document.title),
    og: {
      title: meta('meta[property="og:title"]'),
      description: meta('meta[property="og:description"]') || meta('meta[name="description"]'),
      image: (() => { const v = meta('meta[property="og:image"]'); return v ? abs(v) : null; })(),
    },
    menu,
    hinted,
    ciImages,
    contentImages: topImages,
    scrollHeight: document.documentElement.scrollHeight,
  };
})()`;

// 화면 캡처가 지나치게 길어지는 것을 막는 상한(px). 대부분 홈페이지는 이 안에 든다.
const MAX_SHOT_HEIGHT = 7000;

// 홈 앞에 뜨는 인트로/스플래시(캠페인·고향사랑기부 등) 페이지면 '들어가기' 링크를 찾아 돌려준다.
// 인트로는 링크가 적고 '들어가기/메인 바로가기/입장/skip' 같은 진입 링크가 있다.
const INTRO_FN = `(() => {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const anchors = [...document.querySelectorAll('a[href]')];
  const ENTER = ['들어가기','메인 바로가기','바로가기','홈페이지 바로가기','메인으로','메인 홈','입장','인트로 건너뛰기','skip','enter','main site','본문 바로가기'];
  const looksIntro = /intro|splash|main_intro|index_intro/i.test(location.href) || /인트로|인트로 화면|메인 인트로/.test(document.title || '');
  let enter = null;
  for (const a of anchors) {
    const t = (a.textContent || '').trim().toLowerCase();
    const h = (a.getAttribute('href') || '').toLowerCase();
    if (h.startsWith('#') || h.startsWith('javascript')) continue;
    if (ENTER.some((k) => t.includes(k.toLowerCase()) || h.includes(k.toLowerCase()))) { enter = abs(a.getAttribute('href')); break; }
    // intro.* → main.*/index.* 로 가는 링크
    if (/intro/i.test(location.href) && /(main|index|portal|www)\b/i.test(h) && !/intro/i.test(h)) { enter = abs(a.getAttribute('href')); break; }
  }
  // 링크가 매우 적은데 진입 링크가 있으면 인트로로 본다.
  let isIntro = enter && (looksIntro || anchors.length <= 25);
  let target = isIntro ? enter : null;

  // frameset/iframe 포털: 최상위 문서에 내비가 거의 없고, 본문이 큰 동일출처
  // iframe 안에 있으면(고양·아산·김천 같은 구형 포털) 그 프레임 URL 로 직접 이동한다.
  if (!target) {
    let best = null, bestArea = 0;
    for (const f of document.querySelectorAll('iframe, frame')) {
      const src = abs(f.getAttribute('src') || '');
      if (!src || !/^https?:/i.test(src)) continue;
      try { if (new URL(src).host !== location.host) continue; } catch { continue; }
      const r = f.getBoundingClientRect();
      const area = (r.width || f.offsetWidth || 0) * (r.height || f.offsetHeight || 0);
      if (area > bestArea) { bestArea = area; best = src; }
    }
    // 최상위에 진짜 메뉴(nav 링크)가 없고 큰 콘텐츠 프레임이 있으면 그 프레임으로.
    const navCount = document.querySelectorAll('header a, nav a, .gnb a, #gnb a, [role=navigation] a').length;
    if (best && bestArea > 150000 && navCount < 5) target = best;
  }
  return { isIntro: !!target, enter: target };
})()`;

/**
 * 한 URL 로 이동해 렌더한 뒤, 전체 PNG 버퍼와 DOM 스냅샷을 돌려준다.
 * 실패해도 던지지 않고 {ok:false, error} 로 표시한다(전수 실행 중 한 곳 실패로 멈추지 않게).
 */
export async function capturePage(cdp, url, { settle = Number(process.env.CAPTURE_SETTLE) || 3500 } = {}) {
  try {
    // 로드 완료 이벤트를 기다리되, 지나치게 오래 걸리면 settle 후 진행.
    const loaded = new Promise((res) => {
      const off = cdp.on('Page.loadEventFired', () => { off(); res(); });
    });
    await cdp('Page.navigate', { url });
    await Promise.race([loaded, sleep(8000)]);
    await sleep(settle); // 지연 렌더(배너·슬라이더·JS 메뉴) 안정화

    // 인트로/스플래시면 '들어가기'로 한 번 더 이동해 실제 홈을 뜬다.
    try {
      const intro = await cdp('Runtime.evaluate', { expression: INTRO_FN, returnByValue: true }, 10000);
      const enter = intro.result?.value?.enter;
      if (enter && enter !== url) {
        const loaded2 = new Promise((res) => { const off = cdp.on('Page.loadEventFired', () => { off(); res(); }); });
        await cdp('Page.navigate', { url: enter });
        await Promise.race([loaded2, sleep(8000)]);
        await sleep(settle);
      }
    } catch { /* 인트로 판별 실패는 무시하고 현재 페이지로 진행 */ }

    const snap = await cdp('Runtime.evaluate', { expression: SNAPSHOT_FN, returnByValue: true });
    const snapshot = snap.result?.value ?? { error: '스냅샷 evaluate 실패', finalUrl: url };

    const metrics = await cdp('Page.getLayoutMetrics');
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const width = Math.min(Math.ceil(size.width) || 1440, 1440);
    const height = Math.min(Math.ceil(size.height) || 2000, MAX_SHOT_HEIGHT);

    const shot = await cdp('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 80,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return { ok: true, snapshot, image: Buffer.from(shot.data, 'base64'), width, height };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err), snapshot: { finalUrl: url } };
  }
}
