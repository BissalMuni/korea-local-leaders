import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGovernor, getGovernors } from "@/lib/data";
import { partyBadgeClass } from "@/lib/parties";

export function generateStaticParams() {
  return getGovernors().governors.map((g) => ({ code: g.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const g = getGovernor(code);
  if (!g) return { title: "찾을 수 없음 — 로컬시티" };
  return {
    title: `${g.name} ${g.personName ?? ""} ${g.title} — 로컬시티`.trim(),
    description: g.slogan ?? g.vision ?? `${g.name} 단체장 정보`,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 py-4 last:border-0 dark:border-gray-800">
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="text-base text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

const EMPTY = (
  <span className="text-gray-400 dark:text-gray-500">정보 준비 중</span>
);

export default async function RegionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const g = getGovernor(code);
  if (!g) notFound();

  const sources = (g.source ?? "").split(";").map((s) => s.trim()).filter(Boolean);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        ← 전체 목록
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{g.name}</h1>
          <p className="mt-1 text-lg text-gray-600 dark:text-gray-300">
            {g.personName ? `${g.personName} ${g.title}` : `${g.title} 정보 준비 중`}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${partyBadgeClass(
            g.party,
          )}`}
        >
          {g.party ?? "정당 미상"}
        </span>
      </header>

      {g.slogan && (
        <blockquote className="mt-6 rounded-2xl bg-blue-50 p-6 text-xl font-bold text-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
          “{g.slogan}”
        </blockquote>
      )}

      <dl className="mt-8 rounded-2xl border border-gray-200 bg-white px-5 dark:border-gray-800 dark:bg-gray-900">
        <Field label="비전">{g.vision ?? EMPTY}</Field>
        <Field label="소속 정당">{g.party ?? EMPTY}</Field>
        <Field label="임기">
          {g.termStart || g.termEnd
            ? `${g.termStart ?? "?"} ~ ${g.termEnd ?? "?"}`
            : EMPTY}
        </Field>
        <Field label="공식 홈페이지">
          <a
            href={g.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {g.homepage}
          </a>
        </Field>
        <Field label="데이터 출처">
          {sources.length ? (
            <ul className="space-y-1">
              {sources.map((s) => (
                <li key={s}>
                  <a
                    href={s}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            EMPTY
          )}
        </Field>
        <Field label="수집 상태">
          {g.manualOverride ? "검수됨 (수동 보정)" : "자동 수집"}
          {g.lastCrawledAt && (
            <span className="ml-2 text-sm text-gray-400">
              · {new Date(g.lastCrawledAt).toLocaleString("ko-KR")}
            </span>
          )}
        </Field>
      </dl>
    </main>
  );
}
