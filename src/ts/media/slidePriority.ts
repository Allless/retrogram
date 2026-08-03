import { createContext } from "preact";

/** Index of the surrounding slide — the fetch-queue priority for its media. */
export const SlidePriorityContext = createContext(0);
