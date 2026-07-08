import fs from "node:fs";
import path from "node:path";
import type { Governor } from "./types";

interface GovernorFile {
  updatedAt: string;
  governors: Governor[];
}

function readFile(name: string): GovernorFile {
  const file = path.join(process.cwd(), "data", name);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as GovernorFile;
}

/** 광역(시·도지사) 데이터. 3D 지도·광역 화면에서 사용. */
export function getGovernors(): GovernorFile {
  const data = readFile("governors.json");
  const governors = [...data.governors].sort((a, b) => a.code.localeCompare(b.code));
  return { updatedAt: data.updatedAt, governors };
}

/** 기초(시장·군수·구청장) 데이터. 목록 화면에서 사용. */
export function getBasics(): GovernorFile {
  try {
    return readFile("basic.json");
  } catch {
    return { updatedAt: "", governors: [] }; // 아직 미수집이어도 동작
  }
}

/** 광역 + 기초 전체. 목록/검색·상세 페이지에서 사용. */
export function getAllGovernors(): GovernorFile {
  const metro = getGovernors();
  const basic = getBasics();
  const updatedAt =
    metro.updatedAt > basic.updatedAt ? metro.updatedAt : basic.updatedAt;
  return { updatedAt, governors: [...metro.governors, ...basic.governors] };
}

export function getGovernor(code: string): Governor | undefined {
  return getAllGovernors().governors.find((g) => g.code === code);
}

/** 데이터 완성도 통계 */
export function getStats(governors: Governor[]) {
  const metro = governors.filter((g) => g.type === "metropolitan");
  const basic = governors.filter((g) => g.type === "basic");
  return {
    total: governors.length,
    metro: metro.length,
    basic: basic.length,
    withName: governors.filter((g) => g.personName).length,
    withSlogan: governors.filter((g) => g.slogan).length,
    withHomepage: governors.filter((g) => g.homepage).length,
  };
}
