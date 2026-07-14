// CI·슬로건 전용 페이지를 떠서 CI(심볼마크) 이미지·다운로드 링크·슬로건을 추출한다.
//
// CI 는 대문이 아니라 '구소개 > CI·슬로건/상징물' 전용 페이지에 있으므로,
// find_ci_pages.py 가 찾은 code->url(_ci_targets.json)을 읽어 각 페이지를 캡처하고,
// 목적이 명확한 페이지 특성상 휴리스틱(alt/파일명/다운로드 링크)으로 CI 를 뽑는다.
//
// 산출물: captures/<code>/ci.jpg, captures/<code>/ci.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAPTURES = join(HERE, '..', 'captures');
const TARGETS = join(HERE, '_ci_targets.json');

// 페이지 안에서 CI 심볼·다운로드·슬로건 후보를 걷어오는 스크립트(브라우저 컨텍스트).
const CI_EXTRACT_FN = `(() => {
  const abs=(u)=>{try{return new URL(u,location.href).href}catch{return null}};
  const clean=(s)=>(s||'').replace(/\\s+/g,' ').trim();
  const CI_POS=['ci','심벌','심볼','상징','마크','엠블','emblem','symbol','bi'];
  const NEG=['gnb_visual','/ico','icon','kakao','share','qr','_acc','home','banner','btn','facebook','insta','youtube','blog','twitter','naver',
    // 웹접근성·정부 인증 배지 등(성북 오탐 방지)
    'web','접근성','accessibility','인증','품질','정부','대한민국','과학기술','wa_','_wa','award','mark_g','footer'];

  const imgs=[...document.querySelectorAll('img')].map(i=>{
    const src=abs(i.getAttribute('src')||i.getAttribute('data-src'));
    return src?{src,alt:clean(i.getAttribute('alt')),w:i.naturalWidth||i.width||0,h:i.naturalHeight||i.height||0}:null;
  }).filter(Boolean);

  const scoreImg=(im)=>{
    const hay=(im.src+' '+im.alt).toLowerCase();
    if(NEG.some(k=>hay.includes(k))) return -100;
    let s=0;
    CI_POS.forEach(k=>{ if(im.alt.toLowerCase().includes(k)) s+=6; if(im.src.toLowerCase().includes(k)) s+=3; });
    if(im.w>=80&&im.h>=50) s+=2;
    if(/슬로건|slogan/.test(im.alt.toLowerCase())) s-=5; // 슬로건 이미지는 따로
    return s;
  };
  const ciCands=imgs.map(im=>({im,s:scoreImg(im)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
  const sloganImg=imgs.find(im=>/슬로건|slogan/.test((im.alt+' '+im.src).toLowerCase()));

  // 다운로드 링크(zip/png/ai/eps 또는 '다운로드' 텍스트)
  const dl=[...document.querySelectorAll('a[href]')].map(a=>({t:clean(a.textContent).slice(0,24),h:abs(a.getAttribute('href'))}))
    .filter(x=>x.h && /\\.(zip|png|ai|eps)(\\?|$)/i.test(x.h) || (x.t.includes('다운로드')&&x.h))
    .filter(x=>x.h);

  return {
    title: document.title,
    ciImage: ciCands[0]?.im?.src || null,
    ciAlt: ciCands[0]?.im?.alt || null,
    ciCandidates: ciCands.slice(0,4).map(x=>({src:x.im.src,alt:x.im.alt,w:x.im.w,h:x.im.h})),
    sloganImage: sloganImg?.src || null,
    downloads: dl.slice(0,10),
  };
})()`;

async function main() {
  const targets = JSON.parse(readFileSync(TARGETS, 'utf-8'));
  const codes = process.argv.slice(2).filter((a) => /^\d{3,4}$/.test(a));
  const list = (codes.length ? codes : Object.keys(targets)).filter((c) => targets[c]);
  console.log(`CI 페이지 캡처 대상 ${list.length}곳`);

  const { cdp, close } = await launch();
  let ok = 0;
  try {
    for (let i = 0; i < list.length; i++) {
      const code = list[i];
      const url = targets[code];
      const dir = join(CAPTURES, code);
      if (!existsSync(dir)) continue;
      process.stdout.write(`  [${i + 1}/${list.length}] ${code} ${url} ... `);
      try {
        const loaded = new Promise((r) => { const off = cdp.on('Page.loadEventFired', () => { off(); r(); }); });
        await cdp('Page.navigate', { url });
        await Promise.race([loaded, sleep(8000)]);
        await sleep(3500);
        const res = await cdp('Runtime.evaluate', { expression: CI_EXTRACT_FN, returnByValue: true }, 15000);
        const data = res.result?.value ?? {};
        const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80, captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1440, height: 4500, scale: 1 } });
        writeFileSync(join(dir, 'ci.jpg'), Buffer.from(shot.data, 'base64'));
        writeFileSync(join(dir, 'ci.json'), JSON.stringify({ code, url, ...data }, null, 2));
        ok++;
        console.log(data.ciImage ? `CI ✓ (${(data.ciAlt || '').slice(0, 16)})` : '이미지 후보 없음');
      } catch (err) {
        console.log(`실패: ${String(err?.message ?? err)}`);
      }
    }
  } finally { close(); }
  console.log(`\n완료: ${ok}/${list.length} 캡처 → captures/<code>/ci.json`);
}

main().catch((e) => { console.error('CI 캡처 실패:', e); process.exit(1); });
