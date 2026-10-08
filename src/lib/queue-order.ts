/**
 * The order a reviewer is working through a queue in.
 *
 * A queue can be searched, filtered and sorted in the browser, so the server
 * cannot know what "next" means. The list records the rows as the viewer sees
 * them; the review page reads that back for its Previous / Next buttons. It is
 * held per browser tab and keyed by the queue's route, and it is a convenience:
 * with no record (a deep link, blocked storage) the buttons simply do not show.
 */
const slot = (base: string) => `queue-order:${base}`

export function writeQueueOrder(base: string, ids: string[]) {
  try {
    window.sessionStorage.setItem(slot(base), JSON.stringify(ids))
  } catch {
    /* a convenience; ignore blocked or full storage */
  }
}

/** The raw stored order, for `useSyncExternalStore`: a string, so it compares by value. */
export function readQueueOrderRaw(base: string): string {
  try {
    return window.sessionStorage.getItem(slot(base)) ?? ''
  } catch {
    return ''
  }
}

export function parseQueueOrder(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Where the record sits in an order, and its neighbours. */
export function neighboursIn(ids: string[], currentId: string) {
  const index = ids.indexOf(currentId)
  if (index === -1) return null
  return {
    position: index + 1,
    total: ids.length,
    previousId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
  }
}

/** Where the record sits in the recorded order, and its neighbours. */
export function queueNeighbours(base: string, currentId: string) {
  return neighboursIn(parseQueueOrder(readQueueOrderRaw(base)), currentId)
}
