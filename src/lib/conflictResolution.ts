// src/lib/conflictResolution.ts
import type { Planting, GardenBed, Seed } from "./types";
import { occupancyWindow } from "./conflicts";

export interface ConflictDetail {
  actualizedPlanting: Planting;
  conflictingPlanting: Planting;
  actualizedSeed: Seed;
  conflictingSeed: Seed;
  recommendations: ResolutionRecommendation[];
}

export interface ResolutionRecommendation {
  type: "same_bed_different_segment" | "different_bed_same_time" | "different_time";
  description: string;
  targetBed?: GardenBed;
  targetSegment?: number;
  targetDate?: string;
  feasible: boolean;
}

/**
 * Generate detailed conflict information and resolution recommendations
 */
export function generateConflictDetails(
  actualizedPlanting: Planting,
  conflictingPlanting: Planting,
  allPlantings: Planting[],
  beds: GardenBed[],
  seeds: Seed[]
): ConflictDetail {
  const actualizedSeed = seeds.find(s => s.id === actualizedPlanting.seed_id)!;
  const conflictingSeed = seeds.find(s => s.id === conflictingPlanting.seed_id)!;
  
  const recommendations: ResolutionRecommendation[] = [];
  
  const conflictWindow = occupancyWindow(conflictingPlanting, conflictingSeed);
  if (!conflictWindow.start || !conflictWindow.end) {
    return { actualizedPlanting, conflictingPlanting, actualizedSeed, conflictingSeed, recommendations: [] };
  }

  const currentBed = beds.find(b => b.id === conflictingPlanting.garden_bed_id);
  if (!currentBed) {
    return { actualizedPlanting, conflictingPlanting, actualizedSeed, conflictingSeed, recommendations: [] };
  }

  // 1. Same bed, different segment
  const availableSegments = findAvailableSegments(
    currentBed,
    conflictWindow.start,
    conflictWindow.end,
    conflictingPlanting.segments_used ?? 1,
    allPlantings,
    seeds,
    conflictingPlanting.id
  );
  
  if (availableSegments.length > 0) {
    recommendations.push({
      type: "same_bed_different_segment",
      description: `Verplaats naar segment ${availableSegments[0]} in ${currentBed.name} (zelfde timing)`,
      targetBed: currentBed,
      targetSegment: availableSegments[0],
      feasible: true
    });
  } else {
    recommendations.push({
      type: "same_bed_different_segment",
      description: `Geen vrije segmenten in ${currentBed.name}`,
      feasible: false
    });
  }

  // 2. Different bed, same time
  const alternativeBed = findAlternativeBed(
    beds,
    currentBed.id,
    conflictWindow.start,
    conflictWindow.end,
    conflictingPlanting.segments_used ?? 1,
    allPlantings,
    seeds,
    conflictingSeed
  );
  
  if (alternativeBed) {
    recommendations.push({
      type: "different_bed_same_time",
      description: `Verplaats naar ${alternativeBed.bed.name}, segment ${alternativeBed.segment} (zelfde timing)`,
      targetBed: alternativeBed.bed,
      targetSegment: alternativeBed.segment,
      feasible: true
    });
  } else {
    recommendations.push({
      type: "different_bed_same_time",
      description: `Geen alternatieve bak beschikbaar op zelfde datum`,
      feasible: false
    });
  }

  // 3. Different timing - find first available slot
  const earliestSlot = findEarliestAvailableSlot(
    beds,
    conflictWindow.start,
    conflictWindow.end,
    conflictingPlanting.segments_used ?? 1,
    allPlantings,
    seeds,
    conflictingSeed
  );
  
  if (earliestSlot) {
    const daysDiff = Math.floor((earliestSlot.date.getTime() - conflictWindow.start.getTime()) / (1000 * 60 * 60 * 24));
    recommendations.push({
      type: "different_time",
      description: `Verplaats naar ${earliestSlot.bed.name}, segment ${earliestSlot.segment} op ${earliestSlot.date.toLocaleDateString('nl-NL')} (+${daysDiff} dagen)`,
      targetBed: earliestSlot.bed,
      targetSegment: earliestSlot.segment,
      targetDate: earliestSlot.date.toISOString().split('T')[0],
      feasible: true
    });
  } else {
    recommendations.push({
      type: "different_time",
      description: `Geen alternatieve slot gevonden binnen redelijke termijn`,
      feasible: false
    });
  }

  return {
    actualizedPlanting,
    conflictingPlanting,
    actualizedSeed,
    conflictingSeed,
    recommendations
  };
}

