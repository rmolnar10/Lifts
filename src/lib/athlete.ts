/**
 * Who the engine is coaching. These two facts change what a stall means and how
 * fast loads should climb, so they are the first thing to update when they
 * change.
 *
 * Set from Ryan's answers on 2026-10-15 (docs/TODO.md): about 6 months of
 * consistent lifting, 1.5–2 months on this program, eating in a deficit.
 */

export type Experience = "novice" | "late-novice" | "intermediate";
export type EnergyBalance = "surplus" | "maintenance" | "deficit";

export interface AthleteProfile {
  experience: Experience;
  energyBalance: EnergyBalance;
}

export const ATHLETE: AthleteProfile = {
  experience: "late-novice",
  energyBalance: "deficit",
};

export interface EngineTuning {
  /**
   * Sessions at one load, with no rep gained, before an exercise counts as
   * stalled. Newer lifters progress for longer, so a flat patch is more often
   * noise and calling it a stall early would be wrong.
   */
  stallSessions: number;
  /**
   * RIR on the final set, at the top of the range, that earns a double load
   * jump. Reps in reserve at the top of the range mean the load was light.
   */
  doubleJumpRir: number;
  /** Consecutive sessions of progress at one load before a set is added. */
  addSetAfter: number;
  /** Most sets that may be added on top of the program's own count. */
  extraSetsPrimary: number;
  extraSetsAccessory: number;
}

export function tuningFor(athlete: AthleteProfile = ATHLETE): EngineTuning {
  const byExperience: Record<Experience, Pick<EngineTuning, "stallSessions" | "doubleJumpRir">> = {
    novice: { stallSessions: 5, doubleJumpRir: 2 },
    "late-novice": { stallSessions: 4, doubleJumpRir: 3 },
    intermediate: { stallSessions: 3, doubleJumpRir: 4 },
  };

  // Extra volume is harder to recover from without the food to support it, so
  // a deficit earns sets more slowly and caps them lower.
  const deficit = athlete.energyBalance === "deficit";

  return {
    ...byExperience[athlete.experience],
    addSetAfter: deficit ? 3 : 2,
    extraSetsPrimary: 1,
    extraSetsAccessory: deficit ? 1 : 2,
  };
}
