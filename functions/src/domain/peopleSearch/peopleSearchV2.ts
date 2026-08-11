// HOTFIX 4.6 — people search ranking/annotation (pure, deterministic).
//
// Given candidate public profiles + the caller's social/group context, produce
// invite rows: exclude self + blocked; annotate member/invited/invite state and
// following hint; rank followed-first → exact @username → username-prefix →
// displayName-prefix → other. No opaque AI ranking. Public identity fields only.

export interface Candidate {
  uid: string;
  displayName: string;
  username?: string | null;
  photoUrl?: string | null;
  avatarPreset?: string | null;
}
export interface PeopleResult extends Candidate {
  state: "member" | "invited" | "invite";
  isFollowing: boolean;
}
export interface BuildArgs {
  candidates: Candidate[];
  selfUid: string;
  memberUids: Set<string>;
  pendingUids: Set<string>;
  followingUids: Set<string>;
  blockedUids: Set<string>;
  query: string;
}

export function buildPeopleResults(a: BuildArgs): PeopleResult[] {
  const q = (a.query || "").toLowerCase().replace(/^@/, "").trim();
  const seen = new Set<string>();
  const rows: PeopleResult[] = [];
  for (const c of a.candidates) {
    if (!c.uid || c.uid === a.selfUid) continue; // exclude self
    if (a.blockedUids.has(c.uid)) continue; // exclude blocked (either direction)
    if (!c.displayName || !c.displayName.trim()) continue; // skip deleted/empty
    if (seen.has(c.uid)) continue;
    seen.add(c.uid);
    const state: PeopleResult["state"] = a.memberUids.has(c.uid)
      ? "member"
      : a.pendingUids.has(c.uid)
        ? "invited"
        : "invite";
    rows.push({...c, state, isFollowing: a.followingUids.has(c.uid)});
  }
  const uname = (c: PeopleResult) => (c.username || "").toLowerCase();
  const dname = (c: PeopleResult) => (c.displayName || "").toLowerCase();
  function score(c: PeopleResult): number {
    let s = 0;
    if (c.isFollowing) s += 1000; // followed-first
    if (q) {
      if (uname(c) === q) s += 500; // exact @username
      else if (uname(c).startsWith(q)) s += 300;
      else if (dname(c).startsWith(q)) s += 150;
      else if (dname(c).includes(q)) s += 50;
    }
    return s;
  }
  rows.sort((x, y) => score(y) - score(x) || dname(x).localeCompare(dname(y)));
  return rows;
}
