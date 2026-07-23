/**
 * The populated stat registry. This is the only place that imports every stat
 * module, keeping `registry.tsx` (which the modules import from) free of module
 * imports and therefore acyclic.
 */

import { register } from "./registry";
import { activityHeatmap } from "./activityHeatmap";
import { emojiFrequency } from "./emojiFrequency";
import { ghostedChats } from "./ghostedChats";
import { greatestHits } from "./greatestHits";
import { reactions } from "./reactions";
import { responseTimes } from "./responseTimes";
import { streaks } from "./streaks";
import { topDms, topGroups } from "./topContacts";
import { volumeOverTime } from "./volumeOverTime";

import type { RegisteredStat } from "./registry";

/** The ordered set of stats the dashboard renders. */
export const STAT_REGISTRY: RegisteredStat[] = [
  register(volumeOverTime),
  register(activityHeatmap),
  register(topDms),
  register(topGroups),
  register(responseTimes),
  register(ghostedChats),
  register(emojiFrequency),
  register(reactions),
  register(greatestHits),
  register(streaks),
];
