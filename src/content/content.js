// --- START OF FILE content.js ---

(function() {
  const CONTENT_VERSION = 4;
  if (window.qaClipperContentVersion >= CONTENT_VERSION) return;
  window.qaClipperContentVersion = CONTENT_VERSION;
  window.qaClipperInitialized = true;

  const SUPPORTED_PLATFORMS = new Set(['chatgpt', 'gemini', 'claude', 'grok']);
  const CACHE_ENABLED_PLATFORMS = new Set(['chatgpt']);
  const PASSIVE_DEBOUNCE_MS = 300;
  const SCROLL_CAPTURE_THROTTLE_MS = 100;
  const MUTATION_CAPTURE_THROTTLE_MS = 80;
  const ROUTE_CHECK_MS = 1000;
  const TOP_EDGE_THRESHOLD_PX = 200;
  const BOTTOM_EDGE_THRESHOLD_PX = 350;
  const FULL_SCAN_BOTTOM_EDGE_THRESHOLD_PX = 120;
  const OPTIMISTIC_COPY_RECHECK_MS = 150;
  const FULL_SCAN_WAIT_MS = 320;
  const FULL_SCAN_MAX_STEPS = 180;
  const FULL_SCAN_MAX_MS = 90000;
  const EDGE_SETTLE_RECHECK_FALLBACK_MS = 850;
  const FULL_SCAN_EDGE_SETTLE_MAX_MS = 4000;

  const state = {
    cache: null,
    platform: null,
    conversationKey: null,
    conversationRoot: null,
    scrollContainer: null,
    scrollTarget: null,
    observer: null,
    captureTimer: null,
    throttleTimer: null,
    lastPassiveCaptureAt: 0,
    initialBottomCapturePending: true,
    pendingCopySnapshot: null,
    lastSuccessfulCopySnapshot: null,
    captureInProgress: false,
    pendingCapture: false,
    routeTimer: null,
    passiveEnabled: true,
    lastFormatSettings: {},
    lastUrl: window.location.href,
    lastMutationAt: 0,
    scan: {
      running: false,
      cancelRequested: false
    }
  };

  function getNormalizer() {
    return window.QAClipper && window.QAClipper.messageNormalizer;
  }

  function getMessage(messageName, substitutions) {
    try {
      return chrome.i18n.getMessage(messageName, substitutions) || messageName;
    } catch (error) {
      return messageName;
    }
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function getCache() {
    if (!state.cache && window.QAClipper && typeof window.QAClipper.createCaptureCache === 'function') {
      state.cache = window.QAClipper.createCaptureCache();
    }
    return state.cache;
  }

  function isCacheEnabledPlatform(platform) {
    return CACHE_ENABLED_PLATFORMS.has(platform);
  }

  function identifyPlatform() {
    if (typeof window.qaClipperIdentifyPlatform === 'function') {
      const platform = window.qaClipperIdentifyPlatform();
      if (SUPPORTED_PLATFORMS.has(platform)) return platform;
    }

    const currentUrl = window.location.href;
    const hostname = window.location.hostname;

    if (hostname === 'chat.openai.com' || hostname === 'chatgpt.com' || hostname.endsWith('.chatgpt.com')) {
      return 'chatgpt';
    }
    if (currentUrl.includes('gemini.google.com')) return 'gemini';
    if (currentUrl.includes('claude.ai')) return 'claude';
    if (currentUrl.includes('grok.com')) return 'grok';

    if (document.querySelector('[data-testid^="conversation-turn-"], [data-message-author-role]')) {
      return 'chatgpt';
    }

    return null;
  }

  function getConfig(platform) {
    if (!platform) return null;
    return window[`${platform}Config`] || null;
  }

  function getConversationKey(platform) {
    try {
      const url = new URL(window.location.href);
      const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

      if (platform === 'chatgpt') {
        const chatMatch = normalizedPath.match(/\/c\/([^/]+)/);
        const shareMatch = normalizedPath.match(/\/share\/([^/]+)/);
        if (chatMatch) return `chatgpt:c:${chatMatch[1]}`;
        if (shareMatch) return `chatgpt:share:${shareMatch[1]}`;
      }

      return `${platform || 'unknown'}:${url.origin}${normalizedPath}`;
    } catch (error) {
      return `${platform || 'unknown'}:${window.location.href.split(/[?#]/)[0]}`;
    }
  }

  function resetForCurrentConversation(platform, conversationKey) {
    const cache = getCache();
    if (!cache) return;

    if (state.platform !== platform || state.conversationKey !== conversationKey) {
      cache.clear({ platform, conversationKey });
      state.platform = platform;
      state.conversationKey = conversationKey;
      state.initialBottomCapturePending = true;
      clearCopySnapshots();
    }
  }

  function findConversationRoot(platform) {
    if (platform === 'chatgpt') {
      return document.querySelector('#thread') || document.querySelector('main') || document.body;
    }

    if (platform === 'gemini') {
      return document.querySelector('main') ||
        document.querySelector('chat-window') ||
        document.querySelector('bard-sidenav-container') ||
        document.body;
    }

    if (platform === 'claude') {
      return document.querySelector('main') || document.body;
    }

    if (platform === 'grok') {
      return document.querySelector('main') || document.body;
    }

    return document.body;
  }

  function isScrollable(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    return /(auto|scroll|overlay)/.test(overflowY) && element.scrollHeight > element.clientHeight + 8;
  }

  function findScrollableAncestor(element) {
    let current = element;
    while (current && current !== document.body) {
      if (isScrollable(current)) return current;
      current = current.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function findScrollContainer(platform, root) {
    if (platform === 'chatgpt') {
      const chatgptScrollRoot = document.querySelector('[data-scroll-root]');
      if (chatgptScrollRoot) return chatgptScrollRoot;
    }

    const firstTurn = root && findTurnElements(platform, getConfig(platform), root)[0];
    return findScrollableAncestor(firstTurn || root || document.body);
  }

  function getScrollEventTarget(scrollContainer) {
    if (!scrollContainer || scrollContainer === document.body || scrollContainer === document.documentElement || scrollContainer === document.scrollingElement) {
      return window;
    }
    return scrollContainer;
  }

  function getScrollTop(scrollContainer) {
    if (!scrollContainer || scrollContainer === document.body || scrollContainer === document.documentElement || scrollContainer === document.scrollingElement) {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    return scrollContainer.scrollTop;
  }

  function setScrollTop(scrollContainer, value) {
    if (!scrollContainer || scrollContainer === document.body || scrollContainer === document.documentElement || scrollContainer === document.scrollingElement) {
      window.scrollTo({ top: value, behavior: 'auto' });
      return;
    }
    scrollContainer.scrollTop = value;
  }

  function getScrollMetrics(scrollContainer) {
    if (!scrollContainer || scrollContainer === document.body || scrollContainer === document.documentElement || scrollContainer === document.scrollingElement) {
      const scrollingElement = document.scrollingElement || document.documentElement;
      return {
        scrollTop: getScrollTop(scrollContainer),
        scrollHeight: scrollingElement.scrollHeight,
        clientHeight: window.innerHeight || scrollingElement.clientHeight
      };
    }

    return {
      scrollTop: scrollContainer.scrollTop,
      scrollHeight: scrollContainer.scrollHeight,
      clientHeight: scrollContainer.clientHeight
    };
  }

  function computeViewportState(scrollContainer, capturedCount) {
    const metrics = getScrollMetrics(scrollContainer);
    const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
    const nearTop = metrics.scrollTop <= TOP_EDGE_THRESHOLD_PX;
    const nearBottom = distanceFromBottom <= BOTTOM_EDGE_THRESHOLD_PX;

    return {
      capturedCount,
      nearTop,
      nearBottom,
      hasSeenTop: nearTop,
      hasSeenBottom: nearBottom,
      scrollTop: metrics.scrollTop,
      scrollHeight: metrics.scrollHeight,
      clientHeight: metrics.clientHeight,
      distanceFromBottom,
      lastMutationAt: state.lastMutationAt,
      observedAt: Date.now()
    };
  }

  function isNearViewportEdge(scrollContainer) {
    const metrics = getScrollMetrics(scrollContainer);
    const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
    return metrics.scrollTop <= TOP_EDGE_THRESHOLD_PX || distanceFromBottom <= BOTTOM_EDGE_THRESHOLD_PX;
  }

  function queryAllSafe(root, selector) {
    if (!root || !selector) return [];
    try {
      const elements = [];
      if (root.matches && root.matches(selector)) elements.push(root);
      root.querySelectorAll(selector).forEach(element => elements.push(element));
      return elements;
    } catch (error) {
      console.warn('Chatbot Clipper: invalid selector during capture:', selector, error);
      return [];
    }
  }

  function dedupeElements(elements) {
    return elements.filter((element, index) => {
      if (!element || elements.indexOf(element) !== index) return false;
      return !elements.some(other =>
        other !== element &&
        other.contains &&
        other.contains(element) &&
        other.matches &&
        element.matches(other.tagName ? element.tagName.toLowerCase() : '*')
      );
    });
  }

  function findTurnElements(platform, config, root) {
    if (!config || !config.selectors) return [];

    let turnElements = queryAllSafe(root || document, config.selectors.turnContainer);
    if (turnElements.length === 0 && config.selectors.turnContainerFallback) {
      turnElements = queryAllSafe(root || document, config.selectors.turnContainerFallback);
    }

    return dedupeElements(turnElements);
  }

  function hasTurnContent(role, turnData) {
    if (role === 'user') {
      return !!(turnData.textContent || (turnData.userAttachments && turnData.userAttachments.length > 0));
    }

    if (role === 'assistant') {
      return !!(turnData.contentItems && turnData.contentItems.length > 0);
    }

    return !!(turnData.textContent || (turnData.contentItems && turnData.contentItems.length > 0));
  }

  function getChatGPTTurnNumber(turnElement) {
    if (!turnElement || !turnElement.getAttribute) return null;

    const testId = turnElement.getAttribute('data-testid');
    const match = testId && String(testId).match(/^conversation-turn-(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function isKnownFirstChatGPTUserTurn(platform, turnElement, turnData) {
    return platform === 'chatgpt' &&
      getChatGPTTurnNumber(turnElement) === 1 &&
      turnData &&
      turnData.role === 'user' &&
      hasTurnContent('user', turnData);
  }

  function extractTurnData(platform, config, turnElement, turnIndex, settings) {
    if (!config || !turnElement) return null;
    config.settings = settings || {};

    const role = config.getRole(turnElement) || 'unknown';
    const turnData = {
      turnIndex,
      role,
      textContent: null,
      userAttachments: null,
      contentItems: null
    };

    if (role === 'user') {
      turnData.textContent = config.extractUserText(turnElement);
      const images = typeof config.extractUserUploadedImages === 'function' ? config.extractUserUploadedImages(turnElement) || [] : [];
      const files = typeof config.extractUserUploadedFiles === 'function' ? config.extractUserUploadedFiles(turnElement) || [] : [];
      turnData.userAttachments = [...images, ...files];
    } else if (role === 'assistant') {
      turnData.contentItems = typeof config.extractAssistantContent === 'function' ? config.extractAssistantContent(turnElement) || [] : [];
    } else {
      turnData.textContent = turnElement.textContent ? turnElement.textContent.trim() : null;
    }

    return hasTurnContent(role, turnData) ? turnData : null;
  }

  function attachmentToText(attachment) {
    if (!attachment) return '';
    if (attachment.type === 'image') {
      return [attachment.extractedContent, attachment.sourceUrl || attachment.src].filter(Boolean).join(' ');
    }
    if (attachment.type === 'file') {
      return [attachment.fileName, attachment.fileType, attachment.extractedContent].filter(Boolean).join(' ');
    }
    return [attachment.type, attachment.extractedContent].filter(Boolean).join(' ');
  }

  function contentItemToText(item) {
    if (!item) return '';
    if (item.type === 'text') return item.content || '';
    if (item.type === 'code_block') return item.content || '';
    if (item.type === 'interactive_block') return [item.title, item.artifactType, item.code].filter(Boolean).join('\n');
    if (item.type === 'image') return [item.alt, item.extractedContent, item.src].filter(Boolean).join(' ');
    return item.content || item.text || '';
  }

  function turnToPlainText(turnData) {
    if (!turnData) return '';

    if (turnData.role === 'user') {
      return [
        turnData.textContent || '',
        ...(turnData.userAttachments || []).map(attachmentToText)
      ].filter(Boolean).join('\n\n').trim();
    }

    if (turnData.role === 'assistant') {
      return (turnData.contentItems || []).map(contentItemToText).filter(Boolean).join('\n\n').trim();
    }

    return turnData.textContent || '';
  }

  function getStableMessageId(platform, turnElement) {
    if (!turnElement) return null;

    if (platform === 'chatgpt') {
      const turnId = turnElement.getAttribute('data-turn-id') ||
        turnElement.getAttribute('data-turn-id-container') ||
        turnElement.closest('[data-turn-id-container]')?.getAttribute('data-turn-id-container') ||
        turnElement.getAttribute('data-testid');

      if (turnId) return `chatgpt:${turnId}`;

      const messageElement = turnElement.matches('[data-message-id]')
        ? turnElement
        : turnElement.querySelector('[data-message-id]');
      const messageId = messageElement && messageElement.getAttribute('data-message-id');
      return messageId ? `chatgpt:${messageId}` : null;
    }

    const stableAttribute = ['data-message-id', 'data-response-id', 'data-turn-id', 'data-testid', 'id']
      .map(attribute => turnElement.getAttribute(attribute))
      .find(Boolean);

    return stableAttribute ? `${platform}:${stableAttribute}` : null;
  }

  function getOrderHint(platform, turnElement, scrollContainer, index) {
    const normalizer = getNormalizer();
    const testId = turnElement && turnElement.getAttribute && turnElement.getAttribute('data-testid');
    const stableOrderHint = normalizer && normalizer.getStableTurnOrderHint({ platform, testId });

    if (typeof stableOrderHint === 'number') {
      return stableOrderHint + (index / 1000);
    }

    if (!turnElement || typeof turnElement.getBoundingClientRect !== 'function') {
      return index;
    }

    const elementRect = turnElement.getBoundingClientRect();

    if (!scrollContainer || scrollContainer === document.body || scrollContainer === document.documentElement || scrollContainer === document.scrollingElement) {
      return getScrollTop(scrollContainer) + elementRect.top + (index / 1000);
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    return scrollContainer.scrollTop + elementRect.top - containerRect.top + (index / 1000);
  }

  function buildCapturedMessages(settings, source) {
    const platform = identifyPlatform();
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return { platform: platform || 'unknown', conversationKey: '', messages: [], knownTopReached: false };
    }

    const config = getConfig(platform);
    const normalizer = getNormalizer();
    if (!config || !normalizer || !getCache()) {
      return { platform, conversationKey: getConversationKey(platform), messages: [], knownTopReached: false };
    }

    const conversationKey = getConversationKey(platform);
    resetForCurrentConversation(platform, conversationKey);

    const root = findConversationRoot(platform);
    const scrollContainer = findScrollContainer(platform, root);
    const turnElements = findTurnElements(platform, config, root);
    const messages = [];
    let knownTopReached = false;

    turnElements.forEach((turnElement, index) => {
      try {
        const turnData = extractTurnData(platform, config, turnElement, index, settings);
        if (!turnData) return;
        if (isKnownFirstChatGPTUserTurn(platform, turnElement, turnData)) {
          knownTopReached = true;
        }

        const plainText = turnToPlainText(turnData);
        const normalizedText = normalizer.normalizeText(plainText);
        if (!normalizedText) return;

        messages.push({
          platform,
          conversationKey,
          role: turnData.role,
          stableId: getStableMessageId(platform, turnElement),
          orderHint: getOrderHint(platform, turnElement, scrollContainer, index),
          plainText,
          markdown: plainText,
          normalizedText,
          contentHash: normalizer.hashText(normalizedText),
          prefixHash: normalizer.hashText(normalizedText.slice(0, 120)),
          source,
          turnData
        });
      } catch (error) {
        console.error('Chatbot Clipper: failed to capture a visible turn:', error);
      }
    });

    return { platform, conversationKey, root, scrollContainer, messages, knownTopReached };
  }

  function messageToTurnData(message, turnIndex) {
    if (message.turnData) {
      return { ...message.turnData, turnIndex };
    }

    if (message.role === 'assistant') {
      return {
        turnIndex,
        role: 'assistant',
        textContent: null,
        userAttachments: null,
        contentItems: [{ type: 'text', content: message.markdown || message.plainText }]
      };
    }

    return {
      turnIndex,
      role: message.role || 'user',
      textContent: message.markdown || message.plainText,
      userAttachments: null,
      contentItems: null
    };
  }

  function getCopyMessageToken(message, index) {
    if (!message) return `missing:${index}`;
    return message.stableId || message.messageKey || [
      message.platform,
      message.conversationKey,
      message.role,
      message.contentHash,
      getCopyMessageOrder(message, index)
    ].join('|');
  }

  function getCopyMessageOrder(message, index) {
    if (!message) return index;
    if (isFiniteNumber(message.orderHint)) return message.orderHint;
    if (isFiniteNumber(message.orderKey)) return message.orderKey;
    if (isFiniteNumber(message.sequenceHint)) return message.sequenceHint;
    return index;
  }

  function createCopySnapshot(messages, status) {
    if (!Array.isArray(messages) || messages.length === 0 || !status) return null;

    const entries = messages.map((message, index) => {
      const token = getCopyMessageToken(message, index);
      return {
        token,
        order: getCopyMessageOrder(message, index),
        contentHash: message.contentHash || null
      };
    });
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];

    return {
      platform: status.platform || state.platform || identifyPlatform() || 'unknown',
      conversationKey: status.conversationKey || state.conversationKey || '',
      copiedAt: Date.now(),
      copiedCount: entries.length,
      firstOrder: firstEntry ? firstEntry.order : null,
      lastOrder: lastEntry ? lastEntry.order : null,
      tokenSet: new Set(entries.map(entry => entry.token)),
      contentHashByToken: new Map(entries.map(entry => [entry.token, entry.contentHash])),
      bottomConfirmed: status.hasSeenBottom === true
    };
  }

  function clearCopySnapshots() {
    state.pendingCopySnapshot = null;
    state.lastSuccessfulCopySnapshot = null;
  }

  function findPostCopyStaleMessage(currentMessages) {
    const snapshot = state.lastSuccessfulCopySnapshot;
    if (!snapshot || !Array.isArray(currentMessages) || currentMessages.length === 0) return null;

    const platform = state.platform || identifyPlatform() || 'unknown';
    const conversationKey = state.conversationKey || (SUPPORTED_PLATFORMS.has(platform) ? getConversationKey(platform) : '');
    if (snapshot.conversationKey !== conversationKey) return null;

    for (let index = 0; index < currentMessages.length; index++) {
      const message = currentMessages[index];
      const token = getCopyMessageToken(message, index);
      const previousContentHash = snapshot.contentHashByToken.get(token);

      if (snapshot.tokenSet.has(token)) {
        if (previousContentHash && message.contentHash && previousContentHash !== message.contentHash) {
          return { reason: 'copied-message-updated', token };
        }
        continue;
      }

      const order = getCopyMessageOrder(message, index);
      const isAfterCopiedBottom = snapshot.bottomConfirmed &&
        isFiniteNumber(order) &&
        isFiniteNumber(snapshot.lastOrder) &&
        order > snapshot.lastOrder;

      if (!isAfterCopiedBottom) {
        return { reason: 'missing-message-found', token };
      }
    }

    return null;
  }

  function notifyPostCopyStaleMessage(reason) {
    state.lastSuccessfulCopySnapshot = null;

    try {
      chrome.runtime.sendMessage({
        action: 'show-post-copy-cache-warning',
        reason: reason && reason.reason
      });
    } catch (error) {
      // The warning is best-effort; stale extension contexts can fail during navigation.
    }
  }

  function checkPostCopySnapshot(currentMessages) {
    const staleReason = findPostCopyStaleMessage(currentMessages);
    if (staleReason) {
      notifyPostCopyStaleMessage(staleReason);
    }
  }

  function composeCachedConversation(settings, options = {}) {
    if (!options.skipFinalCapture) {
      performCapture(settings, 'visible-dom');
    }

    const cache = getCache();
    const platform = state.platform || identifyPlatform() || 'unknown';
    const conversationKey = state.conversationKey || getConversationKey(platform);
    const cachedMessages = cache ? cache.getMessages() : [];
    const conversationTurns = cachedMessages.map((message, index) => messageToTurnData(message, index));
    const status = cache ? cache.getStatus() : getStatusSnapshot();
    const responseStatus = {
      ...status,
      platform,
      conversationKey,
      copiedCount: conversationTurns.length,
      cacheSupported: true,
      fullScanAvailable: platform === 'chatgpt',
      scanRunning: state.scan.running,
      passiveEnabled: state.passiveEnabled
    };

    state.pendingCopySnapshot = createCopySnapshot(cachedMessages, responseStatus);

    return {
      data: {
        platform,
        conversationKey,
        conversationTurns
      },
      status: responseStatus
    };
  }

  async function composeLiveConversation(settings) {
    state.pendingCopySnapshot = null;

    const platform = identifyPlatform() || 'unknown';
    const conversationKey = SUPPORTED_PLATFORMS.has(platform) ? getConversationKey(platform) : '';

    if (typeof window.extractConversation !== 'function') {
      throw new Error('Core extraction script is not loaded.');
    }

    const extractedData = await window.extractConversation(settings || {});
    const conversationTurns = Array.isArray(extractedData?.conversationTurns)
      ? extractedData.conversationTurns
      : [];
    const resolvedPlatform = extractedData?.platform || platform;

    return {
      data: {
        ...(extractedData || {}),
        platform: resolvedPlatform,
        conversationKey,
        conversationTurns
      },
      status: {
        platform: resolvedPlatform,
        conversationKey,
        copiedCount: conversationTurns.length,
        capturedCount: 0,
        hasSeenTop: false,
        hasSeenBottom: false,
        mayBeIncomplete: false,
        isEmpty: conversationTurns.length === 0,
        lastCaptureAt: null,
        passiveEnabled: false,
        cacheSupported: false,
        fullScanAvailable: false,
        scanRunning: false
      }
    };
  }

  async function composeConversationForCopy(settings, options = {}) {
    const platform = identifyPlatform();
    if (!isCacheEnabledPlatform(platform)) {
      stopPassiveCaptureListeners();
      return composeLiveConversation(settings);
    }

    return composeCachedConversation(settings, options);
  }

  function hasOptimisticTop(status) {
    const top = status && status.edgeState && status.edgeState.top;
    return !!(top && top.phase === 'confirmed' && top.source === 'optimistic');
  }

  async function recheckOptimisticTopBeforeCopy(result, settings) {
    if (!hasOptimisticTop(result && result.status)) return result;

    await wait(OPTIMISTIC_COPY_RECHECK_MS);
    return composeConversationForCopy(settings);
  }

  function disconnectObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
  }

  function disconnectScrollListener() {
    if (state.scrollTarget) {
      state.scrollTarget.removeEventListener('scroll', handleScroll, { passive: true });
      state.scrollTarget = null;
    }
    state.scrollContainer = null;
  }

  function stopPassiveCaptureListeners() {
    disconnectObserver();
    disconnectScrollListener();
    state.conversationRoot = null;
  }

  function setupObservers(root, scrollContainer) {
    if (root && root !== state.conversationRoot) {
      disconnectObserver();
      state.conversationRoot = root;
      state.observer = new MutationObserver(() => {
        state.lastMutationAt = Date.now();
        captureNowThrottled(MUTATION_CAPTURE_THROTTLE_MS);
        scheduleCapture(PASSIVE_DEBOUNCE_MS);
      });
      state.observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    const target = getScrollEventTarget(scrollContainer);
    if (target !== state.scrollTarget) {
      if (state.scrollTarget) {
        state.scrollTarget.removeEventListener('scroll', handleScroll, { passive: true });
      }

      state.scrollTarget = target;
      state.scrollContainer = scrollContainer;

      if (target) {
        target.addEventListener('scroll', handleScroll, { passive: true });
      }
    }
  }

  function handleScroll() {
    if (isNearViewportEdge(state.scrollContainer)) {
      performCapture(state.lastFormatSettings, 'passive-cache');
    } else {
      captureNowThrottled(SCROLL_CAPTURE_THROTTLE_MS);
    }
    scheduleCapture(PASSIVE_DEBOUNCE_MS);
  }

  function performCapture(settings = state.lastFormatSettings, source = 'passive-cache') {
    const currentPlatform = identifyPlatform();
    if (!isCacheEnabledPlatform(currentPlatform)) {
      if (source === 'passive-cache') {
        stopPassiveCaptureListeners();
      }
      return getStatusSnapshot();
    }

    if (source === 'passive-cache' && !state.passiveEnabled) {
      return getStatusSnapshot();
    }

    if (source === 'passive-cache' && state.captureInProgress) {
      state.pendingCapture = true;
      return getStatusSnapshot();
    }

    if (source === 'passive-cache') {
      state.captureInProgress = true;
    }

    state.lastFormatSettings = settings || state.lastFormatSettings || {};

    try {
      const result = buildCapturedMessages(state.lastFormatSettings, source);
      const cache = getCache();

      if (result.root && result.scrollContainer) {
        setupObservers(result.root, result.scrollContainer);
      }

      if (cache && result.messages.length > 0) {
        cache.captureMessages(result.messages);
        const viewportState = computeViewportState(result.scrollContainer, result.messages.length);
        if (result.knownTopReached) {
          viewportState.knownTopReached = true;
        } else if (viewportState.nearTop) {
          viewportState.optimisticTopReached = true;
        }
        if (state.initialBottomCapturePending && viewportState.nearBottom) {
          viewportState.knownBottomReached = true;
        }
        state.initialBottomCapturePending = false;
        cache.markViewportState(viewportState);
        const captureStatus = cache.getStatus();
        checkPostCopySnapshot(cache.getMessages());
        if (source === 'passive-cache' && hasPendingEdgeSettlement(captureStatus)) {
          scheduleEdgeSettleCapture(captureStatus);
        }
      }

      if (source === 'passive-cache') {
        state.lastPassiveCaptureAt = Date.now();
      }

      return getStatusSnapshot();
    } finally {
      if (source === 'passive-cache') {
        state.captureInProgress = false;
        if (state.pendingCapture) {
          state.pendingCapture = false;
          scheduleCapture(0);
        }
      }
    }
  }

  function captureNowThrottled(minInterval) {
    if (!state.passiveEnabled) return;

    const elapsed = Date.now() - state.lastPassiveCaptureAt;
    if (elapsed >= minInterval) {
      if (state.throttleTimer) {
        clearTimeout(state.throttleTimer);
        state.throttleTimer = null;
      }
      performCapture(state.lastFormatSettings, 'passive-cache');
      return;
    }

    if (!state.throttleTimer) {
      state.throttleTimer = setTimeout(() => {
        state.throttleTimer = null;
        performCapture(state.lastFormatSettings, 'passive-cache');
      }, Math.max(minInterval - elapsed, 0));
    }
  }

  function scheduleCapture(delay = PASSIVE_DEBOUNCE_MS) {
    if (state.captureTimer) clearTimeout(state.captureTimer);
    state.captureTimer = setTimeout(() => {
      state.captureTimer = null;
      performCapture(state.lastFormatSettings, 'passive-cache');
    }, delay);
  }

  function hasPendingEdgeSettlement(status) {
    const edgeState = status && status.edgeState;
    return !!(
      edgeState &&
      (
        edgeState.top && edgeState.top.phase === 'candidate' ||
        edgeState.bottom && edgeState.bottom.phase === 'candidate'
      )
    );
  }

  function scheduleEdgeSettleCapture(status) {
    const settleMs = Number(status && status.edgeSettleMs) || EDGE_SETTLE_RECHECK_FALLBACK_MS;
    scheduleCapture(Math.max(settleMs + 50, PASSIVE_DEBOUNCE_MS));
  }

  function isEdgeConfirmed(status, edgeName) {
    if (!status) return false;
    return edgeName === 'top' ? status.hasSeenTop === true : status.hasSeenBottom === true;
  }

  function setScrollToEdge(scrollContainer, edgeName) {
    if (edgeName === 'top') {
      setScrollTop(scrollContainer, 0);
      return;
    }

    const metrics = getScrollMetrics(scrollContainer);
    setScrollTop(scrollContainer, Math.max(metrics.scrollHeight - metrics.clientHeight, 0));
  }

  async function settleFullScanEdge(edgeName, scrollContainer, settings, stopAt) {
    const deadline = Math.min(Date.now() + FULL_SCAN_EDGE_SETTLE_MAX_MS, stopAt || Number.POSITIVE_INFINITY);
    let status = getStatusSnapshot();

    while (!isEdgeConfirmed(status, edgeName) && !state.scan.cancelRequested && Date.now() < deadline) {
      setScrollToEdge(scrollContainer, edgeName);
      await wait(FULL_SCAN_WAIT_MS);
      performCapture(settings, 'full-scan');
      status = getStatusSnapshot();
    }

    return {
      status,
      confirmed: isEdgeConfirmed(status, edgeName),
      cancelled: state.scan.cancelRequested
    };
  }

  function getStatusSnapshot() {
    const platform = identifyPlatform() || state.platform || 'unknown';
    const conversationKey = SUPPORTED_PLATFORMS.has(platform) ? getConversationKey(platform) : (state.conversationKey || '');
    const cacheSupported = isCacheEnabledPlatform(platform);
    const cache = cacheSupported ? getCache() : null;

    if (cacheSupported) {
      resetForCurrentConversation(platform, conversationKey);
    }

    const cacheStatus = cache ? cache.getStatus() : {
      platform,
      conversationKey,
      capturedCount: 0,
      hasSeenTop: false,
      hasSeenBottom: false,
      mayBeIncomplete: false,
      isEmpty: true,
      lastCaptureAt: null
    };

    return {
      ...cacheStatus,
      platform,
      conversationKey,
      passiveEnabled: cacheSupported && state.passiveEnabled,
      cacheSupported,
      fullScanAvailable: platform === 'chatgpt',
      scanRunning: state.scan.running
    };
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function runChatGPTFullScan(settings = state.lastFormatSettings) {
    const platform = identifyPlatform();
    if (platform !== 'chatgpt') {
      return { success: false, error: getMessage('statusFullScanFailed'), status: getStatusSnapshot() };
    }

    if (state.scan.running) {
      return { success: false, error: getMessage('statusFullScanRunning'), status: getStatusSnapshot() };
    }

    state.scan.running = true;
    state.scan.cancelRequested = false;
    state.lastFormatSettings = settings || {};

    const root = findConversationRoot(platform);
    const scrollContainer = findScrollContainer(platform, root);
    setupObservers(root, scrollContainer);

    const originalScrollTop = getScrollTop(scrollContainer);
    const startTime = Date.now();
    let stopped = false;

    try {
      setScrollTop(scrollContainer, 0);
      await wait(FULL_SCAN_WAIT_MS + 200);
      performCapture(state.lastFormatSettings, 'full-scan');
      const topSettle = await settleFullScanEdge('top', scrollContainer, state.lastFormatSettings, startTime + FULL_SCAN_MAX_MS);
      if (topSettle.cancelled) stopped = true;

      for (let step = 0; !stopped && step < FULL_SCAN_MAX_STEPS; step++) {
        if (state.scan.cancelRequested || Date.now() - startTime > FULL_SCAN_MAX_MS) {
          stopped = true;
          break;
        }

        const metrics = getScrollMetrics(scrollContainer);
        const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
        if (distanceFromBottom <= FULL_SCAN_BOTTOM_EDGE_THRESHOLD_PX) break;

        const stepSize = Math.max(Math.floor(metrics.clientHeight * 0.75), 420);
        const nextScrollTop = Math.min(metrics.scrollTop + stepSize, metrics.scrollHeight - metrics.clientHeight);
        if (nextScrollTop <= metrics.scrollTop + 2) break;

        setScrollTop(scrollContainer, nextScrollTop);
        await wait(FULL_SCAN_WAIT_MS);
        performCapture(state.lastFormatSettings, 'full-scan');
      }

      if (stopped) {
        return { success: false, stopped: true, status: getStatusSnapshot() };
      }

      setScrollToEdge(scrollContainer, 'bottom');
      await wait(FULL_SCAN_WAIT_MS);
      performCapture(state.lastFormatSettings, 'full-scan');
      const bottomSettle = await settleFullScanEdge('bottom', scrollContainer, state.lastFormatSettings, startTime + FULL_SCAN_MAX_MS);
      if (bottomSettle.cancelled) {
        return { success: false, stopped: true, status: getStatusSnapshot() };
      }

      return { success: true, ...composeCachedConversation(state.lastFormatSettings, { skipFinalCapture: true }) };
    } finally {
      setScrollTop(scrollContainer, originalScrollTop);
      state.scan.running = false;
      state.scan.cancelRequested = false;
      scheduleCapture(300);
    }
  }

  function stopChatGPTFullScan() {
    if (state.scan.running) {
      state.scan.cancelRequested = true;
      return { success: true, status: getStatusSnapshot() };
    }

    return { success: false, error: getMessage('statusStopFullScanError'), status: getStatusSnapshot() };
  }

  function startRouteWatcher() {
    if (state.routeTimer) return;

    state.routeTimer = setInterval(() => {
      const platform = identifyPlatform();
      const conversationKey = SUPPORTED_PLATFORMS.has(platform) ? getConversationKey(platform) : '';

      if (window.location.href !== state.lastUrl || (conversationKey && conversationKey !== state.conversationKey)) {
        state.lastUrl = window.location.href;
        state.conversationRoot = null;
        state.scrollContainer = null;
        if (isCacheEnabledPlatform(platform) && conversationKey) {
          resetForCurrentConversation(platform, conversationKey);
          scheduleCapture(250);
        } else {
          stopPassiveCaptureListeners();
        }
      }
    }, ROUTE_CHECK_MS);
  }

  function loadStoredSettings() {
    try {
      chrome.storage.local.get(['formatSettings', 'captureSettings'], data => {
        state.lastFormatSettings = data.formatSettings || {};
        state.passiveEnabled = !data.captureSettings || data.captureSettings.passiveCaptureEnabled !== false;
        if (state.passiveEnabled && isCacheEnabledPlatform(identifyPlatform())) {
          scheduleCapture(250);
        } else {
          stopPassiveCaptureListeners();
        }
      });
    } catch (error) {
      if (isCacheEnabledPlatform(identifyPlatform())) {
        scheduleCapture(250);
      }
    }
  }

  function initializePassiveCapture() {
    loadStoredSettings();
    startRouteWatcher();

    window.addEventListener('pagehide', () => {
      const cache = state.cache;
      if (cache) cache.clear({ platform: state.platform, conversationKey: state.conversationKey });
    });

    window.addEventListener('pageshow', event => {
      if (event.persisted && isCacheEnabledPlatform(identifyPlatform())) {
        scheduleCapture(250);
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isCacheEnabledPlatform(identifyPlatform())) {
        scheduleCapture(250);
      }
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractRawData' || request.action === 'extractCachedConversation' || request.action === 'extractCachedConversationV3') {
      (async () => {
        try {
        const settings = request.settings || state.lastFormatSettings || {};
        let result = await composeConversationForCopy(settings);
        result = await recheckOptimisticTopBeforeCopy(result, settings);
        if (!result.data.conversationTurns.length) {
          sendResponse({
            error: `No conversation content found on ${result.status.platform || 'the current page'}. Make sure messages have appeared in this tab.`,
            status: result.status
          });
          return true;
        }

        sendResponse(result);
        } catch (error) {
          console.error('Chatbot Clipper: extraction failed:', error);
          sendResponse({ error: error.message || 'Extraction failed', status: getStatusSnapshot() });
        }
      })();
      return true;
    }

    if (request.action === 'getCaptureStatus' || request.action === 'getCaptureStatusV3') {
      if (state.passiveEnabled) performCapture(state.lastFormatSettings, 'passive-cache');
      sendResponse({ success: true, status: getStatusSnapshot() });
      return true;
    }

    if (request.action === 'setPassiveCaptureEnabled' || request.action === 'setPassiveCaptureEnabledV3') {
      state.passiveEnabled = request.enabled !== false;
      if (state.passiveEnabled && isCacheEnabledPlatform(identifyPlatform())) {
        scheduleCapture(50);
      }
      sendResponse({ success: true, status: getStatusSnapshot() });
      return true;
    }

    if (request.action === 'clearCaptureCache' || request.action === 'clearCaptureCacheV3') {
      const platform = identifyPlatform() || state.platform || 'unknown';
      const conversationKey = SUPPORTED_PLATFORMS.has(platform) ? getConversationKey(platform) : (state.conversationKey || '');
      const cache = isCacheEnabledPlatform(platform) ? getCache() : state.cache;
      if (cache) cache.clear({ platform, conversationKey });
      state.platform = platform;
      state.conversationKey = conversationKey;
      state.initialBottomCapturePending = true;
      clearCopySnapshots();
      sendResponse({ success: true, status: getStatusSnapshot() });
      return true;
    }

    if (request.action === 'recordSuccessfulCopySnapshotV3') {
      if (
        request.status &&
        request.status.cacheSupported !== false &&
        request.status.mayBeIncomplete === false &&
        state.pendingCopySnapshot &&
        state.pendingCopySnapshot.conversationKey === request.status.conversationKey
      ) {
        state.lastSuccessfulCopySnapshot = state.pendingCopySnapshot;
        state.pendingCopySnapshot = null;
        const cache = getCache();
        if (cache) checkPostCopySnapshot(cache.getMessages());
        sendResponse({ success: true });
        return true;
      }

      clearCopySnapshots();
      sendResponse({ success: false });
      return true;
    }

    if (request.action === 'clearCopySnapshotV3') {
      clearCopySnapshots();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'startChatGPTFullScan' || request.action === 'startChatGPTFullScanV3') {
      runChatGPTFullScan(request.settings || state.lastFormatSettings || {})
        .then(sendResponse)
        .catch(error => {
          console.error('Chatbot Clipper: Full Scan failed:', error);
          sendResponse({ success: false, error: error.message || getMessage('statusFullScanFailed'), status: getStatusSnapshot() });
        });
      return true;
    }

    if (request.action === 'stopChatGPTFullScan' || request.action === 'stopChatGPTFullScanV3') {
      sendResponse(stopChatGPTFullScan());
      return true;
    }

    if (request.action === 'getDebugInfo') {
      sendResponse({
        debugInfo: {
          initialized: window.qaClipperInitialized,
          url: window.location.href,
          hostname: window.location.hostname,
          claudeConfigLoaded: !!window.claudeConfig,
          chatgptConfigLoaded: !!window.chatgptConfig,
          geminiConfigLoaded: !!window.geminiConfig,
          grokConfigLoaded: !!window.grokConfig,
          extractConversationLoaded: !!window.extractConversation,
          messageNormalizerLoaded: !!getNormalizer(),
          captureCacheLoaded: !!getCache(),
          contentVersion: window.qaClipperContentVersion,
          captureStatus: getStatusSnapshot(),
          documentReady: document.readyState === 'complete',
          iframesCount: document.querySelectorAll('iframe').length,
          mainContentPresent: !!document.querySelector('main')
        }
      });
      return true;
    }

    if (request.action === 'ping') {
      sendResponse({
        pong: true,
        url: window.location.href,
        hostname: window.location.hostname,
        status: {
          claudeConfigLoaded: !!window.claudeConfig,
          chatgptConfigLoaded: !!window.chatgptConfig,
          geminiConfigLoaded: !!window.geminiConfig,
          grokConfigLoaded: !!window.grokConfig,
          extractConversationLoaded: !!window.extractConversation,
          messageNormalizerLoaded: !!getNormalizer(),
          captureCacheLoaded: !!getCache(),
          contentVersion: window.qaClipperContentVersion
        }
      });
      return true;
    }

    if (request.action === 'scripts-injected') {
      scheduleCapture(100);
      sendResponse({ success: true });
      return true;
    }

    return false;
  });

  initializePassiveCapture();
})();

// --- END OF FILE content.js ---
