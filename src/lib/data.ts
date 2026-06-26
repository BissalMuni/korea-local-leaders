import fs from "node:fs";
import path from "node:path";
import type { Governor } from "./types";

interface GovernorFile {
  updatedAt: string;
  governors: Governor[];
}

/** data/governors.json 을 빌드/서버 시점에 읽어온다. */
function readData(): GovernorFile {
  const file = path.join(process.cwd(), "data", "governors.json");
  const raw = fs.readFileSync(file, "utf-8");
  return JSON.parse(raw) as GovernorFile;
}

/** 정렬된 전체 단체장 목록 + 갱신 시각 */
export function getGovernors(): GovernorFile {
  const data = readData();
  const governors = [...data.governors].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  return { updatedAt: data.updatedAt, governors };
}

export function getGovernor(code: string): Governor | undefined {
  return readData().governors.find((g) => g.code === code);
}

/** 데이터 완성도(이름·슬로건·비전이 채워진 비율) 통계 */
export function getStats(governors: Governor[]) {
  const total = governors.length;
  const withName = governors.filter((g) => g.personName).length;
  const withSlogan = governors.filter((g) => g.slogan).length;
  return { total, withName, withSlogan };
}
