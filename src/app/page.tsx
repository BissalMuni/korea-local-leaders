import Link from "next/link";
import { getAllGovernors, getStats } from "@/lib/data";
import GovernorBrowser from "./GovernorBrowser";

export default function Home() {
  const { governors, updatedAt } = getAllGovernors();
  const stats = getStats(governors);
  const updated = new Date(updatedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
          로컬시티 · LocalCity
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          전국 지자체장 비전·슬로건
        </h1>
        <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-400">
          전국 광역·기초 자치단체장의 이름·소속 정당·슬로건·비전을 한곳에서
          확인하세요. 새 단체장 취임과 홈페이지 개편에 맞춰 갱신됩니다.
        </p>
        <Link
          href="/map"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          🗺️ 지도로 보기
        </Link>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
          <span>광역 {stats.metro}곳</span>
          <span>기초 {stats.basic}곳</span>
          <span>단체장 {stats.withName}명 확인</span>
          <span>홈페이지 {stats.withHomepage}곳</span>
          <span>업데이트 {updated}</span>
        </div>
      </header>

      <GovernorBrowser governors={governors} />

      <footer className="mt-16 border-t border-gray-200 pt-6 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
        이름·정당은 위키백과, 슬로건·비전은 각 지자체 공식 홈페이지에서 자동
        수집한 자료입니다. 일부 값은 부정확할 수 있으며 검수를 통해 보완됩니다.
      </footer>
    </main>
  );
}
