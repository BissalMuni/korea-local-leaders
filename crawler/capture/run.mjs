// 자치구 홈페이지(+인사말·공약 하위 페이지)를 떠서 스크린샷+스냅샷을 저장한다.
//
// 사용:
//   node crawler/capture/run.mjs 1101 1102        # 특정 code 만 (홈만)
//   node crawler/capture/run.mjs --limit 5         # 앞 5곳
//   node crawler/capture/run.mjs --all             # 227곳 전수
//   node crawler/capture/run.mjs --missing         # 사진 큐레이션이 아직 없는 곳만
//   node crawler/capture/run.mjs 1102 --sub        # 홈 + 인사말·공약 하위 페이지까지
//
// 산출물: crawler/captures/<code>/home.jpg|home.json (+ --sub 시 greeting.jpg, pledge.jpg)
//         crawler/captures/index.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { capturePage } from './snapshot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CRAWLER = join(HERE, '..');
const OUT = join(CRAWLER, 'captures');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));

function selectCodes(args, homepages, photos) {
  const codes = Object.keys(homepages);
  if (args.includes('--all')) return codes;
  if (args.includes('--missing')) return codes.filter((c) => !photos[c]);
  const limIdx = args.indexOf('--limit');
  if (limIdx >= 0) return codes.slice(0, Number(args[limIdx + 1]) || 5);
  const explicit = args.filter((a) => /^\d{3,4}$/.test(a));
  return explicit.length ? explicit : codes.slice(0, 3);
}

