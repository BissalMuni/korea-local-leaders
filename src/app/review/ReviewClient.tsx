"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { partyBadgeClass } from "@/lib/parties";

export type FieldKey = "homepage" | "photoUrl" | "slogan" | "ci" | "pledges";
type Flag = "up" | "down";

export interface ReviewRow {
  code: string;
  name: string;
  type: "metropolitan" | "basic";
  title: string;
  provinceCode: string | null;
  provinceName: string | null;
  personName: string | null;
  party: string | null;
  manualOverride: boolean;
  values: {
    homepage: string | null;
    photoUrl: string | null;
    slogan: string | null;
    ci: string | null;
    pledges: string[] | null;
  };
  sources: Record<FieldKey, string | null>;
}

type Kind = "url" | "image" | "text" | "list";
const FIELDS: { key: FieldKey; label: string; kind: Kind }[] = [
  { key: "homepage", label: "홈페이지", kind: "url" },
  { key: "photoUrl", label: "기관장 이미지", kind: "image" },
  { key: "slogan", label: "슬로건", kind: "text" },
  { key: "ci", label: "CI(심볼마크)", kind: "image" },
  { key: "pledges", label: "주요공약", kind: "list" },
];

const FLAG_KEY = "localcity-review-flags";
const sk = (code: string, field: FieldKey) => `${code}|${field}`;
type Filter = "all" | "unflagged" | "down" | "up";

