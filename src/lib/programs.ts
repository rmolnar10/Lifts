"use client";

/**
 * Loading and switching programs.
 *
 * A program is a list of blocks; a block covers a span of weeks and holds the
 * exercises for each day in that span. A program with no week structure is one
 * block with `weekEnd: null`, which matches every week.
 */

import { getSupabaseBrowserClient } from "./supabase/client";
import { BUILTIN_PROGRAM_SLUG, builtinProgramSpec, type ProgramSpec } from "./programSpec";
import type { Exercise, ProgressionType, Unit } from "./program";

export interface ProgramSummary {
  id: string;
  slug: string;
  name: string;
  notes: string;
  weeks: number | null;
}

export interface ProgramBlock {
  name: string;
  weekStart: number;
  weekEnd: number | null;
  /** Day name in program order, to its exercises in program order. */
  days: Record<string, Exercise[]>;
  dayOrder: string[];
}

export interface LoadedProgram extends ProgramSummary {
  blocks: ProgramBlock[];
}

interface ExerciseRow {
  day_name: string;
  day_position: number;
  position: number;
  exercise_key: string;
  name: string;
  sets: number;
  min_reps: number;
  max_reps: number;
  progression_type: string;
  unit: string;
  increment: number | string;
  reset_reps: number;
  rest_seconds: number;
  target_rpe_low: number | null;
  target_rpe_high: number | null;
  dropset: boolean;
  superset_group: string | null;
  per_side: boolean;
  warmup_sets: string | null;
}

interface BlockRow {
  name: string;
  position: number;
  week_start: number;
  week_end: number | null;
  program_exercises: ExerciseRow[] | null;
}

function rowToExercise(row: ExerciseRow): Exercise {
  return {
    id: row.exercise_key,
    name: row.name,
    sets: row.sets,
    min: row.min_reps,
    max: row.max_reps,
    type: row.progression_type as ProgressionType,
    unit: row.unit as Unit,
    inc: Number(row.increment),
    reset: row.reset_reps,
    rest: row.rest_seconds,
    targetRpe:
      row.target_rpe_low !== null && row.target_rpe_high !== null
        ? [row.target_rpe_low, row.target_rpe_high]
        : undefined,
    dropset: row.dropset || undefined,
    supersetGroup: row.superset_group,
    perSide: row.per_side || undefined,
    warmupSets: row.warmup_sets,
  };
}

export async function listPrograms(): Promise<ProgramSummary[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("programs")
    .select("id, slug, name, notes, weeks")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ProgramSummary[];
}

export async function loadProgram(programId: string): Promise<LoadedProgram> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("programs")
    .select(
      "id, slug, name, notes, weeks, " +
        "program_blocks (name, position, week_start, week_end, " +
        "program_exercises (day_name, day_position, position, exercise_key, name, sets, " +
        "min_reps, max_reps, progression_type, unit, increment, reset_reps, rest_seconds, " +
        "target_rpe_low, target_rpe_high, dropset, superset_group, per_side, warmup_sets))",
    )
    .eq("id", programId)
    .single();
  if (error) throw error;

  const row = data as unknown as ProgramSummary & { program_blocks: BlockRow[] | null };
  const blocks = [...(row.program_blocks ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((block) => {
      const rows = [...(block.program_exercises ?? [])].sort(
        (a, b) => a.day_position - b.day_position || a.position - b.position,
      );
      const days: Record<string, Exercise[]> = {};
      const dayOrder: string[] = [];
      for (const r of rows) {
        if (!days[r.day_name]) {
          days[r.day_name] = [];
          dayOrder.push(r.day_name);
        }
        days[r.day_name].push(rowToExercise(r));
      }
      return {
        name: block.name,
        weekStart: block.week_start,
        weekEnd: block.week_end,
        days,
        dayOrder,
      };
    });

  return { id: row.id, slug: row.slug, name: row.name, notes: row.notes, weeks: row.weeks, blocks };
}

/** The block covering `week`, or the first block if none matches. */
export function blockForWeek(program: LoadedProgram, week: number): ProgramBlock | null {
  if (!program.blocks.length) return null;
  return (
    program.blocks.find(
      (b) => week >= b.weekStart && (b.weekEnd === null || week <= b.weekEnd),
    ) ?? program.blocks[0]
  );
}

export async function importProgram(spec: ProgramSpec): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("import_program", { p_program: spec });
  if (error) throw error;
  return data as string;
}

export async function setActiveProgram(programId: string | null): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("set_active_program", { p_program_id: programId });
  if (error) throw error;
}

export async function getActiveProgramId(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("profiles").select("active_program_id").single();
  if (error) throw error;
  return (data as { active_program_id: string | null }).active_program_id;
}

/** Attaches history logged before programs existed to `programId`. Safe to re-run. */
export async function adoptOrphanHistory(programId: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("adopt_orphan_history", {
    p_program_id: programId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Makes sure the account has the built-in program and an active selection,
 * adopting any pre-programs history the first time. Returns the active program.
 */
export async function ensurePrograms(): Promise<{
  programs: ProgramSummary[];
  activeId: string;
}> {
  let programs = await listPrograms();

  let builtin = programs.find((p) => p.slug === BUILTIN_PROGRAM_SLUG);
  if (!builtin) {
    const id = await importProgram(builtinProgramSpec());
    // Everything logged before programs existed belongs to the built-in one.
    await adoptOrphanHistory(id);
    programs = await listPrograms();
    builtin = programs.find((p) => p.id === id) ?? programs[0];
  }

  let activeId = await getActiveProgramId();
  if (!activeId || !programs.some((p) => p.id === activeId)) {
    activeId = builtin.id;
    await setActiveProgram(activeId);
  }

  return { programs, activeId };
}
