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
import { whoTextsFirst } from "./whoTextsFirst";
import { leftOnRead } from "./leftOnRead";
import { textingStyles } from "./textingStyles";
import { trophyShelf } from "./trophyShelf";

import type { RegisteredStat } from "./registry";

/** The ordered set of stats the dashboard renders. */
export const STAT_REGISTRY: RegisteredStat[] = [
  register(volumeOverTime),
  register(activityHeatmap),
  register(topDms),
  register(topGroups),
  register(responseTimes),
  register(whoTextsFirst),
  register(leftOnRead),
  register(textingStyles),
  register(ghostedChats),
  register(emojiFrequency),
  register(reactions),
  register(streaks),
  register(greatestHits),
  register(trophyShelf),
];