export default function ReviewClient({
  rows,
  updatedAt,
}: {
  rows: ReviewRow[];
  updatedAt: string;
}) {
  const rowByCode = useMemo(() => {
    const m = new Map<string, ReviewRow>();
    rows.forEach((r) => m.set(r.code, r));
    return m;
  }, [rows]);

  // 순차 검수용 평탄 시퀀스: 기관 × 5필드
  const seq = useMemo(
    () => rows.flatMap((r) => FIELDS.map((f) => ({ code: r.code, field: f.key }))),
    [rows],
  );

  const provinces = useMemo(
    () => rows.filter((r) => r.type === "metropolitan"),
    [rows],
  );
  const basicsByProv = useMemo(() => {
    const m = new Map<string, ReviewRow[]>();
    rows
      .filter((r) => r.type === "basic")
      .forEach((r) => {
        const k = r.provinceCode ?? "";
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r);
      });
    return m;
  }, [rows]);

  const [cur, setCur] = useState(0);
  const [skipEmpty, setSkipEmpty] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [layout, setLayout] = useState<"h" | "v">("h");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<Record<string, Flag>>({});

  // localStorage 로 좋아요/싫어요 플래그 유지
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FLAG_KEY);
      if (raw) setFlags(JSON.parse(raw) as Record<string, Flag>);
    } catch {
      /* noop */
    }
  }, []);
  const persist = useCallback((next: Record<string, Flag>) => {
    setFlags(next);
    try {
      localStorage.setItem(FLAG_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }, []);

  const current = seq[cur];
  const row = rowByCode.get(current.code)!;
  const field = FIELDS.find((f) => f.key === current.field)!;
  const value = row.values[field.key];
  const source = row.sources[field.key];
  const curFlag = flags[sk(current.code, current.field)];

  const hasVal = useCallback(
    (i: number) => {
      const s = seq[i];
      const r = rowByCode.get(s.code)!;
      const v = r.values[s.field];
      return Array.isArray(v) ? v.length > 0 : Boolean(v);
    },
    [seq, rowByCode],
  );
  const matchFilter = useCallback(
    (i: number) => {
      if (filter === "all") return true;
      const f = flags[sk(seq[i].code, seq[i].field)];
      if (filter === "unflagged") return !f;
      return f === filter;
    },
    [filter, flags, seq],
  );
  const passes = useCallback(
    (i: number) => (!skipEmpty || hasVal(i)) && matchFilter(i),
    [skipEmpty, hasVal, matchFilter],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      setCur((c) => {
        let i = c + dir;
        while (i >= 0 && i < seq.length && !passes(i)) i += dir;
        return i >= 0 && i < seq.length ? i : c;
      });
    },
    [seq.length, passes],
  );

  const gotoField = (code: string, fkey: FieldKey) => {
    const idx = seq.findIndex((s) => s.code === code && s.field === fkey);
    if (idx >= 0) setCur(idx);
  };
  const gotoInstitution = (code: string) => gotoField(code, "homepage");

  const setFlag = useCallback(
    (kind: Flag) => {
      const key = sk(current.code, current.field);
      const next = { ...flags };
      if (next[key] === kind) delete next[key];
      else next[key] = kind;
      persist(next);
      if (autoNext && next[key]) step(1);
    },
    [current, flags, persist, autoNext, step],
  );

  const toggleProv = (code: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  // 기초가 있는 광역 코드들 + 전체 펼치기/접기
  const provWithKids = useMemo(
    () =>
      provinces
        .filter((p) => (basicsByProv.get(p.code)?.length ?? 0) > 0)
        .map((p) => p.code),
    [provinces, basicsByProv],
  );
  const expandAll = () => setExpanded(new Set(provWithKids));
  const collapseAll = () => setExpanded(new Set());

  // 처음 진입 시 모든 광역을 펼쳐 기초가 바로 보이게 한다
  useEffect(() => {
    setExpanded(new Set(provWithKids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 키보드: ← → 이동, ↑ 좋아요 · ↓ 싫어요
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFlag("up"); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setFlag("down"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, setFlag]);

  // 현재 항목이 접힌 광역 아래면 자동 펼침
  useEffect(() => {
    if (row.type === "basic" && row.provinceCode) {
      setExpanded((prev) =>
        prev.has(row.provinceCode!) ? prev : new Set(prev).add(row.provinceCode!),
      );
    }
  }, [row]);

  const counts = useMemo(() => {
    let up = 0, down = 0;
    for (const v of Object.values(flags)) v === "up" ? up++ : down++;
    return { up, down };
  }, [flags]);

  // 기관별 싫어요 개수(트리 배지)
  const downByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const [key, f] of Object.entries(flags)) {
      if (f !== "down") continue;
      const code = key.split("|")[0];
      m.set(code, (m.get(code) ?? 0) + 1);
    }
    return m;
  }, [flags]);

  const jumpFirst = (f: Filter) => {
    setFilter(f);
    const idx = seq.findIndex((_, i) => {
      const fl = flags[sk(seq[i].code, seq[i].field)];
      if (f === "all") return true;
      if (f === "unflagged") return !fl;
      return fl === f;
    });
    if (idx >= 0) setCur(idx);
  };

  const exportDown = () => {
    const items = seq
      .map((s) => ({ s, f: flags[sk(s.code, s.field)] }))
      .filter((x) => x.f === "down")
      .map(({ s }) => {
        const r = rowByCode.get(s.code)!;
        const v = r.values[s.field];
        return {
          code: r.code,
          name: r.name,
          type: r.type,
          title: r.title,
          field: s.field,
          value: v ?? null,
          source: r.sources[s.field],
        };
      });
    const payload = { count: items.length, items };
    const text = JSON.stringify(payload, null, 2);
    // 다운로드
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review_dislikes.json";
    a.click();
    URL.revokeObjectURL(url);
    // 클립보드 복사(가능하면)
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const totalFlagged = counts.up + counts.down;

  return (
    <div className="flex h-screen flex-col">
      {/* 상단 바 */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-950">
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← 로컬시티
        </Link>
        <h1 className="text-sm font-bold">데이터 검수</h1>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {cur + 1} / {seq.length} · 👍 {counts.up} · 👎 {counts.down} · 남음{" "}
          {seq.length - totalFlagged}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <select
            value={filter}
            onChange={(e) => jumpFirst(e.target.value as Filter)}
            className="rounded border border-gray-300 bg-white px-1.5 py-0.5 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="all">전체 보기</option>
            <option value="unflagged">미표시만</option>
            <option value="down">👎 싫어요만</option>
            <option value="up">👍 좋아요만</option>
          </select>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
            빈 값 건너뛰기
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
            표시 후 자동 다음
          </label>
          <button
            onClick={() => setLayout((l) => (l === "h" ? "v" : "h"))}
            className="rounded border border-gray-300 px-2 py-0.5 dark:border-gray-700"
          >
            {layout === "h" ? "가로 분할" : "세로 분할"}
          </button>
          <button
            onClick={exportDown}
            disabled={counts.down === 0}
            className="rounded bg-red-600 px-2 py-0.5 font-medium text-white disabled:opacity-40"
          >
            👎 {counts.down}개 내보내기
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 트리 네비게이션 */}
        <nav className="flex w-72 flex-none flex-col overflow-hidden border-r border-gray-200 bg-gray-50 text-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800">
            <span className="font-semibold text-gray-500">지자체 목록</span>
            <button
              onClick={expandAll}
              className="ml-auto rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              전체 펼치기
            </button>
            <button
              onClick={collapseAll}
              className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              전체 접기
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {provinces.map((p) => {
              const kids = basicsByProv.get(p.code) ?? [];
              const open = expanded.has(p.code);
              const pDown = downByCode.get(p.code) ?? 0;
              return (
                <div key={p.code} className="border-b border-gray-100 dark:border-gray-800/60">
                  <div
                    className={`flex items-stretch ${
                      current.code === p.code ? "bg-blue-100 dark:bg-blue-900/40" : ""
                    }`}
                  >
                    {kids.length > 0 ? (
                      <button
                        onClick={() => toggleProv(p.code)}
                        aria-label={open ? "접기" : "펼치기"}
                        className="flex w-9 flex-none items-center justify-center text-lg text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-700"
                      >
                        {open ? "▾" : "▶"}
                      </button>
                    ) : (
                      <span className="w-9 flex-none" />
                    )}
                    <button
                      onClick={() => gotoInstitution(p.code)}
                      className="flex flex-1 items-center gap-1.5 truncate py-2 pr-2 text-left text-base font-bold"
                    >
                      <span className="truncate">{p.name}</span>
                      {kids.length > 0 && (
                        <span className="flex-none rounded-full bg-gray-200 px-1.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {kids.length}
                        </span>
                      )}
                      {pDown > 0 && (
                        <span className="flex-none rounded-full bg-red-500 px-1.5 text-[11px] text-white">
                          👎{pDown}
                        </span>
                      )}
                    </button>
                  </div>
                  {open &&
                    kids.map((k) => {
                      const kDown = downByCode.get(k.code) ?? 0;
                      return (
                        <button
                          key={k.code}
                          onClick={() => gotoInstitution(k.code)}
                          className={`flex w-full items-center gap-1 truncate border-l-4 py-1.5 pl-8 pr-2 text-left ${
                            current.code === k.code
                              ? "border-blue-500 bg-blue-100 font-medium dark:bg-blue-900/40"
                              : "border-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                          }`}
                        >
                          <span className="truncate">{k.name}</span>
                          {kDown > 0 && (
                            <span className="flex-none rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                              👎{kDown}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </nav>

        {/* 본문 */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* 기관 헤더 + 필드 탭 */}
          <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-2">
              {row.provinceName && <span className="text-xs text-gray-400">{row.provinceName}</span>}
              <span className="text-lg font-bold">{row.name}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {row.personName ? `${row.personName} ${row.title}` : row.title}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${partyBadgeClass(row.party)}`}>
                {row.party ?? "정당 미상"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FIELDS.map((f) => {
                const v = row.values[f.key];
                const filled = Array.isArray(v) ? v.length > 0 : Boolean(v);
                const active = current.field === f.key;
                const fl = flags[sk(row.code, f.key)];
                return (
                  <button
                    key={f.key}
                    onClick={() => gotoField(row.code, f.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      active
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    }`}
                  >
                    {fl === "up" ? "👍 " : fl === "down" ? "👎 " : ""}
                    {f.label}
                    <span className={active ? "text-blue-100" : "text-gray-400"}>
                      {filled ? "" : " ·비어있음"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 비교 뷰: 크롤링 값 | 출처 페이지 */}
          <div className={`flex min-h-0 flex-1 ${layout === "h" ? "flex-row" : "flex-col"}`}>
            <section
              className={`flex min-h-0 flex-col overflow-auto p-4 ${
                layout === "h"
                  ? "w-2/5 border-r border-gray-200 dark:border-gray-800"
                  : "h-2/5 border-b border-gray-200 dark:border-gray-800"
              }`}
            >
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                크롤링 값 · {field.label}
                {field.key === "slogan" && row.manualOverride && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    수동보정
                  </span>
                )}
              </h2>
              <ValuePanel kind={field.kind} value={value} />
            </section>

            <section className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-1.5 text-xs dark:border-gray-800">
                <span className="font-semibold text-gray-500">출처 페이지</span>
                {source ? (
                  <>
                    <span className="truncate text-gray-400">{source}</span>
                    <a
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex-none rounded bg-blue-600 px-2 py-0.5 text-white"
                    >
                      새 탭 ↗
                    </a>
                  </>
                ) : (
                  <span className="text-gray-400">
                    {field.key === "pledges"
                      ? "선관위 후보자 공약 API — 출처 웹페이지 없음"
                      : "출처 없음 (값이 비어 있음)"}
                  </span>
                )}
              </div>
              <div className="relative min-h-0 flex-1 bg-gray-100 dark:bg-gray-900">
                {source ? (
                  <>
                    <iframe
                      key={source}
                      src={source}
                      title="출처 페이지"
                      className="h-full w-full"
                      referrerPolicy="no-referrer"
                      sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                    <p className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white">
                      화면이 비면 iframe 차단(X-Frame-Options) — 위 “새 탭 ↗”으로 확인
                    </p>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    표시할 출처 페이지가 없습니다.
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* 하단: 좋아요/싫어요 + 이동 */}
          <footer className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 dark:border-gray-800">
            <button
              onClick={() => step(-1)}
              className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700"
            >
              ← 이전
            </button>
            <button
              onClick={() => setFlag("up")}
              className={`rounded px-4 py-1 text-sm font-semibold ${
                curFlag === "up"
                  ? "bg-green-600 text-white"
                  : "border border-green-600 text-green-700 dark:text-green-400"
              }`}
            >
              👍 좋아요
            </button>
            <button
              onClick={() => setFlag("down")}
              className={`rounded px-4 py-1 text-sm font-semibold ${
                curFlag === "down"
                  ? "bg-red-600 text-white"
                  : "border border-red-600 text-red-700 dark:text-red-400"
              }`}
            >
              👎 싫어요
            </button>
            <button
              onClick={() => step(1)}
              className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700"
            >
              다음 →
            </button>
            <span className="ml-auto text-xs text-gray-400">
              ← → 이동 · ↑ 좋아요 · ↓ 싫어요 · 데이터{" "}
              {new Date(updatedAt).toLocaleDateString("ko-KR")}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function ValuePanel({
  kind,
  value,
}: {
  kind: Kind;
  value: string | string[] | null;
}) {
  const empty = Array.isArray(value) ? value.length === 0 : !value;
  if (empty)
    return <p className="text-sm text-gray-400 dark:text-gray-500">(값 없음 / null)</p>;

  if (kind === "image")
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value as string}
          alt="크롤링 이미지"
          className="max-h-[60vh] max-w-full rounded border border-gray-200 bg-white object-contain dark:border-gray-700"
        />
        <p className="break-all text-xs text-gray-400">{value as string}</p>
      </div>
    );

  if (kind === "url")
    return (
      <a
        href={value as string}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-base text-blue-600 hover:underline dark:text-blue-400"
      >
        {value as string}
      </a>
    );

  if (kind === "list")
    return (
      <ol className="space-y-1.5">
        {(value as string[]).map((p, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
    );

  return (
    <p className="text-xl font-bold leading-snug text-gray-900 dark:text-gray-100">
      “{value as string}”
    </p>
  );
}
