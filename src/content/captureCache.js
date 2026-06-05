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
  const DEFAULT_EDGE_SETTLE_MS = 800;

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

  function clonePlainObject(value) {
    if (!value) return null;
    return JSON.parse(JSON.stringify(value));
  }

  function createEdgeStatus() {
    return {
      phase: 'unknown',
      candidate: null,
      confirmed: null,
      stableSince: null,
      revokedAt: null
    };
  }

  function createEdgeState() {
    return {
      top: createEdgeStatus(),
      bottom: createEdgeStatus()
    };
  }

  function cloneEdgeStatus(edge) {
    return {
      phase: edge.phase,
      candidate: clonePlainObject(edge.candidate),
      confirmed: clonePlainObject(edge.confirmed),
      stableSince: edge.stableSince,
      revokedAt: edge.revokedAt
    };
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
    const edgeSettleMs = isFiniteNumber(options.edgeSettleMs) ? options.edgeSettleMs : DEFAULT_EDGE_SETTLE_MS;
    const messages = [];
    const byStableId = new Map();
    const byMessageKey = new Map();
    let sortedMessages = null;
    let sortedMessagesDirty = true;
    let sequence = 0;
    let platform = options.platform || 'unknown';
    let conversationKey = options.conversationKey || '';
    let edgeState = createEdgeState();
    let lastCaptureAt = null;

    function getStableIndexKey(message) {
      if (!message || !message.stableId) return null;
      return [
        message.platform,
        message.conversationKey,
        message.stableId
      ].join('|');
    }

    function getMessageIndexKey(message) {
      if (!message || !message.messageKey) return null;
      return [
        message.platform,
        message.conversationKey,
        message.messageKey
      ].join('|');
    }

    function indexMessage(message) {
      const stableIndexKey = getStableIndexKey(message);
      if (stableIndexKey) byStableId.set(stableIndexKey, message);

      const messageIndexKey = getMessageIndexKey(message);
      if (messageIndexKey) byMessageKey.set(messageIndexKey, message);
    }

    function clearIndexes() {
      byStableId.clear();
      byMessageKey.clear();
    }

    function markSortedMessagesDirty() {
      sortedMessagesDirty = true;
    }

    function compareMessages(first, second) {
      const firstOrder = isFiniteNumber(first.orderHint);
      const secondOrder = isFiniteNumber(second.orderHint);

      if (firstOrder && secondOrder && first.orderHint !== second.orderHint) {
        return first.orderHint - second.orderHint;
      }

      if (firstOrder !== secondOrder) return firstOrder ? -1 : 1;
      if (first.sequenceHint !== second.sequenceHint) return first.sequenceHint - second.sequenceHint;
      return first.firstSeenAt - second.firstSeenAt;
    }

    function getOrderedMessages() {
      if (!sortedMessages || sortedMessagesDirty) {
        sortedMessages = [...messages].sort(compareMessages);
        sortedMessagesDirty = false;
      }

      return sortedMessages;
    }

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
        const stableIndexKey = getStableIndexKey(incoming);
        const stableMatch = byStableId.get(stableIndexKey);
        if (stableMatch) return stableMatch;
      }

      const messageIndexKey = getMessageIndexKey(incoming);
      const messageMatch = byMessageKey.get(messageIndexKey);
      if (messageMatch) return messageMatch;

      return messages.find(message => {
        if (!isSameScope(message, incoming)) return false;

        const near = isNearOrder(message.orderHint, incoming.orderHint);
        if (!near) return false;

        return message.normalizedText === incoming.normalizedText ||
          isTextExpansion(message.normalizedText, incoming.normalizedText);
      }) || null;
    }

    function captureMessageInternal(input) {
      const incoming = makeMessage(input);
      if (!incoming) return null;

      platform = incoming.platform;
      conversationKey = incoming.conversationKey;
      lastCaptureAt = incoming.lastSeenAt;

      const existing = findExisting(incoming);
      const previousOrderHint = existing ? existing.orderHint : null;
      const captured = existing ? mergeMessage(existing, incoming) : incoming;

      if (!existing) {
        messages.push(incoming);
        markSortedMessagesDirty();
      } else if (previousOrderHint !== captured.orderHint) {
        markSortedMessagesDirty();
      }

      indexMessage(captured);

      return {
        captured,
        observedAt: incoming.lastSeenAt
      };
    }

    function captureMessage(input) {
      const result = captureMessageInternal(input);
      if (!result) return null;

      reconcileConfirmedEdges(getBoundarySnapshot({ observedAt: result.observedAt }), result.observedAt);
      return result.captured;
    }

    function captureMessages(incomingMessages) {
      if (!Array.isArray(incomingMessages)) return [];

      const capturedMessages = [];
      let observedAt = null;

      incomingMessages.forEach(input => {
        const result = captureMessageInternal(input);
        if (!result) return;

        capturedMessages.push(result.captured);
        observedAt = result.observedAt;
      });

      if (capturedMessages.length > 0) {
        reconcileConfirmedEdges(getBoundarySnapshot({ observedAt }), observedAt);
      }

      return capturedMessages;
    }

    function getMessages() {
      return getOrderedMessages().slice();
    }

    function getMessageToken(message) {
      if (!message) return null;
      return message.stableId || message.messageKey || [
        message.platform,
        message.conversationKey,
        message.role,
        message.contentHash,
        getOrderBucket(message.orderHint)
      ].join('|');
    }

    function getComparableOrder(message) {
      if (!message) return null;
      if (isFiniteNumber(message.orderHint)) return message.orderHint;
      if (isFiniteNumber(message.orderKey)) return message.orderKey;
      if (isFiniteNumber(message.sequenceHint)) return message.sequenceHint;
      return null;
    }

    function getBoundarySnapshot(auxiliary = {}) {
      const orderedMessages = getOrderedMessages();
      const count = orderedMessages.length;
      const first = count > 0 ? orderedMessages[0] : null;
      const last = count > 0 ? orderedMessages[count - 1] : null;

      return {
        count,
        firstToken: getMessageToken(first),
        firstOrder: getComparableOrder(first),
        firstContentHash: first ? first.contentHash : null,
        lastToken: getMessageToken(last),
        lastOrder: getComparableOrder(last),
        lastContentHash: last ? last.contentHash : null,
        scrollHeight: isFiniteNumber(auxiliary.scrollHeight) ? auxiliary.scrollHeight : null,
        lastMutationAt: isFiniteNumber(auxiliary.lastMutationAt) ? auxiliary.lastMutationAt : null,
        observedAt: isFiniteNumber(auxiliary.observedAt) ? auxiliary.observedAt : now()
      };
    }

    function getEdgeFingerprint(edgeName, snapshot) {
      if (!snapshot || snapshot.count <= 0) return null;

      if (edgeName === 'top') {
        return {
          token: snapshot.firstToken,
          order: snapshot.firstOrder,
          contentHash: snapshot.firstContentHash
        };
      }

      return {
        token: snapshot.lastToken,
        order: snapshot.lastOrder,
        contentHash: snapshot.lastContentHash
      };
    }

    function sameEdgeFingerprint(edgeName, firstSnapshot, secondSnapshot) {
      const first = getEdgeFingerprint(edgeName, firstSnapshot);
      const second = getEdgeFingerprint(edgeName, secondSnapshot);
      if (!first || !second || !first.token || !second.token) return false;
      if (first.token !== second.token) return false;

      return edgeName !== 'bottom' || first.contentHash === second.contentHash;
    }

    function resetUnconfirmedEdge(edgeName) {
      const edge = edgeState[edgeName];
      if (edge.phase !== 'confirmed') {
        const revokedAt = edge.revokedAt;
        edgeState[edgeName] = createEdgeStatus();
        edgeState[edgeName].revokedAt = revokedAt;
      }
    }

    function revokeEdge(edgeName, observedAt) {
      edgeState[edgeName] = createEdgeStatus();
      edgeState[edgeName].revokedAt = observedAt;
    }

    function reconcileConfirmedEdges(snapshot, observedAt) {
      ['top', 'bottom'].forEach(edgeName => {
        const edge = edgeState[edgeName];
        if (edge.phase === 'confirmed' && !sameEdgeFingerprint(edgeName, snapshot, edge.confirmed)) {
          revokeEdge(edgeName, observedAt);
        }
      });
    }

    function setCandidate(edgeName, snapshot, observedAt) {
      const edge = edgeState[edgeName];
      edge.phase = 'candidate';
      edge.candidate = clonePlainObject(snapshot);
      edge.confirmed = null;
      edge.stableSince = observedAt;
    }

    function maybeConfirmCandidate(edgeName, snapshot, observedAt) {
      const edge = edgeState[edgeName];
      if (edge.phase !== 'candidate' || !sameEdgeFingerprint(edgeName, snapshot, edge.candidate)) return;

      const lastMutationAt = Math.max(
        edge.candidate && edge.candidate.lastMutationAt ? edge.candidate.lastMutationAt : 0,
        snapshot && snapshot.lastMutationAt ? snapshot.lastMutationAt : 0
      );
      if (edge.candidate) edge.candidate.lastMutationAt = lastMutationAt || null;

      const quietSince = Math.max(
        edge.stableSince || observedAt,
        lastMutationAt
      );

      if (observedAt - quietSince < edgeSettleMs) return;

      edge.phase = 'confirmed';
      edge.confirmed = clonePlainObject({
        ...snapshot,
        confirmedAt: observedAt
      });
      edge.candidate = null;
      edge.stableSince = quietSince;
    }

    function observeEdge(edgeName, isNearEdge, snapshot, observedAt) {
      const edge = edgeState[edgeName];

      if (edge.phase === 'confirmed') {
        return;
      }

      if (!isNearEdge) {
        resetUnconfirmedEdge(edgeName);
        return;
      }

      if (!edge.candidate || !sameEdgeFingerprint(edgeName, snapshot, edge.candidate)) {
        setCandidate(edgeName, snapshot, observedAt);
      }

      maybeConfirmCandidate(edgeName, snapshot, observedAt);
    }

    function promoteSettledCandidates(snapshot, observedAt) {
      ['top', 'bottom'].forEach(edgeName => {
        const edge = edgeState[edgeName];
        if (edge.phase === 'candidate' && !sameEdgeFingerprint(edgeName, snapshot, edge.candidate)) {
          resetUnconfirmedEdge(edgeName);
          return;
        }

        maybeConfirmCandidate(edgeName, snapshot, observedAt);
      });
    }

    function markViewportState(state = {}) {
      const capturedCount = state.capturedCount ?? messages.length;
      if (capturedCount <= 0) return;

      const observedAt = isFiniteNumber(state.observedAt) ? state.observedAt : now();
      const snapshot = getBoundarySnapshot({
        scrollHeight: state.scrollHeight,
        lastMutationAt: state.lastMutationAt,
        observedAt
      });
      const nearTop = state.nearTop ?? state.hasSeenTop;
      const nearBottom = state.nearBottom ?? state.hasSeenBottom;

      reconcileConfirmedEdges(snapshot, observedAt);
      observeEdge('top', nearTop === true, snapshot, observedAt);
      observeEdge('bottom', nearBottom === true, snapshot, observedAt);
    }

    function clear(nextScope = {}) {
      messages.length = 0;
      clearIndexes();
      sortedMessages = null;
      sortedMessagesDirty = true;
      sequence = 0;
      platform = nextScope.platform || platform || 'unknown';
      conversationKey = nextScope.conversationKey || conversationKey || '';
      edgeState = createEdgeState();
      lastCaptureAt = null;
    }

    function getStatus() {
      const count = messages.length;
      const observedAt = now();
      const snapshot = getBoundarySnapshot({ observedAt });
      reconcileConfirmedEdges(snapshot, observedAt);
      promoteSettledCandidates(snapshot, observedAt);

      const hasSeenTop = edgeState.top.phase === 'confirmed';
      const hasSeenBottom = edgeState.bottom.phase === 'confirmed';

      return {
        platform,
        conversationKey,
        capturedCount: count,
        hasSeenTop,
        hasSeenBottom,
        edgeState: {
          top: cloneEdgeStatus(edgeState.top),
          bottom: cloneEdgeStatus(edgeState.bottom)
        },
        edgeSettleMs,
        lastCaptureAt,
        mayBeIncomplete: count > 0 && !(hasSeenTop && hasSeenBottom),
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
