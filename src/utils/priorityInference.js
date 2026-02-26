const LEVELS = ['low', 'medium', 'high', 'critical'];
const LEVEL_RANK = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const EMPTY_SCORES = { low: 0, medium: 0, high: 0, critical: 0 };

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const URGENCY_RULES = [
  { level: 'critical', weight: 3, signal: 'urgency_critical_direct', pattern: /\b(onmiddellijk|per direct|meteen|nu direct|direct actie|spoed|urgent|immediately|right away|cannot wait|can t wait|cannot postpone|can t postpone|niet uitstellen)\b/ },
  { level: 'critical', weight: 3, signal: 'urgency_critical_outage_now', pattern: /\b(uitval|storing|plat|down|outage|niet beschikbaar|unavailable)\b.*\b(nu|direct|onmiddellijk|meteen|immediately)\b/ },
  { level: 'critical', weight: 3, signal: 'urgency_critical_safety', pattern: /\b(gevaar|danger|veiligheidsincident|safety incident|brandgevaar|fire risk|persoonlijk letsel|injury)\b/ },
  { level: 'high', weight: 2, signal: 'urgency_high_today_deadline', pattern: /\b(vandaag|today|same day|voor het einde van de dag|end of day|eod)\b/ },
  { level: 'high', weight: 2, signal: 'urgency_high_asap', pattern: /\b(asap|zsm|zo snel mogelijk|vanmiddag|straks|met prioriteit|priority)\b/ },
  { level: 'high', weight: 2, signal: 'urgency_high_blocked_work', pattern: /\b(kan niet werken|cannot work|werk ligt stil|work stopped|kan niet inloggen|cannot login|kan niet verder|cannot continue)\b/ },
  { level: 'medium', weight: 2, signal: 'urgency_medium_tomorrow', pattern: /\b(morgen|tomorrow|werkdag|next business day)\b/ },
  { level: 'medium', weight: 2, signal: 'urgency_medium_short_term', pattern: /\b(deze week|this week|binnenkort|soon)\b/ },
  { level: 'low', weight: 2, signal: 'urgency_low_can_wait', pattern: /\b(kan wachten|niet urgent|lage urgentie|later deze week|komende dagen|uitstellen mogelijk|geen haast|no rush)\b/ },
  { level: 'low', weight: 2, signal: 'urgency_low_planning', pattern: /\b(inplannen|gepland onderhoud|planned maintenance|volgende sprint|next sprint)\b/ },
];

const IMPACT_RULES = [
  { level: 'critical', weight: 3, signal: 'impact_critical_security', pattern: /\b(security incident|datalek|data leak|ransomware|malware|phishing|cyberaanval|gehackt|hacked|core applicatie|kernapplicatie|bedrijfskritisch|hele organisatie|entire company|alle gebruikers|all users)\b/ },
  { level: 'critical', weight: 3, signal: 'impact_critical_operations', pattern: /\b(productie stil|production down|fabriek stil|plant down|bedrijf ligt stil|business stopped)\b/ },
  { level: 'critical', weight: 3, signal: 'impact_critical_locations', pattern: /\b(alle vestigingen|meerdere vestigingen|all locations|multiple locations|organisatie breed|company wide)\b/ },
  { level: 'high', weight: 2, signal: 'impact_high_departments', pattern: /\b(meerdere afdelingen|multiple departments|verschillende afdelingen)\b/ },
  { level: 'high', weight: 2, signal: 'impact_high_process', pattern: /\b(kritisch proces|critical process|financieel proces|payroll|facturatie|billing|compliance)\b/ },
  { level: 'high', weight: 2, signal: 'impact_high_many_users', pattern: /\b(veel gebruikers|veel werkplekken|large impact|grote impact|groot deel)\b/ },
  { level: 'medium', weight: 2, signal: 'impact_medium_department', pattern: /\b(hele afdeling|entire department|afdeling breed|team breed)\b/ },
  { level: 'medium', weight: 2, signal: 'impact_medium_shared_service', pattern: /\b(meerdere teams|shared service|gedeelde dienst|gedeeld systeem)\b/ },
  { level: 'low', weight: 2, signal: 'impact_low_limited', pattern: /\b(beperkt aantal|enkele werkplekken|single user|een gebruiker|1 gebruiker|kleine impact|alleen ik|only me)\b/ },
  { level: 'low', weight: 2, signal: 'impact_low_test', pattern: /\b(test|dummy|oefening|sandbox|voorbeeldmelding)\b/ },
];

