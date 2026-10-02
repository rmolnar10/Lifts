import { describe, expect, it } from "vitest";
import { isMissingProgramsSchema } from "@/lib/programs";
import { LEGACY_PROGRAM_ID, legacyProgram } from "@/lib/activeProgram";
import { PROGRAM } from "@/lib/program";

/**
 * A deploy can land before its migration. When it does, the app falls back to
 * the built-in program instead of showing an error, so these are the checks
 * that decide whether that fallback actually engages.
 */
describe("missing programs schema", () => {
  it("recognises the errors Postgres and PostgREST return", () => {
    expect(isMissingProgramsSchema({ code: "42P01" })).toBe(true); // missing table
    expect(isMissingProgramsSchema({ code: "42883" })).toBe(true); // missing function
    expect(isMissingProgramsSchema({ code: "PGRST202" })).toBe(true); // RPC not in cache
    expect(
      isMissingProgramsSchema({ message: 'relation "public.programs" does not exist' }),
    ).toBe(true);
    expect(
      isMissingProgramsSchema({
        message: "Could not find the function public.import_program(p_program)",
      }),
    ).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isMissingProgramsSchema({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingProgramsSchema({ message: "network error" })).toBe(false);
    expect(isMissingProgramsSchema(null)).toBe(false);
    expect(isMissingProgramsSchema(undefined)).toBe(false);
  });
});

describe("the fallback program", () => {
  it("is the built-in program, with a sentinel id", () => {
    const p = legacyProgram();
    expect(p.id).toBe(LEGACY_PROGRAM_ID);
    expect(p.dayOrder).toEqual(Object.keys(PROGRAM));
    expect(p.days["Heavy Upper"]).toEqual(PROGRAM["Heavy Upper"]);
    expect(p.hasWeeks).toBe(false);
  });

  it("has no week structure, so no week picker is implied", () => {
    expect(legacyProgram().weeks).toBeNull();
    expect(legacyProgram().week).toBe(1);
  });
});