// 힌트 링크 중 "진짜 그 페이지"에 가장 가까운 것을 고른다.
// prefer: 텍스트에 있으면 가점(앞일수록 강함). neg: 있으면 큰 감점(게시판·신문고 등
// 엉뚱한 페이지 배제). hrefEnds: href 가 그 조각으로 끝/포함이면 가점(예: /chief/ 루트).
// 힌트를 점수순으로 정렬해 상위 n개(중복 href 제거)를 돌려준다.
function rankHints(hints, { prefer = [], neg = [], hrefHints = [] } = {}, n = 1) {
  if (!hints?.length) return [];
  const scored = hints.map((h) => {
    const t = (h.text || '').toLowerCase();
    const href = (h.href || '').toLowerCase();
    let s = 0;
    prefer.forEach((kw, i) => { if (t.includes(kw)) s += (prefer.length - i) + 2; });
    hrefHints.forEach((kw) => { if (href.includes(kw)) s += 2; });
    neg.forEach((kw) => { if (t.includes(kw) || href.includes(kw)) s -= 8; });
    return { h, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const out = [];
  const seen = new Set();
  for (const { h, s } of scored) {
    if (s <= -8) break;
    if (seen.has(h.href)) continue;
    seen.add(h.href);
    out.push(h);
    if (out.length >= n) break;
  }
  // 아무것도 점수 못 얻으면 첫 후보라도 하나.
  if (!out.length && hints[0]) out.push(hints[0]);
  return out;
}
const chooseHint = (hints, opts) => rankHints(hints, opts, 1)[0] ?? null;

async function captureCode(cdp, code, entry, wantSub) {
  const dir = join(OUT, code);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const home = await capturePage(cdp, entry.homepage);
  const record = {
    code, name: entry.name, homepage: entry.homepage,
    ok: home.ok, error: home.error ?? null,
    shots: {}, snapshot: home.snapshot,
  };
  if (home.ok) {
    writeFileSync(join(dir, 'home.jpg'), home.image);
    record.shots.home = { file: 'home.jpg', w: home.width, h: home.height };
  }

  if (wantSub && home.ok) {
    const greeting = chooseHint(home.snapshot.hinted?.greeting, {
      prefer: ['인사말', '구청장실', '시장실', '군수실', '도지사실', '구청장의', '시장의', '군수의'],
      neg: ['바란다', '게시판', '신문고', '제안', '참여', '민원', '자유', '뉴스', '공지', '약속', '채용', '일정'],
      hrefHints: ['/chief', '/mayor', '/governor', 'greeting', 'insa'],
    });
    // 공약은 죽은/엉뚱한 페이지(유튜브·PDF·404·매니페스토 개념)가 잦아 상위 2후보를 뜬다.
    const pledges = rankHints(home.snapshot.hinted?.pledge, {
      prefer: ['공약', '민선', '시정목표', '구정목표', '군정목표', '4대', '핵심', '비전', '정책', '목표'],
      neg: ['게시판', '뉴스', '공지', '채용', '실명제', '청소년', '문의', '.pdf', 'youtu', '동영상'],
      hrefHints: ['vision', 'pledge', 'policy', 'gongyak'],
    }, 2);
    const jobs = [['greeting', greeting]];
    pledges.forEach((h, i) => jobs.push([i === 0 ? 'pledge' : 'pledge2', h]));
    for (const [key, hint] of jobs) {
      if (!hint?.href) continue;
      const sub = await capturePage(cdp, hint.href, { settle: 2500 });
      record[`${key}Url`] = hint.href;
      if (sub.ok) {
        writeFileSync(join(dir, `${key}.jpg`), sub.image);
        record.shots[key] = { file: `${key}.jpg`, w: sub.width, h: sub.height, url: hint.href };
        record[`${key}Snapshot`] = { contentImages: sub.snapshot.contentImages, ciImages: sub.snapshot.ciImages };
      }
    }
  }

  writeFileSync(join(dir, 'home.json'), JSON.stringify(record, null, 2));
  return record;
}

async function main() {
  const args = process.argv.slice(2);
  const wantSub = args.includes('--sub');
  const homepages = readJson(join(CRAWLER, 'basic_homepages.json')).homepages;
  const photos = readJson(join(CRAWLER, 'basic_photos.json')).photos;
  const codes = selectCodes(args, homepages, photos);

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const skipDone = args.includes('--skip-done');
  // 장시간 실행(227곳)에서 Chrome 메모리 누수·상태 오염을 막으려 N곳마다 브라우저를 재시작.
  const RECYCLE = 40;
  console.log(`캡처 대상 ${codes.length}곳${wantSub ? ' (+인사말·공약)' : ''}${skipDone ? ' (완료분 건너뜀)' : ''}`);

  const index = [];
  let sess = await launch();
  let sinceLaunch = 0;
  try {
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      const entry = homepages[code];
      if (!entry?.homepage) { console.warn(`  [skip] ${code} 홈페이지 없음`); continue; }
      if (skipDone && existsSync(join(OUT, code, 'home.jpg'))) {
        index.push({ code, name: entry.name, ok: true, dir: `captures/${code}` });
        continue;
      }
      if (sinceLaunch >= RECYCLE) {
        sess.close();
        await sleep(1500);
        sess = await launch();
        sinceLaunch = 0;
      }
      process.stdout.write(`  [${i + 1}/${codes.length}] ${code} ${entry.name}  ${entry.homepage} ... `);
      let rec;
      try {
        rec = await captureCode(sess.cdp, code, entry, wantSub);
      } catch (err) {
        // 브라우저 세션이 죽었으면 재기동 후 1회 재시도.
        console.log(`오류(${String(err?.message ?? err)}) → 세션 재기동 후 재시도`);
        try { sess.close(); } catch {}
        await sleep(1500);
        sess = await launch();
        sinceLaunch = 0;
        rec = await captureCode(sess.cdp, code, entry, wantSub).catch((e) => ({ ok: false, error: String(e?.message ?? e), snapshot: {} }));
      }
      sinceLaunch++;
      const subInfo = wantSub ? ` sub[${Object.keys(rec.shots ?? {}).filter((k) => k !== 'home').join(',') || '-'}]` : '';
      console.log(rec.ok ? `ok (menu ${rec.snapshot?.menu?.length ?? 0})${subInfo}` : `실패: ${rec.error}`);
      index.push({ code, name: entry.name, ok: rec.ok, dir: `captures/${code}` });
    }
  } finally {
    sess.close();
  }

  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ capturedAt: new Date().toISOString(), items: index }, null, 2));
  const good = index.filter((x) => x.ok).length;
  console.log(`\n완료: ${good}/${index.length} 성공 → crawler/captures/`);
}

main().catch((e) => { console.error('캡처 실행 실패:', e); process.exit(1); });