const DAMPENER_RULES = [
  { level: 'urgency', weight: 1, signal: 'dampener_test', pattern: /\b(test|dummy|oefening|voorbeeld|training)\b/ },
  { level: 'urgency', weight: 1, signal: 'dampener_not_urgent', pattern: /\b(niet urgent|geen haast|kan wachten|no rush)\b/ },
  { level: 'impact', weight: 1, signal: 'dampener_single_user', pattern: /\b(1 gebruiker|single user|alleen ik|only me|kleine impact)\b/ },
];

const addScore = (scores, level, weight) => {
  const safeWeight = Math.max(0, Number(weight || 0));
  scores[level] = Math.max(0, Number(scores[level] || 0) + safeWeight);
};

const applyRules = (text, rules) => {
  const scores = { ...EMPTY_SCORES };
  const matchedSignals = [];
  let strongestWeight = 0;

  for (const rule of rules) {
    if (!rule.pattern.test(text)) continue;
    addScore(scores, rule.level, rule.weight);
    matchedSignals.push(rule.signal);
    strongestWeight = Math.max(strongestWeight, Number(rule.weight || 0));
  }

  return { scores, matchedSignals, strongestWeight };
};

const mergeScores = (...allScores) => {
  const merged = { ...EMPTY_SCORES };
  for (const scoreMap of allScores) {
    for (const level of LEVELS) {
      addScore(merged, level, scoreMap?.[level] || 0);
    }
  }
  return merged;
};

const levelFromScores = (scores) => {
  // Conservative thresholds: require more evidence for high/critical.
  if (scores.critical >= 3 || (scores.critical >= 2 && scores.high >= 2)) return 'critical';
  if (scores.high >= 3 || (scores.high >= 2 && scores.medium >= 2)) return 'high';
  if (scores.medium >= 2 || scores.high >= 1) return 'medium';
  return 'low';
};

const scoreDimension = (text, rules, extraScores = null) => {
  const fromRules = applyRules(text, rules);
  const scores = mergeScores(fromRules.scores, extraScores || EMPTY_SCORES);
  const level = levelFromScores(scores);
  const score = Number(scores[level] || 0);

  if (level === 'low' && score <= 0) {
    return { level: 'low', score: 0, matchedSignals: fromRules.matchedSignals, scores };
  }

  return { level, score, matchedSignals: fromRules.matchedSignals, scores };
};

const findSmallestDeadlineHours = (text) => {
  const deadlinePattern = /\b(binnen|within|in|maximaal|uiterlijk|before)\s*(\d{1,3})\s*(min(?:uut|uten)?|minutes?|uur|uren|hour|hours?|h|dag|dagen|day|days)\b/g;
  let minHours = null;
  let match = deadlinePattern.exec(text);
  while (match) {
    const amount = Number(match[2] || 0);
    const unit = String(match[3] || '');
    if (amount > 0) {
      let hours = amount;
      if (/min/.test(unit)) hours = amount / 60;
      if (/dag|day/.test(unit)) hours = amount * 24;
      if (minHours === null || hours < minHours) minHours = hours;
    }
    match = deadlinePattern.exec(text);
  }
  return minHours;
};