function findAvailableSegments(
  bed: GardenBed,
  startDate: Date,
  endDate: Date,
  segmentsNeeded: number,
  allPlantings: Planting[],
  seeds: Seed[],
  excludeId: string
): number[] {
  const available: number[] = [];
  const seedsById = new Map(seeds.map(s => [s.id, s]));
  
  for (let seg = 0; seg <= bed.segments - segmentsNeeded; seg++) {
    let occupied = false;
    
    for (const p of allPlantings) {
      if (p.id === excludeId || p.garden_bed_id !== bed.id) continue;
      
      const seed = seedsById.get(p.seed_id);
      const window = occupancyWindow(p, seed);
      if (!window.start || !window.end) continue;
      
      // Check time overlap
      if (startDate <= window.end && window.start <= endDate) {
        // Check segment overlap
        const pStart = p.start_segment ?? 0;
        const pEnd = pStart + (p.segments_used ?? 1) - 1;
        const segEnd = seg + segmentsNeeded - 1;
        
        if (seg <= pEnd && pStart <= segEnd) {
          occupied = true;
          break;
        }
      }
    }
    
    if (!occupied) available.push(seg);
  }
  
  return available;
}

function findAlternativeBed(
  beds: GardenBed[],
  currentBedId: string,
  startDate: Date,
  endDate: Date,
  segmentsNeeded: number,
  allPlantings: Planting[],
  seeds: Seed[],
  seedInfo: Seed
): { bed: GardenBed; segment: number } | null {
  const seedsById = new Map(seeds.map(s => [s.id, s]));
  
  for (const bed of beds) {
    if (bed.id === currentBedId) continue;
    
    // Check greenhouse compatibility
    if (bed.is_greenhouse && !seedInfo.greenhouse_compatible) continue;
    
    const segments = findAvailableSegments(bed, startDate, endDate, segmentsNeeded, allPlantings, seeds, "");
    if (segments.length > 0) {
      return { bed, segment: segments[0] };
    }
  }
  
  return null;
}

function findEarliestAvailableSlot(
  beds: GardenBed[],
  originalStart: Date,
  originalEnd: Date,
  segmentsNeeded: number,
  allPlantings: Planting[],
  seeds: Seed[],
  seedInfo: Seed
): { bed: GardenBed; segment: number; date: Date } | null {
  const duration = Math.ceil((originalEnd.getTime() - originalStart.getTime()) / (1000 * 60 * 60 * 24));
  const maxDaysForward = 90; // Search up to 90 days forward
  
  for (let daysOffset = 1; daysOffset <= maxDaysForward; daysOffset += 7) {
    const testStart = new Date(originalStart);
    testStart.setDate(testStart.getDate() + daysOffset);
    
    const testEnd = new Date(testStart);
    testEnd.setDate(testEnd.getDate() + duration);
    
    for (const bed of beds) {
      // Check greenhouse compatibility
      if (bed.is_greenhouse && !seedInfo.greenhouse_compatible) continue;
      
      const segments = findAvailableSegments(bed, testStart, testEnd, segmentsNeeded, allPlantings, seeds, "");
      if (segments.length > 0) {
        return { bed, segment: segments[0], date: testStart };
      }
    }
  }
  
  return null;
}
