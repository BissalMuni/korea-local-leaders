"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { partyBadgeClass } from "@/lib/parties";

export type FieldKey = "homepage" | "photoUrl" | "slogan" | "ci" | "pledges";

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

const DONE_KEY = "localcity-review-done";
const sk = (code: string, field: FieldKey) => `${code}|${field}`;

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
  const [layout, setLayout] = useState<"h" | "v">("h");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());

  // localStorage 로 검수 완료 상태 유지
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DONE_KEY);
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* noop */
    }
  }, []);
  const persist = useCallback((next: Set<string>) => {
    setDone(next);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify([...next]));
    } catch {
      /* noop */
    }
  }, []);

  const current = seq[cur];
  const row = rowByCode.get(current.code)!;
  const field = FIELDS.find((f) => f.key === current.field)!;
  const value = row.values[field.key];
  const source = row.sources[field.key];
  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);

  const hasVal = useCallback(
    (i: number) => {
      const s = seq[i];
      const r = rowByCode.get(s.code)!;
      const v = r.values[s.field];
      return Array.isArray(v) ? v.length > 0 : Boolean(v);
    },
    [seq, rowByCode],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      setCur((c) => {
        let i = c + dir;
        while (i >= 0 && i < seq.length && skipEmpty && !hasVal(i)) i += dir;
        return Math.max(0, Math.min(seq.length - 1, i));
      });
    },
    [seq.length, skipEmpty, hasVal],
  );

  const gotoField = (code: string, fkey: FieldKey) => {
    const idx = seq.findIndex((s) => s.code === code && s.field === fkey);
    if (idx >= 0) setCur(idx);
  };
  const gotoInstitution = (code: string) => gotoField(code, "homepage");

  const toggleDone = useCallback(() => {
    const key = sk(current.code, current.field);
    const next = new Set(done);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persist(next);
  }, [current, done, persist]);

  const toggleProv = (code: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  // 키보드: ← → 이동, Space/x 확인 토글
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "x" || e.key === "X") { e.preventDefault(); toggleDone(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, toggleDone]);

  // 현재 항목이 접힌 광역 아래면 자동 펼침
  useEffect(() => {
    if (row.type === "basic" && row.provinceCode) {
      setExpanded((prev) =>
        prev.has(row.provinceCode!) ? prev : new Set(prev).add(row.provinceCode!),
      );
    }
  }, [row]);

  const isDone = done.has(sk(current.code, current.field));
  const progress = done.size;

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col">
      {/* 상단 바 */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-gray-950">
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← 로컬시티
        </Link>
        <h1 className="text-sm font-bold">데이터 검수</h1>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {cur + 1} / {seq.length} · 확인 {progress}
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={skipEmpty}
              onChange={(e) => setSkipEmpty(e.target.checked)}
            />
            빈 값 건너뛰기
          </label>
          <button
            onClick={() => setLayout((l) => (l === "h" ? "v" : "h"))}
            className="rounded border border-gray-300 px-2 py-0.5 dark:border-gray-700"
          >
            {layout === "h" ? "가로 분할" : "세로 분할"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 트리 네비게이션 */}
        <nav className="w-60 flex-none overflow-y-auto border-r border-gray-200 bg-gray-50 text-sm dark:border-gray-800 dark:bg-gray-900">
          {provinces.map((p) => {
            const kids = basicsByProv.get(p.code) ?? [];
            const open = expanded.has(p.code);
            return (
              <div key={p.code}>
                <div
                  className={`flex items-center ${
                    current.code === p.code ? "bg-blue-100 dark:bg-blue-900/40" : ""
                  }`}
                >
                  {kids.length > 0 ? (
                    <button
                      onClick={() => toggleProv(p.code)}
                      className="w-6 flex-none py-1 text-gray-400 hover:text-gray-700"
                    >
                      {open ? "▾" : "▸"}
                    </button>
                  ) : (
                    <span className="w-6 flex-none" />
                  )}
                  <button
                    onClick={() => gotoInstitution(p.code)}
                    className="flex-1 truncate py-1 pr-2 text-left font-semibold"
                  >
                    {p.name}
                  </button>
                </div>
                {open &&
                  kids.map((k) => (
                    <button
                      key={k.code}
                      onClick={() => gotoInstitution(k.code)}
                      className={`block w-full truncate py-1 pl-8 pr-2 text-left ${
                        current.code === k.code
                          ? "bg-blue-100 font-medium dark:bg-blue-900/40"
                          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      }`}
                    >
                      {k.name}
                    </button>
                  ))}
              </div>
            );
          })}
        </nav>

        {/* 본문 */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* 기관 헤더 + 필드 탭 */}
          <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-2">
              {row.provinceName && (
                <span className="text-xs text-gray-400">{row.provinceName}</span>
              )}
              <span className="text-lg font-bold">{row.name}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {row.personName ? `${row.personName} ${row.title}` : row.title}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${partyBadgeClass(row.party)}`}
              >
                {row.party ?? "정당 미상"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FIELDS.map((f) => {
                const v = row.values[f.key];
                const filled = Array.isArray(v) ? v.length > 0 : Boolean(v);
                const active = current.field === f.key;
                const d = done.has(sk(row.code, f.key));
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
                    {d && "✓ "}
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
          <div
            className={`flex min-h-0 flex-1 ${
              layout === "h" ? "flex-row" : "flex-col"
            }`}
          >
            {/* 크롤링 값 패널 */}
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

            {/* 출처 페이지 패널 */}
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

          {/* 하단 이동 바 */}
          <footer className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 dark:border-gray-800">
            <button
              onClick={() => step(-1)}
              disabled={cur === 0}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
            >
              ← 이전
            </button>
            <button
              onClick={() => step(1)}
              disabled={cur === seq.length - 1}
              className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
            >
              다음 →
            </button>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={isDone} onChange={toggleDone} />
              이 항목 확인함{" "}
              <span className="text-xs text-gray-400">(단축키 x)</span>
            </label>
            <span className="ml-auto text-xs text-gray-400">
              ← → 로 이동 · 데이터 {new Date(updatedAt).toLocaleDateString("ko-KR")}
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
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500">(값 없음 / null)</p>
    );

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

  // text
  return (
    <p className="text-xl font-bold leading-snug text-gray-900 dark:text-gray-100">
      “{value as string}”
    </p>
  );
}