const inferUrgencyFromDeadlines = (text) => {
  const scores = { ...EMPTY_SCORES };
  const matchedSignals = [];
  const minHours = findSmallestDeadlineHours(text);
  if (minHours === null) return { scores, matchedSignals };

  if (minHours <= 1) {
    addScore(scores, 'critical', 3);
    matchedSignals.push('urgency_critical_deadline_under_1h');
  } else if (minHours <= 4) {
    addScore(scores, 'high', 2);
    matchedSignals.push('urgency_high_deadline_under_4h');
  } else if (minHours <= 8) {
    addScore(scores, 'medium', 2);
    matchedSignals.push('urgency_medium_deadline_under_8h');
  } else if (minHours <= 24) {
    addScore(scores, 'medium', 1);
    matchedSignals.push('urgency_medium_deadline_under_24h');
  } else {
    addScore(scores, 'low', 1);
    matchedSignals.push('urgency_low_deadline_over_24h');
  }

  return { scores, matchedSignals };
};

const highestNumericMatch = (text, pattern, valueIndex = 1) => {
  let highest = 0;
  let match = pattern.exec(text);
  while (match) {
    const parsed = Number(match[valueIndex] || 0);
    if (Number.isFinite(parsed) && parsed > highest) highest = parsed;
    match = pattern.exec(text);
  }
  return highest;
};

const inferImpactFromNumbers = (text) => {
  const scores = { ...EMPTY_SCORES };
  const matchedSignals = [];

  const affectedUsers = highestNumericMatch(
    text,
    /\b(\d{1,4})\s*(gebruikers|users|werkplekken|medewerkers|employees|accounts|devices|pcs|pc)\b/g,
    1
  );
  if (affectedUsers >= 250) {
    addScore(scores, 'critical', 3);
    matchedSignals.push('impact_critical_user_count_250_plus');
  } else if (affectedUsers >= 50) {
    addScore(scores, 'high', 2);
    matchedSignals.push('impact_high_user_count_50_plus');
  } else if (affectedUsers >= 10) {
    addScore(scores, 'medium', 2);
    matchedSignals.push('impact_medium_user_count_10_plus');
  } else if (affectedUsers >= 2) {
    addScore(scores, 'low', 1);
    matchedSignals.push('impact_low_user_count_2_plus');
  }

  const affectedPercent = highestNumericMatch(
    text,
    /\b(\d{1,3})\s*%\s*(van\s*)?(gebruikers|users|organisatie|company|afdeling|department)\b/g,
    1
  );
  if (affectedPercent >= 70) {
    addScore(scores, 'critical', 3);
    matchedSignals.push('impact_critical_percent_70_plus');
  } else if (affectedPercent >= 30) {
    addScore(scores, 'high', 2);
    matchedSignals.push('impact_high_percent_30_plus');
  } else if (affectedPercent >= 10) {
    addScore(scores, 'medium', 2);
    matchedSignals.push('impact_medium_percent_10_plus');
  }

  const affectedLocations = highestNumericMatch(
    text,
    /\b(\d{1,3})\s*(vestigingen|locaties|sites|locations|plants|fabrieken|factories)\b/g,
    1
  );
  if (affectedLocations >= 3) {
    addScore(scores, 'critical', 3);
    matchedSignals.push('impact_critical_location_count_3_plus');
  } else if (affectedLocations >= 2) {
    addScore(scores, 'high', 2);
    matchedSignals.push('impact_high_location_count_2_plus');
  }

  return { scores, matchedSignals };
};

const applyDampeners = (text, urgencyScores, impactScores) => {
  const matchedSignals = [];
  for (const rule of DAMPENER_RULES) {
    if (!rule.pattern.test(text)) continue;
    matchedSignals.push(rule.signal);
    if (rule.level === 'urgency') {
      urgencyScores.critical = Math.max(0, urgencyScores.critical - rule.weight);
      urgencyScores.high = Math.max(0, urgencyScores.high - rule.weight);
    }
    if (rule.level === 'impact') {
      impactScores.critical = Math.max(0, impactScores.critical - rule.weight);
      impactScores.high = Math.max(0, impactScores.high - rule.weight);
    }
  }
  return matchedSignals;
};

const downgradeOneLevel = (level) => {
  const rank = Math.max(0, (LEVEL_RANK[level] || 0) - 1);
  return LEVELS[rank];
};

