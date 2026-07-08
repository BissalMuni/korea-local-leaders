import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getGovernor, getAllGovernors } from "@/lib/data";
import { partyBadgeClass } from "@/lib/parties";

export function generateStaticParams() {
  return getAllGovernors().governors.map((g) => ({ code: g.code }));
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
        <div className="flex items-start gap-4">
          {/* 기관장 사진 */}
          {g.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={g.photoUrl}
              alt={`${g.personName ?? g.name} ${g.title}`}
              className="h-24 w-20 flex-none rounded-lg object-cover object-top shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
            />
          )}
          <div>
            {g.type === "basic" && g.provinceName && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {g.provinceName}
              </p>
            )}
            <div className="flex items-center gap-2">
              {/* 기관 CI */}
              {g.ci && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.ci}
                  alt={`${g.name} CI`}
                  className="h-7 w-auto max-w-[7rem] object-contain"
                />
              )}
              <h1 className="text-3xl font-extrabold tracking-tight">{g.name}</h1>
            </div>
            <p className="mt-1 text-lg text-gray-600 dark:text-gray-300">
              {g.personName ? `${g.personName} ${g.title}` : `${g.title} 정보 준비 중`}
            </p>
          </div>
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

      {g.pledges && g.pledges.length > 0 && (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            주요공약
          </h2>
          <ol className="mt-3 space-y-2">
            {g.pledges.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-none font-bold text-blue-600 dark:text-blue-400">
                  {i + 1}
                </span>
                <span className="text-gray-900 dark:text-gray-100">{p}</span>
              </li>
            ))}
          </ol>
        </section>
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
          {g.homepage ? (
            <a
              href={g.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {g.homepage}
            </a>
          ) : (
            EMPTY
          )}
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
