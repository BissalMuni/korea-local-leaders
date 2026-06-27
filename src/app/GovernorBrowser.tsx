"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Governor } from "@/lib/types";
import { partyBadgeClass } from "@/lib/parties";

function PartyBadge({ party }: { party: string | null }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${partyBadgeClass(
        party,
      )}`}
    >
      {party ?? "정당 미상"}
    </span>
  );
}

function GovernorCard({ g }: { g: Governor }) {
  return (
    <Link
      href={`/region/${g.code}`}
      className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          {g.type === "basic" && g.provinceName && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {g.provinceName}
            </p>
          )}
          <h3 className="text-lg font-bold tracking-tight">{g.name}</h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {g.personName ? `${g.personName} ${g.title}` : `${g.title} 정보 준비 중`}
          </p>
        </div>
        <PartyBadge party={g.party} />
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-gray-800 dark:text-gray-200">
        {g.slogan ? (
          <span className="text-gray-900 dark:text-gray-100">“{g.slogan}”</span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">슬로건 정보 준비 중</span>
        )}
      </p>

      <div className="mt-auto flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>{g.manualOverride ? "검수됨" : "자동 수집"}</span>
        <span className="text-blue-600 group-hover:underline dark:text-blue-400">
          자세히 →
        </span>
      </div>
    </Link>
  );
}

export default function GovernorBrowser({
  governors,
}: {
  governors: Governor[];
}) {
  const [query, setQuery] = useState("");
  const [party, setParty] = useState<string | null>(null);
  const [level, setLevel] = useState<"all" | "metropolitan" | "basic">("all");

  const parties = useMemo(() => {
    const set = new Set<string>();
    governors.forEach((g) => g.party && set.add(g.party));
    return [...set].sort();
  }, [governors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return governors.filter((g) => {
      if (level !== "all" && g.type !== level) return false;
      if (party && g.party !== party) return false;
      if (!q) return true;
      return [g.name, g.shortName, g.personName, g.slogan, g.vision, g.provinceName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [governors, query, party, level]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="시·도명, 단체장, 슬로건 검색…"
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none ring-blue-500/40 transition focus:border-blue-500 focus:ring-2 dark:border-gray-700 dark:bg-gray-900"
        />

        <div className="flex flex-wrap gap-2">
          <FilterChip active={level === "all"} onClick={() => setLevel("all")}>
            전체 구분
          </FilterChip>
          <FilterChip
            active={level === "metropolitan"}
            onClick={() => setLevel("metropolitan")}
          >
            광역
          </FilterChip>
          <FilterChip active={level === "basic"} onClick={() => setLevel("basic")}>
            기초
          </FilterChip>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip active={party === null} onClick={() => setParty(null)}>
            전체 정당
          </FilterChip>
          {parties.map((p) => (
            <FilterChip
              key={p}
              active={party === p}
              onClick={() => setParty(party === p ? null : p)}
            >
              {p}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        {filtered.length}곳 표시 중
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700">
          검색 결과가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((g) => (
            <GovernorCard key={g.code} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
