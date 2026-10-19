import { describe, expect, it } from "vitest";
import { PROGRAM, type Exercise } from "@/lib/program";
import { builtinProgramSpec, matchesBuiltin } from "@/lib/programSpec";

const days = () => Object.keys(PROGRAM);

/** What the database hands back: absent fields come back as null or false. */
function asStored(e: Exercise): Exercise {
  return { ...e, supersetGroup: e.supersetGroup ?? null, warmupSets: e.warmupSets ?? null };
}

describe("built-in program sync", () => {
  it("carries every field the database stores, so a re-import loses nothing", () => {
    const bench = builtinProgramSpec().blocks[0].days[0].exercises[0];
    expect(bench).toMatchObject({ key: "bench", target_rpe_low: 8, target_rpe_high: 9 });
    const tri = builtinProgramSpec().blocks[0].days[0].exercises.find((e) => e.key === "tri");
    expect(tri).toMatchObject({ dropset: true, superset_group: "A1" });
  });

  it("treats a stored copy of the current program as up to date", () => {
    const stored = Object.fromEntries(days().map((d) => [d, PROGRAM[d].map(asStored)]));
    expect(matchesBuiltin(days(), stored)).toBe(true);
  });

  it("spots a stale copy", () => {
    const stale = { ...PROGRAM, "Heavy Upper": PROGRAM["Heavy Upper"].map((e) => ({ ...e, sets: e.sets + 1 })) };
    expect(matchesBuiltin(days(), stale)).toBe(false);
    expect(matchesBuiltin(["Heavy Upper", "Volume Upper", "Functional Lower"], PROGRAM)).toBe(false);
  });
});
