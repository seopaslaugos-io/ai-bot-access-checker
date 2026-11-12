// robots.txt parsing and matching per RFC 9309.
// - Group selection: the most specific group whose user-agent token is a
//   case-insensitive prefix match of the crawler's product token; otherwise "*".
//   Several groups naming the same token are merged.
// - Rule matching: the longest matching path wins; on a tie, allow wins.
//   "*" matches any run of characters, a trailing "$" anchors the end.

// Limits that keep a hostile or broken robots.txt from eating CPU. Google reads the first
// 500 KiB; the checker only downloads 64 KiB, so these are generous for real files.
const MAX_LINES = 5000;
const MAX_LINE_LENGTH = 2000;
const MAX_RULES = 3000;

export function parseRobots(text) {
  const groups = []; // { agents: string[], rules: {type, path}[] }
  let current = null;
  let lastWasAgent = false;
  let ruleCount = 0;

  for (const rawLine of String(text || '').split(/\r\n|\r|\n/, MAX_LINES)) {
    if (rawLine.length > MAX_LINE_LENGTH) continue;
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current) continue; // rules before any user-agent line are ignored
      if (++ruleCount > MAX_RULES || value.length > 512) continue;
      current.rules.push({ type: key, path: value });
    } else {
      // sitemap, crawl-delay, etc. do not end a user-agent run in practice
      // but do not start rules either.
      lastWasAgent = false;
    }
  }
  return groups;
}

// Returns { group: 'gptbot' | '*' | null, rules: [...] }
export function selectGroup(groups, token) {
  const t = token.toLowerCase();
  let bestLen = -1;
  let bestAgent = null;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === '*') continue;
      if (t.startsWith(a) && a.length > bestLen) {
        bestLen = a.length;
        bestAgent = a;
      }
    }
  }
  const pick = bestAgent ?? (groups.some(g => g.agents.includes('*')) ? '*' : null);
  if (pick === null) return { group: null, rules: [] };
  const rules = [];
  for (const g of groups) if (g.agents.includes(pick)) rules.push(...g.rules);
  return { group: pick, rules };
}

// Wildcard match without regular expressions: "*" = any run of characters, a trailing "$"
// anchors the end, otherwise the pattern is a prefix. Greedy two-pointer matching with one
// backtrack point runs in O(pattern x path) at worst, so a hostile robots.txt cannot stall it
// the way a backtracking regex like /a*a*a*a*b/ can.
// Shared step budget per robots.txt evaluation; a pathological file stops matching instead of
// burning the Worker's CPU allowance.
let budget = Infinity;
export class BudgetError extends Error {}

export function wildcardMatch(pattern, path) {
  let anchored = false;
  let p = pattern;
  if (p.endsWith('$')) {
    anchored = true;
    p = p.slice(0, -1);
  }
  if (!anchored) p += '*'; // prefix match
  p = p.replace(/\*+/g, '*');
  let i = 0, j = 0, star = -1, mark = 0;
  while (j < path.length) {
    if (--budget < 0) throw new BudgetError('robots.txt too complex');
    if (i < p.length && p[i] !== '*' && p[i] === path[j]) { i++; j++; }
    else if (i < p.length && p[i] === '*') { star = i++; mark = j; }
    else if (star !== -1) { i = star + 1; j = ++mark; }
    else return false;
  }
  while (i < p.length && p[i] === '*') i++;
  return i === p.length;
}

// Percent-encoding is normalised loosely: compare decoded forms.
function norm(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

export function isAllowed(rules, pathAndQuery) {
  const target = norm(pathAndQuery || '/');
  if (target === '/robots.txt') return { allowed: true, rule: null };
  let best = null;
  for (const r of rules) {
    if (r.type === 'disallow' && r.path === '') continue; // empty disallow = allow all
    const pat = norm(r.path);
    if (!wildcardMatch(pat, target)) continue;
    const len = pat.length;
    if (
      !best ||
      len > best.len ||
      (len === best.len && r.type === 'allow' && best.type === 'disallow')
    ) {
      best = { len, type: r.type, path: r.path };
    }
  }
  if (!best) return { allowed: true, rule: null };
  return { allowed: best.type === 'allow', rule: `${best.type === 'allow' ? 'Allow' : 'Disallow'}: ${best.path}` };
}

const STEP_BUDGET = 400000;

// Evaluate one bot against already-parsed groups. If the file is too complex to evaluate
// within the step budget, the result says so instead of guessing.
export function checkParsed(groups, token, pathAndQuery) {
  const { group, rules } = selectGroup(groups, token);
  budget = STEP_BUDGET;
  try {
    return { group, ...isAllowed(rules, pathAndQuery.slice(0, 2048)) };
  } catch (e) {
    if (e instanceof BudgetError) return { group, allowed: true, rule: null, tooComplex: true };
    throw e;
  } finally {
    budget = Infinity;
  }
}

export function checkRobots(text, token, pathAndQuery) {
  return checkParsed(parseRobots(text), token, pathAndQuery);
}