const finalizeSeverity = ({ urgencyLevel, impactLevel, urgencyScore, impactScore, strongSignals }) => {
  let severityCode = normalizeSeverityCode(
    LEVELS[Math.max(LEVEL_RANK[urgencyLevel], LEVEL_RANK[impactLevel])]
  );

  // Prevent noisy high alerts when evidence is weak.
  if (severityCode === 'critical' && strongSignals < 1) {
    severityCode = downgradeOneLevel(severityCode);
  }
  if (severityCode === 'high' && urgencyScore + impactScore < 4 && strongSignals < 2) {
    severityCode = downgradeOneLevel(severityCode);
  }

  return severityCode;
};

const inferConfidence = ({ severityCode, urgencyScore, impactScore, strongSignals }) => {
  if (severityCode === 'low') return 'low';
  if (severityCode === 'critical') {
    return strongSignals >= 2 || urgencyScore + impactScore >= 6 ? 'high' : 'medium';
  }
  if (severityCode === 'high') {
    return strongSignals >= 1 || urgencyScore + impactScore >= 5 ? 'high' : 'medium';
  }
  return urgencyScore + impactScore >= 3 ? 'medium' : 'low';
};

const countStrongSignals = (urgencyScores, impactScores) => {
  let count = 0;
  for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
    const level = LEVELS[i];
    if (urgencyScores[level] >= 2) count += 1;
    if (impactScores[level] >= 2) count += 1;
  }
  return count;
};

const normalizeSeverityCode = (value) => {
  const code = String(value || '').trim().toLowerCase();
  return LEVEL_RANK[code] !== undefined ? code : 'low';
};

export const inferPriorityFromReport = ({ description, workflowType, location }) => {
  const mergedText = normalizeText([description, workflowType, location].filter(Boolean).join(' '));

  // No meaningful signal -> conservative default.
  if (!mergedText || mergedText.length < 8) {
    return {
      severityCode: 'low',
      urgencyLevel: 'low',
      impactLevel: 'low',
      confidence: 'low',
      matchedSignals: [],
    };
  }

  const urgencyFromDeadline = inferUrgencyFromDeadlines(mergedText);
  const impactFromNumbers = inferImpactFromNumbers(mergedText);

  const urgency = scoreDimension(mergedText, URGENCY_RULES, urgencyFromDeadline.scores);
  const impact = scoreDimension(mergedText, IMPACT_RULES, impactFromNumbers.scores);

  const dampenerSignals = applyDampeners(mergedText, urgency.scores, impact.scores);
  const urgencyAfterDampener = {
    ...urgency,
    level: levelFromScores(urgency.scores),
    score: Number(urgency.scores[levelFromScores(urgency.scores)] || 0),
  };
  const impactAfterDampener = {
    ...impact,
    level: levelFromScores(impact.scores),
    score: Number(impact.scores[levelFromScores(impact.scores)] || 0),
  };

  const strongSignals = countStrongSignals(urgencyAfterDampener.scores, impactAfterDampener.scores);
  const severityCode = finalizeSeverity({
    urgencyLevel: urgencyAfterDampener.level,
    impactLevel: impactAfterDampener.level,
    urgencyScore: urgencyAfterDampener.score,
    impactScore: impactAfterDampener.score,
    strongSignals,
  });

  const confidence = inferConfidence({
    severityCode,
    urgencyScore: urgencyAfterDampener.score,
    impactScore: impactAfterDampener.score,
    strongSignals,
  });

  return {
    severityCode,
    urgencyLevel: urgencyAfterDampener.level,
    impactLevel: impactAfterDampener.level,
    confidence,
    matchedSignals: Array.from(
      new Set([
        ...(urgencyAfterDampener.matchedSignals || []),
        ...(impactAfterDampener.matchedSignals || []),
        ...(urgencyFromDeadline.matchedSignals || []),
        ...(impactFromNumbers.matchedSignals || []),
        ...(dampenerSignals || []),
      ])
    ),
    scoreBreakdown: {
      urgency: urgencyAfterDampener.scores,
      impact: impactAfterDampener.scores,
      strongSignals,
    },
  };
};
