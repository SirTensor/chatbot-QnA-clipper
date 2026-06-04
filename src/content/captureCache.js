(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    const normalizer = require('../shared/messageNormalizer.js');
    module.exports = { createCaptureCache: factory(normalizer) };
    return;
  }

  root.QAClipper = root.QAClipper || {};
  root.QAClipper.createCaptureCache = factory(root.QAClipper.messageNormalizer);
})(typeof self !== 'undefined' ? self : this, function(normalizer) {
  const NEAR_ORDER_DISTANCE = 64;

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function getOrderBucket(orderHint) {
    if (!isFiniteNumber(orderHint)) return 'unknown';
    return Math.round(orderHint / 128);
  }

  function isNearOrder(first, second) {
    if (!isFiniteNumber(first) || !isFiniteNumber(second)) return false;
    return Math.abs(first - second) <= NEAR_ORDER_DISTANCE;
  }

  function isSameScope(first, second) {
    return first.platform === second.platform &&
      first.conversationKey === second.conversationKey &&
      first.role === second.role;
  }

  function isTextExpansion(existingText, incomingText) {
    if (!existingText || !incomingText || existingText === incomingText) return false;

    const shorter = existingText.length <= incomingText.length ? existingText : incomingText;
    const longer = existingText.length > incomingText.length ? existingText : incomingText;

    return shorter.length >= 8 && longer.includes(shorter);
  }

  function cloneTurnData(turnData) {
    if (!turnData) return null;
    return JSON.parse(JSON.stringify(turnData));
  }

  function preferIncoming(existing, incoming) {
    const existingLength = existing.normalizedText.length;
    const incomingLength = incoming.normalizedText.length;

    if (incomingLength > existingLength) return true;
    if (incomingLength < existingLength) return false;

    const existingMarkdownLength = (existing.markdown || '').length;
    const incomingMarkdownLength = (incoming.markdown || '').length;
    return incomingMarkdownLength >= existingMarkdownLength;
  }

  function mergeMessage(existing, incoming) {
    existing.lastSeenAt = incoming.lastSeenAt;
    existing.source = incoming.source || existing.source;
    existing.stableId = existing.stableId || incoming.stableId || null;

    if (isFiniteNumber(existing.orderHint) && isFiniteNumber(incoming.orderHint)) {
      existing.orderHint = Math.min(existing.orderHint, incoming.orderHint);
    } else if (!isFiniteNumber(existing.orderHint) && isFiniteNumber(incoming.orderHint)) {
      existing.orderHint = incoming.orderHint;
    }

    if (preferIncoming(existing, incoming)) {
      existing.plainText = incoming.plainText;
      existing.markdown = incoming.markdown;
      existing.normalizedText = incoming.normalizedText;
      existing.contentHash = incoming.contentHash;
      existing.prefixHash = incoming.prefixHash;
      existing.turnData = cloneTurnData(incoming.turnData);
    }

    return existing;
  }

  function createCaptureCache(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const messages = [];
    let sequence = 0;
    let platform = options.platform || 'unknown';
    let conversationKey = options.conversationKey || '';
    let hasSeenTop = false;
    let hasSeenBottom = false;
    let lastCaptureAt = null;

    function makeMessage(input) {
      const plainText = String(input.plainText || input.markdown || '').trim();
      const markdown = String(input.markdown || plainText).trim();
      const normalizedText = input.normalizedText || normalizer.normalizeText(plainText || markdown);

      if (!normalizedText) return null;

      const resolvedPlatform = input.platform || platform || 'unknown';
      const resolvedConversationKey = input.conversationKey || conversationKey || '';
      const contentHash = input.contentHash || normalizer.hashText(normalizedText);
      const prefixHash = input.prefixHash || normalizer.hashText(normalizedText.slice(0, 120));
      const orderHint = isFiniteNumber(input.orderHint) ? input.orderHint : null;
      const sequenceHint = isFiniteNumber(input.sequenceHint) ? input.sequenceHint : sequence++;
      const stableId = input.stableId ? String(input.stableId) : null;
      const fallbackMessageKey = [
        resolvedPlatform,
        resolvedConversationKey,
        input.role || 'unknown',
        contentHash,
        getOrderBucket(orderHint)
      ].join('|');

      return {
        platform: resolvedPlatform,
        conversationKey: resolvedConversationKey,
        role: input.role || 'unknown',
        messageKey: input.messageKey || (stableId ? `${resolvedPlatform}|${resolvedConversationKey}|stable|${stableId}` : fallbackMessageKey),
        stableId,
        orderKey: input.orderKey ?? orderHint ?? sequenceHint,
        orderHint,
        sequenceHint,
        plainText,
        markdown,
        normalizedText,
        contentHash,
        prefixHash,
        firstSeenAt: input.firstSeenAt ?? now(),
        lastSeenAt: input.lastSeenAt ?? now(),
        source: input.source || 'passive-cache',
        turnData: cloneTurnData(input.turnData)
      };
    }

    function findExisting(incoming) {
      if (incoming.stableId) {
        const byStableId = messages.find(message =>
          message.platform === incoming.platform &&
          message.conversationKey === incoming.conversationKey &&
          message.stableId === incoming.stableId
        );
        if (byStableId) return byStableId;
      }

      const byMessageKey = messages.find(message => message.messageKey === incoming.messageKey);
      if (byMessageKey) return byMessageKey;

      return messages.find(message => {
        if (!isSameScope(message, incoming)) return false;

        const near = isNearOrder(message.orderHint, incoming.orderHint);
        if (!near) return false;

        return message.normalizedText === incoming.normalizedText ||
          isTextExpansion(message.normalizedText, incoming.normalizedText);
      }) || null;
    }

    function captureMessage(input) {
      const incoming = makeMessage(input);
      if (!incoming) return null;

      platform = incoming.platform;
      conversationKey = incoming.conversationKey;
      lastCaptureAt = incoming.lastSeenAt;

      const existing = findExisting(incoming);
      if (existing) return mergeMessage(existing, incoming);

      messages.push(incoming);
      return incoming;
    }

    function captureMessages(incomingMessages) {
      if (!Array.isArray(incomingMessages)) return [];
      return incomingMessages.map(captureMessage).filter(Boolean);
    }

    function getMessages() {
      return [...messages].sort((first, second) => {
        const firstOrder = isFiniteNumber(first.orderHint);
        const secondOrder = isFiniteNumber(second.orderHint);

        if (firstOrder && secondOrder && first.orderHint !== second.orderHint) {
          return first.orderHint - second.orderHint;
        }

        if (firstOrder !== secondOrder) return firstOrder ? -1 : 1;
        if (first.sequenceHint !== second.sequenceHint) return first.sequenceHint - second.sequenceHint;
        return first.firstSeenAt - second.firstSeenAt;
      });
    }

    function markViewportState(state = {}) {
      const capturedCount = state.capturedCount ?? messages.length;
      if (capturedCount <= 0) return;

      if (state.hasSeenTop) hasSeenTop = true;
      if (state.hasSeenBottom) hasSeenBottom = true;
    }

    function clear(nextScope = {}) {
      messages.length = 0;
      sequence = 0;
      platform = nextScope.platform || platform || 'unknown';
      conversationKey = nextScope.conversationKey || conversationKey || '';
      hasSeenTop = false;
      hasSeenBottom = false;
      lastCaptureAt = null;
    }

    function getStatus() {
      const count = messages.length;
      return {
        platform,
        conversationKey,
        capturedCount: count,
        hasSeenTop,
        hasSeenBottom,
        lastCaptureAt,
        mayBeIncomplete: count > 0 && !hasSeenTop,
        isEmpty: count === 0
      };
    }

    return {
      captureMessage,
      captureMessages,
      getMessages,
      markViewportState,
      clear,
      getStatus
    };
  }

  return createCaptureCache;
});
