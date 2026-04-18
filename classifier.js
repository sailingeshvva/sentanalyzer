/**
 * classifier.js — Rule-based sentiment classifier
 *
 * Classifies text into positive / neutral / negative
 * using keyword scoring with confidence estimation.
 */

const SentimentClassifier = (() => {

  /* ── Word lists ── */
  const POSITIVE_WORDS = new Set([
    // emotion
    'love','happy','great','excellent','amazing','wonderful','fantastic','awesome',
    'brilliant','superb','outstanding','magnificent','delightful','joyful','cheerful',
    'glad','pleased','thrilled','excited','grateful','thankful','blessed',
    // approval
    'good','nice','best','better','perfect','impressive','beautiful','elegant',
    'remarkable','exceptional','fabulous','terrific','marvelous','splendid',
    // action/intent
    'recommend','enjoy','appreciate','adore','admire','praise','celebrate',
    'like','liked','loving','enjoyed','helpful','useful','easy','fast',
    'smooth','friendly','kind','generous','reliable','comfortable','affordable',
    'satisfied','pleasant','positive','favorite','favourite','worth','worthy',
    'incredible','phenomenal','stunning','glorious','heartwarming','uplifting',
    'inspiring','motivating','supportive','caring','thoughtful','genuine',
    'innovative','creative','efficient','effective','valuable','quality',
    'premium','luxurious','seamless','intuitive','user-friendly','responsive',
    'congratulations','congrats','bravo','kudos','cheers','bless','hooray',
    'yay','wow','cool','neat','sweet','fine','stellar','top-notch',
    'world-class','first-rate','five-star','unbeatable','unmatched',
  ]);

  const NEGATIVE_WORDS = new Set([
    // emotion
    'hate','terrible','awful','horrible','disgusting','angry','sad','frustrated',
    'annoyed','disappointed','unhappy','miserable','depressed','furious','outraged',
    'upset','worried','anxious','fearful','scared','dreadful','pathetic',
    // complaint
    'bad','worst','worse','poor','ugly','broken','useless','waste','boring',
    'slow','confusing','complicated','difficult','expensive','overpriced',
    'unreliable','uncomfortable','unpleasant','rude','unfriendly','disrespectful',
    'incompetent','unprofessional','inadequate','inferior','mediocre',
    // action/intent
    'complain','regret','dislike','avoid','return','refund','cancel',
    'fail','failed','failure','error','bug','crash','problem','issue',
    'scam','fraud','fake','misleading','deceptive','dishonest','unethical',
    'disgusted','appalled','horrified','heartbroken','devastating','toxic',
    'nightmare','disaster','catastrophe','unacceptable','intolerable',
    'shameful','disgraceful','abysmal','atrocious','horrendous','lousy',
    'sucks','crappy','trash','garbage','junk','rubbish','crap','damn',
    'stupid','idiotic','ridiculous','absurd','nonsense',
  ]);

  const NEGATION_WORDS = new Set([
    'not','no','never','neither','nor','nobody','nothing','nowhere',
    'hardly','barely','scarcely',"don't","doesn't","didn't","won't",
    "wouldn't","couldn't","shouldn't","isn't","aren't","wasn't","weren't",
    "haven't","hasn't","hadn't","cannot","can't",
  ]);

  const INTENSIFIERS = new Set([
    'very','really','extremely','absolutely','incredibly','highly',
    'totally','completely','utterly','truly','deeply','so','super',
    'exceptionally','remarkably','extraordinarily',
  ]);

  /* ── Tokenizer ── */
  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^a-z0-9' \-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /* ── Classify a single text ── */
  function classify(text) {
    const tokens = tokenize(text);
    if (tokens.length === 0) {
      return { label: 'neutral', confidence: 0.5 };
    }

    let score = 0;
    let matchedWords = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const prev  = i > 0 ? tokens[i - 1] : '';
      const prev2 = i > 1 ? tokens[i - 2] : '';

      // Check negation (within 2-word window)
      const negated = NEGATION_WORDS.has(prev) || NEGATION_WORDS.has(prev2);
      // Check intensifier
      const intensified = INTENSIFIERS.has(prev) ? 1.5 : 1;

      if (POSITIVE_WORDS.has(token)) {
        const delta = (negated ? -1 : 1) * intensified;
        score += delta;
        matchedWords++;
      } else if (NEGATIVE_WORDS.has(token)) {
        const delta = (negated ? 1 : -1) * intensified;
        score += delta;
        matchedWords++;
      }
    }

    // Exclamation marks & caps amplify
    const exclamations = (text.match(/!/g) || []).length;
    const capsRatio = (text.replace(/[^A-Z]/g, '').length) / Math.max(text.replace(/\s/g, '').length, 1);
    if (capsRatio > 0.5 && text.length > 4) {
      score *= 1.3;
    }
    score += Math.sign(score) * Math.min(exclamations, 3) * 0.2;

    // Normalize score to label + confidence
    const normalizedScore = tokens.length > 0 ? score / Math.sqrt(tokens.length) : 0;

    let label, confidence;
    if (normalizedScore > 0.25) {
      label = 'positive';
      confidence = Math.min(0.5 + Math.abs(normalizedScore) * 0.25, 0.99);
    } else if (normalizedScore < -0.25) {
      label = 'negative';
      confidence = Math.min(0.5 + Math.abs(normalizedScore) * 0.25, 0.99);
    } else {
      label = 'neutral';
      confidence = matchedWords === 0
        ? 0.8   // no sentiment words found → likely factual
        : 0.5 + (0.25 - Math.abs(normalizedScore)) * 0.5;
    }

    return {
      label,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /* ── Process full payload ── */
  function processPayload(payload) {
    const results = [];
    const errors  = [];
    const counts  = { positive: 0, neutral: 0, negative: 0 };

    if (!payload || !Array.isArray(payload.rows)) {
      throw new Error('Payload must contain a "rows" array.');
    }

    const maxSamples = typeof payload.max_samples === 'number' && payload.max_samples > 0
      ? payload.max_samples
      : Infinity;

    let labeled = 0;

    payload.rows.forEach((row, index) => {
      // Validation
      if (!row || typeof row !== 'object') {
        errors.push({ index, data: row, reason: 'Row is not an object.' });
        return;
      }
      if (row.id === undefined || row.id === null) {
        errors.push({ index, data: row, reason: 'Missing required field "id".' });
        return;
      }
      if (typeof row.text !== 'string' || row.text.trim().length === 0) {
        errors.push({ index, data: row, reason: 'Missing or empty "text" field.' });
        return;
      }

      if (labeled >= maxSamples) return; // respect max_samples

      const { label, confidence } = classify(row.text);
      results.push({ id: row.id, text: row.text, label, confidence });
      counts[label]++;
      labeled++;
    });

    return {
      results,
      counts,
      errors,
      meta: {
        total_labeled: labeled,
        language: payload.language || 'en',
        timestamp: new Date().toISOString(),
      },
    };
  }

  return { classify, processPayload };
})();
