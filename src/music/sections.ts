import { TOTAL_BEATS, type SectionId } from "../types/project";

export interface SectionDefinition {
  id: SectionId;
  startBar: number;
  endBar: number;
  startBeat: number;
  endBeat: number;
}

export const SECTION_DEFINITIONS: readonly SectionDefinition[] = [
  { id: "intro", startBar: 0, endBar: 2, startBeat: 0, endBeat: 8 },
  { id: "a", startBar: 2, endBar: 4, startBeat: 8, endBeat: 16 },
  { id: "b", startBar: 4, endBar: 6, startBeat: 16, endBeat: 24 },
  { id: "break", startBar: 6, endBar: 8, startBeat: 24, endBeat: 32 },
  { id: "climax", startBar: 8, endBar: 10, startBeat: 32, endBeat: 40 },
  { id: "outro", startBar: 10, endBar: 12, startBeat: 40, endBeat: 48 },
] as const;

export const SECTION_BY_ID: Readonly<Record<SectionId, SectionDefinition>> =
  Object.freeze(
    Object.fromEntries(
      SECTION_DEFINITIONS.map((definition) => [definition.id, definition]),
    ) as Record<SectionId, SectionDefinition>,
  );

/**
 * Section ranges are half-open. Values after the timeline clamp to Outro so UI
 * snapshots at exactly the final beat still have a meaningful section.
 */
export function getSectionAtBeat(beat: number): SectionId {
  const safeBeat = Number.isFinite(beat) ? beat : 0;
  const clampedBeat = Math.min(Math.max(safeBeat, 0), TOTAL_BEATS);

  for (const definition of SECTION_DEFINITIONS) {
    if (clampedBeat < definition.endBeat) return definition.id;
  }

  return "outro";
}

export function getSectionAtBar(bar: number): SectionId {
  const safeBar = Number.isFinite(bar) ? Math.floor(bar) : 0;
  return getSectionAtBeat(safeBar * 4);
}

export function getSectionDefinition(section: SectionId): SectionDefinition {
  return SECTION_BY_ID[section];
}

export function getSectionProgress(beat: number): number {
  const section = getSectionAtBeat(beat);
  const definition = SECTION_BY_ID[section];
  const progress = (beat - definition.startBeat) /
    (definition.endBeat - definition.startBeat);
  return Math.min(1, Math.max(0, progress));
}
