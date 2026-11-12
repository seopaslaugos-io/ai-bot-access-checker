// robots.txt parsing and matching per RFC 9309.
// - Group selection: the most specific group whose user-agent token is a
//   case-insensitive prefix match of the crawler's product token; otherwise "*".
//   Several groups naming the same token are merged.
// - Rule matching: the longest matching path wins; on a tie, allow wins.
//   "*" matches any run of characters, a trailing "$" anchors the end.

export function parseRobots(text) {
  const groups = []; // { agents: string[], rules: {type, path}[] }
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of String(text || '').split(/\r\n|\r|\n/)) {
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

function patternToRegex(path) {
  let anchored = false;
  let p = path;
  if (p.endsWith('$')) {
    anchored = true;
    p = p.slice(0, -1);
  }
  const body = p
    .split('*')
    .map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
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
    if (!patternToRegex(pat).test(target)) continue;
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

export function checkRobots(text, token, pathAndQuery) {
  const groups = parseRobots(text);
  const { group, rules } = selectGroup(groups, token);
  const res = isAllowed(rules, pathAndQuery);
  return { group, ...res };
}
