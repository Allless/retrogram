/**
 * Single-lane priority queue for Telegram media downloads. One download at a
 * time keeps the app out of FLOOD_WAIT territory; priorities (slide indexes)
 * make earlier slides' media arrive first, and `focusFetchPriority` bumps the
 * slide the user is actually viewing to the front of the line.
 */

interface Job {
  priority: number;
  seq: number;
  start: () => void;
}

const jobs: Job[] = [];
let running = false;
let focused: number | null = null;
let seq = 0;

/** Jobs with this priority jump the queue (the slide currently on screen). */
export function focusFetchPriority(priority: number): void {
  focused = priority;
}

/** Run `task` when its turn comes; resolves/rejects with the task's result. */
export function enqueueFetch<T>(
  priority: number,
  task: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    jobs.push({
      priority,
      seq: seq++,
      start: () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            running = false;
            pump();
          });
      },
    });
    pump();
  });
}

function rank(job: Job): number {
  return job.priority === focused ? -1 : job.priority;
}

function pump(): void {
  if (running || jobs.length === 0) return;
  let best = 0;
  for (let i = 1; i < jobs.length; i++) {
    const a = jobs[i];
    const b = jobs[best];
    if (rank(a) < rank(b) || (rank(a) === rank(b) && a.seq < b.seq)) {
      best = i;
    }
  }
  const [job] = jobs.splice(best, 1);
  running = true;
  job.start();
}
