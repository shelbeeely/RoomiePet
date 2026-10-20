// Live updates: each open app keeps a server-sent event stream; when anything
// in its household changes it is told to fetch the new state.

export class Hub {
  constructor({ heartbeatMs = 25000 } = {}) {
    this.streams = new Map(); // household id -> Set of responses
    this.heartbeatMs = heartbeatMs;
  }

  subscribe(householdId, req, res) {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx would otherwise hold the stream back
    });
    res.flushHeaders();
    res.write("retry: 3000\n\nevent: hello\ndata: {}\n\n");
    let set = this.streams.get(householdId);
    if (!set) this.streams.set(householdId, (set = new Set()));
    set.add(res);
    // Proxies close a stream that says nothing for a while.
    const beat = setInterval(() => res.write(": beat\n\n"), this.heartbeatMs);
    req.on("close", () => {
      clearInterval(beat);
      set.delete(res);
      if (!set.size) this.streams.delete(householdId);
    });
  }

  notify(householdId) {
    for (const res of this.streams.get(householdId) || []) res.write("event: changed\ndata: {}\n\n");
  }

  closeAll() {
    for (const set of this.streams.values()) for (const res of set) res.end();
    this.streams.clear();
  }
}
