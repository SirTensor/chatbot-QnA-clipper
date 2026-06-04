(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.QAClipper = root.QAClipper || {};
  root.QAClipper.messageNormalizer = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
  const UI_ONLY_LINE_RE = /^(copy|copied|share|shared|retry|regenerate|edit|read aloud|more|open|close|like|dislike|good response|bad response)$/i;

  function normalizeText(value) {
    if (value === null || value === undefined) return '';

    const withoutZeroWidth = String(value).replace(ZERO_WIDTH_RE, '');
    const usefulLines = withoutZeroWidth
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !UI_ONLY_LINE_RE.test(line));

    return usefulLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  function hashText(value) {
    const text = String(value || '');
    let hash = 2166136261;

    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function getStableTurnOrderHint({ platform, testId }) {
    if (platform !== 'chatgpt' || !testId) return null;

    const match = String(testId).match(/^conversation-turn-(\d+)$/);
    if (!match) return null;

    return Number(match[1]) * 100000;
  }

  return {
    normalizeText,
    hashText,
    getStableTurnOrderHint
  };
});
