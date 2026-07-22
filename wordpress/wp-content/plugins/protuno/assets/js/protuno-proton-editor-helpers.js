(function ($) {
	'use strict';
	var UichSHE = window.UichUiChemyComposerEditor;
	if (!UichSHE || UichSHE.__uichUiChemyComposerHelpersRegistered) {
		return;
	}
	UichSHE.__uichUiChemyComposerHelpersRegistered = true;

	// Debounce helper (optional .cancel() clears the pending invocation)
	function debounce(func, wait) {
		let timeout;
		const wrapped = function (...args) {
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				timeout = undefined;
				func.apply(this, args);
			}, wait);
		};
		wrapped.cancel = function () {
			clearTimeout(timeout);
			timeout = undefined;
		};
		return wrapped;
	}


	function normalizeSharedSiteCodeValue(value) {
		return typeof value === 'string' ? value : '';
	}

	function setSharedSiteCustomCode(nextHead, nextFooter) {
		const normalizedHead = normalizeSharedSiteCodeValue(nextHead);
		const normalizedFooter = normalizeSharedSiteCodeValue(nextFooter);
		if (UichSHE.sharedSiteCustomCode.head !== normalizedHead || UichSHE.sharedSiteCustomCode.footer !== normalizedFooter) {
			UichSHE.sharedSiteCustomCodeRevision += 1;
		}
		UichSHE.sharedSiteCustomCode.head = normalizedHead;
		UichSHE.sharedSiteCustomCode.footer = normalizedFooter;
		UichSHE.sharedSiteCustomCodeInitialized = true;
	}

	function initializeSharedSiteCustomCodeFromLocalizedData() {
		if (UichSHE.sharedSiteCustomCodeInitialized) {
			return;
		}
		const config = window.uichComposerEditorCfg || {};
		const siteCode = config.siteCode || {};
		setSharedSiteCustomCode(
			siteCode.head || '',
			siteCode.footer || ''
		);
	}

	function fetchSharedSiteCustomCode() {
		const config = window.uichComposerEditorCfg || {};
		if (!config.ajaxUrl || !config.ajaxNonce) {
			return Promise.resolve(UichSHE.sharedSiteCustomCode);
		}
		const requestRevision = UichSHE.sharedSiteCustomCodeRevision;

		return new Promise((resolve) => {
			$.ajax({
				url: config.ajaxUrl,
				type: 'POST',
				dataType: 'json',
				data: {
					action: 'uichemy_composer_get_site_custom_code',
					nonce: config.ajaxNonce
				}
			}).done((response) => {
				// If local edits happened after this fetch started, keep the newer local state.
				if (requestRevision !== UichSHE.sharedSiteCustomCodeRevision) {
					resolve(UichSHE.sharedSiteCustomCode);
					return;
				}
				if (UichSHE.sharedSiteCodeHasPendingLocalChanges) {
					resolve(UichSHE.sharedSiteCustomCode);
					return;
				}
				if (response && response.success && response.data) {
					setSharedSiteCustomCode(response.data.head || '', response.data.footer || '');
				}
				resolve(UichSHE.sharedSiteCustomCode);
			}).fail(() => {
				resolve(UichSHE.sharedSiteCustomCode);
			});
		});
	}

	function saveSharedSiteCustomCode(nextHead, nextFooter) {
		setSharedSiteCustomCode(nextHead, nextFooter);
		UichSHE.sharedSiteCodeHasPendingLocalChanges = true;

		const config = window.uichComposerEditorCfg || {};
		if (!config.ajaxUrl || !config.ajaxNonce) {
			return;
		}

		if (UichSHE.sharedSiteCodeSaveTimeout) {
			clearTimeout(UichSHE.sharedSiteCodeSaveTimeout);
		}

		UichSHE.sharedSiteCodeSaveTimeout = setTimeout(() => {
			const saveRevision = UichSHE.sharedSiteCustomCodeRevision;
			$.ajax({
				url: config.ajaxUrl,
				type: 'POST',
				dataType: 'json',
				data: {
					action: 'uichemy_composer_save_site_custom_code',
					nonce: config.ajaxNonce,
					head: UichSHE.sharedSiteCustomCode.head,
					footer: UichSHE.sharedSiteCustomCode.footer
				}
			}).done(() => {
				// Only mark as synced if no newer local edit happened.
				if (saveRevision === UichSHE.sharedSiteCustomCodeRevision) {
					UichSHE.sharedSiteCodeHasPendingLocalChanges = false;
				}
			});
		}, 350);
	}

	function applySharedSiteCustomCodeToSettings(widgetSettings, panelView) {
		if (!UichSHE.sharedSiteCustomCodeInitialized || !widgetSettings || typeof widgetSettings.get !== 'function') {
			return;
		}

		const updates = {};
		const currentHead = normalizeSharedSiteCodeValue(widgetSettings.get('site_custom_code_head') || '');
		const currentFooter = normalizeSharedSiteCodeValue(widgetSettings.get('site_custom_code_footer') || '');

		if (currentHead !== UichSHE.sharedSiteCustomCode.head) {
			updates.site_custom_code_head = UichSHE.sharedSiteCustomCode.head;
		}
		if (currentFooter !== UichSHE.sharedSiteCustomCode.footer) {
			updates.site_custom_code_footer = UichSHE.sharedSiteCustomCode.footer;
		}

		Object.keys(updates).forEach((settingKey) => {
			const nextValue = updates[settingKey];

			if (panelView && panelView.$el) {
				const controlInput = panelView.$el.find(`[data-setting="${settingKey}"]`);
				if (controlInput.length) {
					controlInput.val(nextValue).trigger('input').trigger('change');
				}
			}

			widgetSettings.set(settingKey, nextValue);
		});
	}

	function destroyUiChemyComposerCodeEditorById(editorId) {
		if (!editorId || !UichSHE.floatingCodeEditors[editorId]) {
			return;
		}
		const editor = UichSHE.floatingCodeEditors[editorId];
		if (editor && editor.codemirror && typeof editor.codemirror.toTextArea === 'function') {
			editor.codemirror.toTextArea();
		}
		delete UichSHE.floatingCodeEditors[editorId];
	}

	function initializeUiChemyComposerCodeEditor(textarea, languageKey) {
		if (!textarea || !textarea.id || !languageKey) {
			return null;
		}

		destroyUiChemyComposerCodeEditorById(textarea.id);

		if (!window.wp || !wp.codeEditor || typeof wp.codeEditor.initialize !== 'function') {
			return null;
		}

		const allSettings = window.uichComposerEditorCfg || {};
		const editorSettings = allSettings[languageKey] || getFallbackUiChemyComposerEditorSettings(languageKey);

		const editor = wp.codeEditor.initialize(textarea, editorSettings);
		if (editor && editor.codemirror) {
			editor.codemirror.setOption('lineNumbers', true);
			editor.codemirror.setOption('lineWrapping', false);
			editor.codemirror.setSize('100%', '100%');

			// Scope autocomplete suggestions inside the floating panel to prevent them
			// from showing up "outside" (detached on document body).
			const panelContainer = textarea.closest('.uichemy-composer-floating-panel');
			if (panelContainer) {
				editor.codemirror.setOption('hintOptions', {
					container: panelContainer
				});
			}
		}
		UichSHE.floatingCodeEditors[textarea.id] = editor;
		return editor;
	}

	function refreshUiChemyComposerCodeEditors() {
		Object.keys(UichSHE.floatingCodeEditors).forEach((editorId) => {
			const editor = UichSHE.floatingCodeEditors[editorId];
			if (editor && editor.codemirror && typeof editor.codemirror.refresh === 'function') {
				editor.codemirror.refresh();
			}
		});
	}

	function normalizeUiChemyComposerLineEndings(value) {
		return String(value || '').replace(/\r\n?/g, '\n');
	}

	function getFallbackUiChemyComposerEditorSettings(languageKey) {
		const fallbackModes = {
			html: 'htmlmixed',
			svg: 'xml',
			css: 'css',
			js: 'javascript'
		};
		const defaultSettings = (window.wp && wp.codeEditor && wp.codeEditor.defaultSettings)
			? wp.codeEditor.defaultSettings
			: {};
		const codemirrorSettings = Object.assign({}, defaultSettings.codemirror || {}, {
			mode: fallbackModes[languageKey] || 'htmlmixed',
			lineNumbers: true,
			lineWrapping: false,
			indentUnit: 2,
			tabSize: 2,
			matchBrackets: true,
			autoCloseBrackets: true
		});
		return Object.assign({}, defaultSettings, {
			codemirror: codemirrorSettings
		});
	}

	function getUiChemyComposerEditorValueById(editorId) {
		const editor = UichSHE.floatingCodeEditors[editorId];
		if (editor && editor.codemirror) {
			return editor.codemirror.getValue();
		}
		const textarea = document.getElementById(editorId);
		return textarea ? textarea.value : '';
	}

	function setUiChemyComposerEditorValueById(editorId, value, shouldNotify) {
		const nextValue = typeof value === 'string' ? value : '';
		const editor = UichSHE.floatingCodeEditors[editorId];
		if (editor && editor.codemirror) {
			if (editor.codemirror.getValue() !== nextValue) {
				editor.codemirror.setValue(nextValue);
			}
			if (shouldNotify && editor.codemirror.refresh) {
				editor.codemirror.refresh();
			}
			return;
		}

		const textarea = document.getElementById(editorId);
		if (!textarea) {
			return;
		}
		if (textarea.value !== nextValue) {
			textarea.value = nextValue;
		}
		if (shouldNotify) {
			textarea.dispatchEvent(new Event('input'));
		}
	}

	function uiChemyComposerDebugLog() { }

	function uiChemyComposerDebugWarn() { }

	function isPathSkippableElement(node) {
		if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.tagName) {
			return false;
		}
		const tagName = node.tagName.toUpperCase();
		return UichSHE.IGNORE_TAGS.includes(tagName) || UichSHE.LAYER_SKIP_TAGS.includes(tagName);
	}

	function getPathRelevantChildren(node) {
		if (!node || !node.childNodes) {
			return [];
		}
		const children = [];
		for (let i = 0; i < node.childNodes.length; i++) {
			const child = node.childNodes[i];
			if (child.nodeType === Node.ELEMENT_NODE) {
				if (isPathSkippableElement(child)) {
					continue;
				}
				children.push(child);
				continue;
			}
			if (child.nodeType === Node.TEXT_NODE && String(child.nodeValue || '').trim() !== '') {
				children.push(child);
			}
		}
		return children;
	}

	/**
	 * Reorders only path-relevant children of parentNode to match newOrderNodes,
	 * preserving non-path nodes (whitespace, skipped tags) in their relative slots.
	 * newOrderNodes must be a permutation of getPathRelevantChildren(parentNode).
	 */
	function reorderPathRelevantChildren(parentNode, newOrderNodes) {
		if (!parentNode || !parentNode.childNodes || !newOrderNodes || !newOrderNodes.length) {
			return false;
		}
		const currentPath = getPathRelevantChildren(parentNode);
		if (currentPath.length !== newOrderNodes.length) {
			return false;
		}
		const pathSet = new Set(newOrderNodes);
		if (pathSet.size !== newOrderNodes.length) {
			return false;
		}
		for (let i = 0; i < currentPath.length; i++) {
			if (!pathSet.has(currentPath[i])) {
				return false;
			}
		}
		const full = Array.from(parentNode.childNodes);
		let pathCursor = 0;
		const merged = full.map((child) => {
			if (pathSet.has(child)) {
				return newOrderNodes[pathCursor++];
			}
			return child;
		});
		if (pathCursor !== newOrderNodes.length) {
			return false;
		}
		let ref = null;
		for (let i = merged.length - 1; i >= 0; i--) {
			parentNode.insertBefore(merged[i], ref);
			ref = merged[i];
		}
		return true;
	}

	function getPreviewElementLayerPath(element, containerEl) {
		if (!element || !containerEl || !containerEl.contains(element)) {
			return '';
		}

		const indices = [];
		let node = element;
		while (node && node !== containerEl) {
			const parent = node.parentNode;
			if (!parent || !parent.childNodes) {
				return '';
			}
			const pathChildren = getPathRelevantChildren(parent);
			const index = pathChildren.indexOf(node);
			if (index < 0) {
				return '';
			}
			indices.push(index);
			node = parent;
		}

		if (node !== containerEl) {
			return '';
		}
		return `root.${indices.reverse().join('.')}`;
	}

	function getPreviewSelectionTargetFromEvent(event, containerEl) {
		if (!event || !containerEl) {
			return null;
		}

		const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
		if (path && path.length) {
			for (let i = 0; i < path.length; i++) {
				const candidate = path[i];
				if (candidate && candidate.nodeType === 1 && containerEl.contains(candidate)) {
					return candidate;
				}
			}
		}

		const target = event.target && event.target.nodeType === 1 ? event.target : null;
		if (target && containerEl.contains(target)) {
			return target;
		}

		return null;
	}

	function getFirstSelectableContentElement(containerEl) {
		if (!containerEl || !containerEl.childNodes) {
			return null;
		}
		const pathChildren = getPathRelevantChildren(containerEl);
		for (let i = 0; i < pathChildren.length; i++) {
			const child = pathChildren[i];
			if (!child || child.nodeType !== Node.ELEMENT_NODE) {
				continue;
			}
			return child;
		}
		return null;
	}

	function normalizeLayerPath(layerPath) {
		if (!layerPath) {
			return '';
		}

		const normalized = String(layerPath)
			.trim()
			.replace(/\.+/g, '.')
			.replace(/^\.+/, '')
			.replace(/\.+$/, '');

		if (!normalized) {
			return '';
		}

		if (normalized === 'root' || normalized.indexOf('root.') === 0) {
			return normalized;
		}

		return `root.${normalized}`;
	}

	function getLayerPathCandidates(layerPath) {
		const normalized = normalizeLayerPath(layerPath);
		if (!normalized) {
			return [];
		}

		const candidates = [];
		const seen = new Set();
		const segments = normalized.split('.').filter(Boolean);

		function pushCandidate(path) {
			if (!path || seen.has(path)) {
				return;
			}
			seen.add(path);
			candidates.push(path);
		}

		function pushWithAncestors(path) {
			let cursor = path;
			while (cursor) {
				pushCandidate(cursor);
				if (cursor === 'root') {
					break;
				}
				const lastDot = cursor.lastIndexOf('.');
				cursor = lastDot > 0 ? cursor.slice(0, lastDot) : 'root';
			}
		}

		pushWithAncestors(normalized);

		// If preview markup has extra wrappers (for example document/body normalization),
		// progressively trim leading levels and retry.
		if (segments.length > 2 && segments[0] === 'root') {
			for (let i = 1; i < segments.length - 1; i++) {
				const shifted = ['root'].concat(segments.slice(i + 1)).join('.');
				pushWithAncestors(shifted);
			}
		}

		return candidates;
	}

	function isUiChemyComposerWidgetEditorActive() {
		if (document.body && document.body.classList.contains('uichemy-composer-active')) {
			return true;
		}
		try {
			if (window.parent && window.parent.document && window.parent.document.body) {
				return window.parent.document.body.classList.contains('uichemy-composer-active');
			}
		} catch (e) {
			return false;
		}
		return false;
	}

	function ensureSelectedWidgetHoverStyle(view) {
		if (!view || !view.$el || !view.$el.length) {
			return;
		}

		const previewDocument = view.$el[0].ownerDocument;
		if (!previewDocument) {
			return;
		}

		const styleId = 'uichemy-composer-widget-hover-outline-style';
		if (previewDocument.getElementById(styleId)) {
			return;
		}

		const style = previewDocument.createElement('style');
		style.id = styleId;
		style.textContent = `
			.elementor-element.uichemy-composer-widget-selected .elementor-widget-container .uichemy-composer-widget-hover-target {
				outline: 1px dashed #6a7380 !important;
				outline-offset: 2px !important;
				box-shadow: 0 0 0 1px rgba(106, 115, 128, 0.25) !important;
			}
			.elementor-element.uichemy-composer-widget-selected .elementor-widget-container .uichemy-composer-widget-selected-target {
				outline: 2px dashed #6a7380 !important;
				outline-offset: 2px !important;
				box-shadow: 0 0 0 1px rgba(106, 115, 128, 0.45) !important;
			}
		`;
		previewDocument.head.appendChild(style);
	}

	function clearPreviewHoverTarget() {
		if (UichSHE.activePreviewHoverElement && UichSHE.activePreviewHoverElement.classList) {
			UichSHE.activePreviewHoverElement.classList.remove('uichemy-composer-widget-hover-target');
		}
		UichSHE.activePreviewHoverElement = null;
	}

	function clearPreviewSelectedTarget() {
		if (UichSHE.activePreviewSelectedElement && UichSHE.activePreviewSelectedElement.classList) {
			UichSHE.activePreviewSelectedElement.classList.remove('uichemy-composer-widget-selected-target');
		}
		UichSHE.activePreviewSelectedElement = null;
	}

	function resolvePreviewNodeByLayerPath(rootNode, path) {
		if (!rootNode || !path) return null;
		const segments = String(path).split('.').slice(1);
		let current = rootNode;
		for (let i = 0; i < segments.length; i++) {
			const childIndex = parseInt(segments[i], 10);
			const pathChildren = getPathRelevantChildren(current);
			if (!current || Number.isNaN(childIndex) || !pathChildren[childIndex]) {
				return null;
			}
			current = pathChildren[childIndex];
		}
		return current;
	}

	function syncPreviewSelectedTargetByPath(layerPath) {
		const pathTrim = String(layerPath || '').trim();
		if (pathTrim) {
			UichSHE.uiChemyComposerPreviewSelectionPathCache = pathTrim;
		} else {
			UichSHE.uiChemyComposerPreviewSelectionPathCache = '';
		}
		clearPreviewSelectedTarget();
		if (!pathTrim) {
			return;
		}
		if (!UichSHE.activeWidgetPreviewView || !UichSHE.activeWidgetPreviewView.$el || !UichSHE.activeWidgetPreviewView.$el.length) return;
		const widgetContainer = UichSHE.activeWidgetPreviewView.$el.find('.elementor-widget-container');
		if (!widgetContainer.length) return;
		const containerEl = widgetContainer[0];
		const layerRoot = getLayerRoot(containerEl) || containerEl;
		const candidates = getLayerPathCandidates(pathTrim);

		let matchedNode = null;
		for (let i = 0; i < candidates.length; i++) {
			matchedNode = resolvePreviewNodeByLayerPath(layerRoot, candidates[i]);
			if (!matchedNode && layerRoot !== containerEl) {
				matchedNode = resolvePreviewNodeByLayerPath(containerEl, candidates[i]);
			}
			if (matchedNode) break;
		}
		if (!matchedNode || matchedNode.nodeType !== Node.ELEMENT_NODE) return;
		if (matchedNode === containerEl) {
			matchedNode = getFirstSelectableContentElement(containerEl);
			if (!matchedNode) return;
		}
		UichSHE.activePreviewSelectedElement = matchedNode;
		UichSHE.activePreviewSelectedElement.classList.add('uichemy-composer-widget-selected-target');
	}

	function reapplyUiChemyComposerPreviewSelectionOutline() {
		if (!UichSHE.uiChemyComposerPreviewSelectionPathCache || !isUiChemyComposerWidgetEditorActive()) {
			return;
		}
		if (!UichSHE.activeWidgetPreviewView || !UichSHE.activeWidgetPreviewView.$el || !UichSHE.activeWidgetPreviewView.$el.length) {
			return;
		}
		syncPreviewSelectedTargetByPath(UichSHE.uiChemyComposerPreviewSelectionPathCache);
	}

	function clearSelectedWidgetHoverState() {
		UichSHE.uiChemyComposerPreviewSelectionPathCache = '';
		clearPreviewHoverTarget();
		clearPreviewSelectedTarget();
		if (UichSHE.activePreviewSelectionAbortController) {
			UichSHE.activePreviewSelectionAbortController.abort();
			UichSHE.activePreviewSelectionAbortController = null;
		}

		if (UichSHE.activeWidgetPreviewView && UichSHE.activeWidgetPreviewView.$el && UichSHE.activeWidgetPreviewView.$el.length) {
			const container = UichSHE.activeWidgetPreviewView.$el.find('.elementor-widget-container');
			if (container.length) {
				container.off('click.uiChemyComposerAnchorGuard');
				container.off('mousedown.uiChemyComposerSelect');
				container.off('click.uiChemyComposerSelect');
				container.off('mousemove.uiChemyComposerHover');
				container.off('mouseleave.uiChemyComposerHover');
			}
			UichSHE.activeWidgetPreviewView.$el.removeClass('uichemy-composer-widget-selected');
		}
		UichSHE.activeWidgetPreviewView = null;
	}

	function setPreviewSelectionEnabled(nextEnabled) {
		UichSHE.activePreviewSelectionEnabled = !!nextEnabled;
		uiChemyComposerDebugLog('preview-selection:toggle', { enabled: UichSHE.activePreviewSelectionEnabled });
		const toggleButton = document.getElementById('uichemy-composer-panel-hover-toggle');
		if (toggleButton) {
			const textSpan = toggleButton.querySelector('.button-text');
			if (textSpan) {
				textSpan.textContent = UichSHE.activePreviewSelectionEnabled ? 'Select' : 'Select';
			}
			toggleButton.setAttribute('aria-pressed', UichSHE.activePreviewSelectionEnabled ? 'true' : 'false');
			toggleButton.classList.toggle('is-active', UichSHE.activePreviewSelectionEnabled);
		}
		if (!UichSHE.activePreviewSelectionEnabled) {
			clearPreviewHoverTarget();
			if (UichSHE.activePreviewSelectionAbortController) {
				UichSHE.activePreviewSelectionAbortController.abort();
				UichSHE.activePreviewSelectionAbortController = null;
			}
			if (UichSHE.activeWidgetPreviewView && UichSHE.activeWidgetPreviewView.$el && UichSHE.activeWidgetPreviewView.$el.length) {
				const container = UichSHE.activeWidgetPreviewView.$el.find('.elementor-widget-container');
				if (container.length) {
					container.off('click.uiChemyComposerAnchorGuard');
					container.off('mousedown.uiChemyComposerSelect');
					container.off('click.uiChemyComposerSelect');
					container.off('mousemove.uiChemyComposerHover');
					container.off('mouseleave.uiChemyComposerHover');
				}
			}
		}
	}

	function bindUiChemyComposerPreviewSelectionHandlers(view) {
		if (!UichSHE.activePreviewSelectionEnabled) {
			uiChemyComposerDebugLog('preview-binding:skipped-disabled');
			return;
		}

		if (!view || !view.$el || !view.$el.length) {
			uiChemyComposerDebugWarn('preview-binding:no-view');
			return;
		}
		view.$el.addClass('uichemy-composer-widget-selected');

		const widgetContainer = view.$el.find('.elementor-widget-container');
		uiChemyComposerDebugLog('preview-binding:container-lookup', {
			foundCount: widgetContainer.length,
			viewTag: view.$el[0] && view.$el[0].tagName ? view.$el[0].tagName : null
		});
		if (!widgetContainer.length) {
			uiChemyComposerDebugWarn('preview-binding:no-widget-container-found');
			return;
		}

		const containerEl = widgetContainer[0];
		const layerRootEl = getLayerRoot(containerEl) || containerEl;
		const ownerDocument = containerEl.ownerDocument || document;

		if (UichSHE.activePreviewSelectionAbortController) {
			UichSHE.activePreviewSelectionAbortController.abort();
		}
		UichSHE.activePreviewSelectionAbortController = new AbortController();
		const captureSignal = UichSHE.activePreviewSelectionAbortController.signal;

		widgetContainer.off('click.uiChemyComposerAnchorGuard').on('click.uiChemyComposerAnchorGuard', 'a', function (e) {
			if (!isUiChemyComposerWidgetEditorActive()) return;
			const href = (this.getAttribute('href') || '').trim();
			if (href === '#' || href === '') {
				e.preventDefault();
				e.stopImmediatePropagation();
				e.stopPropagation();
			}
		});

		const selectLayerFromPreviewEventCore = function (targetEl, e, source) {
			if (!isUiChemyComposerWidgetEditorActive()) return;
			if (!containerEl) return;
			if (!targetEl || !containerEl.contains(targetEl)) {
				uiChemyComposerDebugLog('preview-click:target-outside-container', { source });
				return;
			}
			if (targetEl.tagName && UichSHE.IGNORE_TAGS.includes(targetEl.tagName.toUpperCase())) {
				uiChemyComposerDebugLog('preview-click:ignored-tag', {
					tagName: targetEl.tagName,
					source
				});
				return;
			}
			if (targetEl === containerEl) {
				const fallbackTarget = getFirstSelectableContentElement(containerEl);
				if (!fallbackTarget) {
					uiChemyComposerDebugLog('preview-click:ignored-container-root', { source });
					return;
				}
				targetEl = fallbackTarget;
			}
			let layerPath = getPreviewElementLayerPath(targetEl, layerRootEl);
			if (!layerPath && layerRootEl !== containerEl) {
				layerPath = getPreviewElementLayerPath(targetEl, containerEl);
			}
			uiChemyComposerDebugLog('preview-click:path-resolved', {
				source,
				eventType: e.type,
				tagName: targetEl.tagName,
				className: targetEl.className,
				layerPath,
				layerRootTag: layerRootEl && layerRootEl.tagName ? layerRootEl.tagName : null
			});
			const didSelect = !!(layerPath && UichSHE.focusUiChemyComposerLayerByPath(layerPath));
			if (!didSelect) {
				uiChemyComposerDebugWarn('preview-click:selection-failed', {
					source,
					eventType: e.type,
					tagName: targetEl.tagName,
					layerPath
				});
			}
			if (didSelect) {
				uiChemyComposerDebugLog('preview-click:selection-success', {
					source,
					eventType: e.type,
					layerPath
				});
				e.preventDefault();
				e.stopImmediatePropagation();
				e.stopPropagation();
			}
		};

		const selectLayerFromPreviewEvent = function (e) {
			selectLayerFromPreviewEventCore(this, e, 'jquery-delegated');
		};

		const selectLayerFromPreviewCaptureEvent = function (e) {
			const targetEl = getPreviewSelectionTargetFromEvent(e, containerEl);
			if (!targetEl) {
				return;
			}
			selectLayerFromPreviewEventCore(targetEl, e, 'native-capture');
		};

		widgetContainer.off('mousedown.uiChemyComposerSelect').on('mousedown.uiChemyComposerSelect', '*', selectLayerFromPreviewEvent);
		widgetContainer.off('click.uiChemyComposerSelect').on('click.uiChemyComposerSelect', '*', selectLayerFromPreviewEvent);
		widgetContainer.off('mousemove.uiChemyComposerHover').on('mousemove.uiChemyComposerHover', function (e) {
			if (!isUiChemyComposerWidgetEditorActive()) return;
			const rawTarget = getPreviewSelectionTargetFromEvent(e, containerEl);
			let targetEl = rawTarget === containerEl
				? getFirstSelectableContentElement(containerEl)
				: rawTarget;
			while (targetEl && targetEl !== containerEl) {
				if (targetEl.tagName && UichSHE.IGNORE_TAGS.includes(targetEl.tagName.toUpperCase())) {
					targetEl = targetEl.parentElement;
					continue;
				}
				break;
			}

			if (!targetEl || targetEl === containerEl) {
				clearPreviewHoverTarget();
				return;
			}
			if (UichSHE.activePreviewHoverElement === targetEl) {
				return;
			}
			clearPreviewHoverTarget();
			UichSHE.activePreviewHoverElement = targetEl;
			UichSHE.activePreviewHoverElement.classList.add('uichemy-composer-widget-hover-target');
		});
		widgetContainer.off('mouseleave.uiChemyComposerHover').on('mouseleave.uiChemyComposerHover', function () {
			clearPreviewHoverTarget();
		});

		containerEl.addEventListener('mousedown', selectLayerFromPreviewCaptureEvent, {
			capture: true,
			signal: captureSignal
		});
		containerEl.addEventListener('click', selectLayerFromPreviewCaptureEvent, {
			capture: true,
			signal: captureSignal
		});
		ownerDocument.addEventListener('mousedown', selectLayerFromPreviewCaptureEvent, {
			capture: true,
			signal: captureSignal
		});
		ownerDocument.addEventListener('click', selectLayerFromPreviewCaptureEvent, {
			capture: true,
			signal: captureSignal
		});

		uiChemyComposerDebugLog('preview-binding:handlers-attached', {
			jqueryDelegated: true,
			nativeCapture: true
		});
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function getNodeLabel(node, index) {
		if (node.nodeType === Node.TEXT_NODE) {
			return `Text ${index + 1}`;
		}

		const tagName = node.tagName ? node.tagName.toLowerCase() : 'node';
		const parts = [`<${tagName}>`];

		if (node.id) {
			parts.push(`#${node.id}`);
		}

		if (node.className && typeof node.className === 'string') {
			const className = node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
			if (className) {
				parts.push(`.${className}`);
			}
		}

		return parts.join(' ');
	}

	function getNodePreview(node) {
		const value = node.nodeType === Node.TEXT_NODE ? node.nodeValue : node.textContent;
		const preview = String(value || '').replace(/\s+/g, ' ').trim();
		return preview.length > 72 ? `${preview.slice(0, 69)}...` : preview;
	}

	function isSvgUrlValue(value) {
		const normalized = String(value || '').trim().toLowerCase();
		if (!normalized) {
			return false;
		}
		if (/^data:image\/svg\+xml(?:[;,]|$)/i.test(normalized)) {
			return true;
		}
		return /\.svg(?:[?#]|$)/i.test(normalized);
	}

	function svgMarkupToPreviewDataUri(svgMarkup) {
		const markup = String(svgMarkup || '').trim();
		if (!markup || !/^<svg[\s>]/i.test(markup)) {
			return '';
		}
		try {
			if (window.URL && typeof window.URL.createObjectURL === 'function' && window.Blob) {
				return window.URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
			}
		} catch (e) { /* ignore */ }
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
	}

	/** Preview value for the native Elementor MEDIA control (panel UI only). */
	function buildSvgCodeMediaPreview(svgCode) {
		const previewUrl = svgMarkupToPreviewDataUri(svgCode);
		return normalizeMediaValue({ url: previewUrl, id: '' });
	}

	/** Sync `slot_{n}_svg_code_media` so Elementor shows default media hover UI + SVG preview. */
	function syncSlotSvgCodeMediaPreview(widgetSettings, slotIndex, svgCode, panel) {
		if (!widgetSettings || typeof widgetSettings.set !== 'function') {
			return;
		}
		const idx = parseInt(slotIndex, 10);
		if (Number.isNaN(idx) || idx < 0) {
			return;
		}
		const mediaKey = `slot_${idx}_svg_code_media`;
		const previewMedia = buildSvgCodeMediaPreview(svgCode);
		widgetSettings.set(mediaKey, previewMedia);
		syncPanelMediaControlValue(panel, mediaKey, previewMedia);
	}

	function refreshAllSlotSvgCodeMediaPreviews(widgetSettings, panel) {
		if (!widgetSettings || typeof widgetSettings.get !== 'function') {
			return;
		}
		for (let i = 0; i < 20; i++) {
			if (widgetSettings.get(`slot_${i}_is_svg`) !== 'yes') {
				continue;
			}
			if (String(widgetSettings.get(`slot_${i}_svg_mode`) || 'code') !== 'code') {
				continue;
			}
			syncSlotSvgCodeMediaPreview(
				i,
				widgetSettings.get(`slot_${i}_svg_code`) || '',
				panel
			);
		}
	}

	function fetchSvgMarkupFromUrl(url) {
		const src = String(url || '').trim();
		if (!src) {
			return Promise.resolve('');
		}
		if (/^data:image\/svg\+xml/i.test(src)) {
			try {
				const comma = src.indexOf(',');
				if (comma === -1) {
					return Promise.resolve('');
				}
				const payload = src.slice(comma + 1);
				const decoded = src.indexOf(';base64,') !== -1
					? atob(payload)
					: decodeURIComponent(payload);
				return Promise.resolve(/^\s*<svg\b/i.test(decoded) ? decoded.trim() : '');
			} catch (e) {
				return Promise.resolve('');
			}
		}
		return fetch(src, { credentials: 'same-origin' })
			.then((resp) => (resp && resp.ok ? resp.text() : ''))
			.then((text) => (/^\s*<svg\b/i.test(text) ? String(text).trim() : ''))
			.catch(() => '');
	}

	/**
	 * Widget panel: user changed the SVG MEDIA control (Change Image / Delete).
	 * Returns a Promise for the resolved inline SVG markup (or '' when cleared).
	 */
	function resolveSvgCodeFromPanelMediaChange(widgetSettings, slotIndex) {
		if (!widgetSettings || typeof widgetSettings.get !== 'function') {
			return Promise.resolve('');
		}
		const idx = parseInt(slotIndex, 10);
		if (Number.isNaN(idx) || idx < 0) {
			return Promise.resolve('');
		}
		const mediaKey = `slot_${idx}_svg_code_media`;
		const codeKey = `slot_${idx}_svg_code`;
		const media = normalizeMediaValue(widgetSettings.get(mediaKey));
		if (!media.url) {
			return Promise.resolve('');
		}
		const currentCode = String(widgetSettings.get(codeKey) || '').trim();
		const previewFromCode = svgMarkupToPreviewDataUri(currentCode);
		if (previewFromCode && media.url === previewFromCode) {
			return Promise.resolve(currentCode);
		}
		return fetchSvgMarkupFromUrl(media.url).then((markup) => {
			if (!markup) {
				return currentCode;
			}
			widgetSettings.set(codeKey, markup);
			const previewMedia = buildSvgCodeMediaPreview(markup);
			if (previewMedia.url !== media.url) {
				widgetSettings.set(mediaKey, previewMedia);
			}
			return markup;
		});
	}

	function getTagNameUpper(node) {
		if (!node || node.nodeType !== Node.ELEMENT_NODE || !node.tagName) {
			return '';
		}
		return String(node.tagName).toUpperCase();
	}

	function parseUiChemyComposerCustomAttributes(customAttributesRaw) {
		const raw = String(customAttributesRaw || '').trim();
		if (!raw) {
			return [];
		}
		const rows = raw
			.split(/\r?\n|\|\|/)
			.map((row) => String(row || '').trim())
			.filter(Boolean);
		const out = [];
		rows.forEach((row) => {
			let key = '';
			let value = '';
			if (row.includes('|')) {
				const pair = row.split('|');
				key = String((pair.shift() || '')).trim();
				value = String(pair.join('|') || '').trim();
			} else if (row.includes('=')) {
				const idx = row.indexOf('=');
				key = String(row.slice(0, idx) || '').trim();
				value = String(row.slice(idx + 1) || '').trim();
			} else {
				key = String(row || '').trim();
				value = '';
			}
			if (!key || /[\s"'`=<>]/.test(key)) {
				return;
			}
			value = value.replace(/^['"]|['"]$/g, '');
			out.push({ key, value });
		});
		return out;
	}

	function applyUiChemyComposerCustomAttributesToAnchor(anchorEl, customAttributesRaw) {
		if (!anchorEl || anchorEl.nodeType !== Node.ELEMENT_NODE || anchorEl.tagName !== 'A') {
			return;
		}
		const parsed = parseUiChemyComposerCustomAttributes(customAttributesRaw);
		parsed.forEach((entry) => {
			if (!entry || !entry.key) return;
			anchorEl.setAttribute(entry.key, entry.value);
		});
	}

	function isDirectTextDisallowedElement(node) {
		const tag = getTagNameUpper(node);
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION';
	}

	function removeLeadingBlankDropdownOptionRows(rootEl) {
		if (!rootEl || typeof rootEl.querySelectorAll !== 'function') {
			return;
		}
		rootEl.querySelectorAll('select').forEach((selectEl) => {
			const firstOption = selectEl.options && selectEl.options.length ? selectEl.options[0] : null;
			if (!firstOption) {
				return;
			}
			const value = String(firstOption.value || '').trim();
			const label = String(firstOption.textContent || '').trim();
			if (value === '' && label === '') {
				firstOption.remove();
			}
		});
	}

	function getLayerLabel(node) {
		if (!node) {
			return 'node';
		}

		if (node.nodeType === Node.TEXT_NODE) {
			return 'text';
		}

		return node.tagName ? node.tagName.toLowerCase() : 'element';
	}

	function getLayerRoot(wrapperNode) {
		if (!wrapperNode) {
			return null;
		}

		const body = wrapperNode.querySelector('body');
		return body || wrapperNode;
	}

	function isLayerSkippedElement(node) {
		return node.nodeType === Node.ELEMENT_NODE && UichSHE.LAYER_SKIP_TAGS.includes(node.tagName.toUpperCase());
	}

	function extractLayerEntries(rootNode, slotNodes) {
		const entries = [];
		const slotMap = new Map();
		const elementOwnedTextSlotMap = new Map();
		const elementOwnedTextPreviewMap = new Map();

		slotNodes.forEach((slotNode, index) => {
			slotMap.set(slotNode, index);
		});

		function getOwnedTextSlotIndex(elementNode) {
			if (!elementNode || elementNode.nodeType !== Node.ELEMENT_NODE) {
				return null;
			}
			if (elementOwnedTextSlotMap.has(elementNode)) {
				return elementOwnedTextSlotMap.get(elementNode);
			}
			const tagName = elementNode.tagName ? elementNode.tagName.toUpperCase() : '';
			let hasElementChild = false;
			let ownedSlotIndex = null;
			let firstDirectTextSlotIndex = null;
			let hasMultipleDirectTextSlots = false;
			for (let i = 0; i < elementNode.childNodes.length; i++) {
				const child = elementNode.childNodes[i];
				if (child.nodeType === Node.ELEMENT_NODE && !isLayerSkippedElement(child)) {
					hasElementChild = true;
					continue;
				}
				if (child.nodeType === Node.TEXT_NODE && getNodePreview(child)) {
					if (!slotMap.has(child)) {
						ownedSlotIndex = null;
						break;
					}
					const childSlotIndex = slotMap.get(child);
					if (firstDirectTextSlotIndex === null) {
						firstDirectTextSlotIndex = childSlotIndex;
					} else if (firstDirectTextSlotIndex !== childSlotIndex) {
						hasMultipleDirectTextSlots = true;
					}
					if (ownedSlotIndex === null) {
						ownedSlotIndex = childSlotIndex;
					} else if (ownedSlotIndex !== childSlotIndex) {
						ownedSlotIndex = null;
						break;
					}
				}
			}
			const isMixedH1WithSingleDirectTextSlot = (
				tagName === 'H1' &&
				hasElementChild &&
				firstDirectTextSlotIndex !== null &&
				!hasMultipleDirectTextSlots
			);
			const resolved = (hasElementChild && !isMixedH1WithSingleDirectTextSlot) ? null : ownedSlotIndex;
			elementOwnedTextSlotMap.set(elementNode, resolved);
			return resolved;
		}

		function getOwnedTextPreview(elementNode) {
			if (!elementNode || elementNode.nodeType !== Node.ELEMENT_NODE) {
				return '';
			}
			if (elementOwnedTextPreviewMap.has(elementNode)) {
				return elementOwnedTextPreviewMap.get(elementNode);
			}
			const ownedSlotIndex = getOwnedTextSlotIndex(elementNode);
			const preview = ownedSlotIndex !== null ? getNodePreview(elementNode) : '';
			elementOwnedTextPreviewMap.set(elementNode, preview);
			return preview;
		}

		function hasVisibleChildren(node) {
			for (let i = 0; i < node.childNodes.length; i++) {
				const child = node.childNodes[i];
				if (child.nodeType === Node.ELEMENT_NODE) {
					if (!isLayerSkippedElement(child)) {
						return true;
					}
				} else if (child.nodeType === Node.TEXT_NODE && getNodePreview(child)) {
					if (slotMap.has(node)) {
						continue;
					}
					if (getOwnedTextSlotIndex(node) !== null) {
						continue;
					}
					return true;
				}
			}
			return false;
		}

		function visit(node, depth, parentId, path) {
			const pathChildren = getPathRelevantChildren(node);
			for (let i = 0; i < pathChildren.length; i++) {
				const child = pathChildren[i];
				const childPath = `${path}.${i}`;
				const baseId = `layer${childPath}`;
				if (child.nodeType === Node.ELEMENT_NODE) {
					const slotIndex = slotMap.has(child)
						? slotMap.get(child)
						: getOwnedTextSlotIndex(child);
					const contentPreview = slotMap.has(child)
						? getNodePreview(child)
						: getOwnedTextPreview(child);
					entries.push({
						id: `${baseId}-el`,
						path: childPath,
						parentId,
						depth,
						label: getLayerLabel(child),
						contentPreview,
						hasChildren: hasVisibleChildren(child),
						slotIndex,
						type: 'element'
					});
					if (!(child.tagName && child.tagName.toUpperCase() === 'SVG')) {
						visit(child, depth + 1, `${baseId}-el`, childPath);
					}
				} else if (child.nodeType === Node.TEXT_NODE) {
					const preview = getNodePreview(child);
					if (!preview) {
						continue;
					}
					if (slotMap.has(node)) {
						continue;
					}
					if (getOwnedTextSlotIndex(node) !== null) {
						continue;
					}

					const slotIndex = slotMap.has(child) ? slotMap.get(child) : null;
					entries.push({
						id: `${baseId}-txt`,
						path: childPath,
						parentId,
						depth,
						label: 'text',
						contentPreview: preview,
						hasChildren: false,
						slotIndex,
						type: 'text'
					});
				}
			}
		}

		visit(rootNode, 0, null, 'root');
		return entries;
	}

	// Recursive extraction of text nodes returning objects with node references
	function extractTextNodes(node, nodes = []) {
		for (let i = 0; i < node.childNodes.length; i++) {
			const child = node.childNodes[i];
			if (child.nodeType === Node.TEXT_NODE) {
				const val = child.nodeValue.trim();
				if (val !== '') {
					nodes.push(child);
				}
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const tagName = child.tagName.toUpperCase();
				// Skip <uichemy-*> custom elements entirely — their inner template tokens
				// (e.g. {nav_item}) must never be treated as editable text slots.
				// The PHP layer extracts and renders these tags server-side.
				if (tagName.startsWith('UICHEMY-')) {
					continue;
				}
				if (UichSHE.IGNORE_TAGS.includes(tagName)) {
					continue;
				} else if (tagName === 'IMG' || tagName === 'SVG') {
					nodes.push(child);
				} else if (UichSHE.INLINE_TAGS.includes(tagName)) {
					// Inline tags are editable slots only when they have visible text content.
					const textContent = String(child.textContent || '').trim();
					if (textContent !== '') {
						nodes.push(child);
					}
				} else {
					// Block tag, traverse inside
					extractTextNodes(child, nodes);
				}
			}
		}
		return nodes;
	}

	function getSlotTextValue(node) {
		if (!node) {
			return '';
		}
		const rawValue = node.nodeType === Node.TEXT_NODE ? node.nodeValue : node.textContent;
		return String(rawValue || '').trim();
	}

	function getSlotKind(node) {
		if (!node) {
			return null;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			return 'text';
		}
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return null;
		}
		const tagName = childTagNameUpper(node);
		if (tagName === 'A') {
			return 'anchor';
		}
		if (tagName === 'IMG') {
			return isSvgUrlValue(node.getAttribute('src') || '') ? 'svg' : 'image';
		}
		if (tagName === 'SVG') {
			return 'svg';
		}
		return 'text';
	}

	function childTagNameUpper(node) {
		return String(node.tagName || '').toUpperCase();
	}

	function readSvgSlotFromNode(node) {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) {
			return { svgMode: 'code', svgUrl: '', svgCode: '' };
		}
		const tagName = childTagNameUpper(node);
		if (tagName === 'IMG') {
			return { svgMode: 'url', svgUrl: node.getAttribute('src') || '', svgCode: '' };
		}
		if (tagName !== 'SVG') {
			return { svgMode: 'code', svgUrl: '', svgCode: '' };
		}
		const sourceUrl = String(node.getAttribute('data-uc-svg-source') || '').trim();
		const imageEl = node.querySelector('image');
		const imageHref = imageEl
			? (imageEl.getAttribute('href')
				|| imageEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
				|| '')
			: '';
		const url = sourceUrl || String(imageHref || '').trim();
		if (url) {
			return { svgMode: 'url', svgUrl: url, svgCode: '' };
		}
		return { svgMode: 'code', svgUrl: '', svgCode: node.outerHTML || '' };
	}

	function readSlotStateFromNode(node) {
		const kind = getSlotKind(node);
		if (!kind) {
			return null;
		}
		if (kind === 'anchor') {
			return {
				kind,
				text: getSlotTextValue(node),
				isLink: true,
				isImage: false,
				isSvg: false,
				svgMode: '',
				imageUrl: '',
				imageAlt: '',
				svgUrl: '',
				svgCode: '',
				link: {
					url: node.getAttribute('href') || '',
					is_external: node.getAttribute('target') === '_blank' ? 'on' : '',
					nofollow: (node.getAttribute('rel') || '').includes('nofollow') ? 'on' : ''
				}
			};
		}
		if (kind === 'image') {
			return {
				kind,
				text: '',
				isLink: false,
				isImage: true,
				isSvg: false,
				svgMode: '',
				imageUrl: node.getAttribute('src') || '',
				imageAlt: node.getAttribute('alt') || '',
				svgUrl: '',
				svgCode: '',
				link: null
			};
		}
		if (kind === 'svg') {
			const svg = readSvgSlotFromNode(node);
			return {
				kind,
				text: '',
				isLink: false,
				isImage: false,
				isSvg: true,
				svgMode: svg.svgMode,
				imageUrl: '',
				imageAlt: '',
				svgUrl: svg.svgUrl,
				svgCode: svg.svgCode,
				link: null
			};
		}
		return {
			kind: 'text',
			text: getSlotTextValue(node),
			isLink: false,
			isImage: false,
			isSvg: false,
			svgMode: '',
			imageUrl: '',
			imageAlt: '',
			svgUrl: '',
			svgCode: '',
			link: null
		};
	}

	function applySvgUrlToNode(node, url) {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) {
			return;
		}
		const nextUrl = String(url || '').trim();
		const tagName = childTagNameUpper(node);

		if (tagName === 'SVG') {
			if (nextUrl) {
				if (!node.parentNode) return;
				const doc = node.ownerDocument || document;
				const imgNode = doc.createElement('img');
				imgNode.setAttribute('data-as', 'svg');
				imgNode.setAttribute('src', nextUrl);
				['class', 'style', 'id', 'width', 'height'].forEach((attr) => {
					const val = node.getAttribute(attr);
					if (val) imgNode.setAttribute(attr, val);
				});
				node.parentNode.replaceChild(imgNode, node);
			} else {
				while (node.firstChild) {
					node.removeChild(node.firstChild);
				}
				while (node.attributes.length > 0) {
					node.removeAttribute(node.attributes[0].name);
				}
			}
		} else if (tagName === 'IMG') {
			if (nextUrl) {
				node.setAttribute('src', nextUrl);
				if (!node.getAttribute('data-as')) node.setAttribute('data-as', 'svg');
			} else {
				if (!node.parentNode) return;
				const doc = node.ownerDocument || document;
				const svgNode = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
				node.parentNode.replaceChild(svgNode, node);
			}
		}
	}

	function applySvgCodeToNode(node, markup) {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) {
			return false;
		}
		const trimmed = String(markup || '').trim();
		if (!trimmed || !/^<(svg|img)[\s>]/i.test(trimmed)) return false;
		const parsedWrap = document.createElement('div');
		parsedWrap.innerHTML = trimmed;
		const nextNode = parsedWrap.querySelector('svg, img');
		if (!nextNode) return false;
		const tagName = childTagNameUpper(node);
		const isSvgImgNode = tagName === 'IMG' && (
			node.getAttribute('data-as') === 'svg' ||
			isSvgUrlValue(node.getAttribute('src') || '')
		);
		if (tagName === 'SVG' || isSvgImgNode) {
			node.replaceWith(nextNode.cloneNode(true));
			return true;
		}
		return false;
	}

	function normalizeMediaValue(raw) {
		if (raw && typeof raw === 'object') {
			return {
				url: String(raw.url || '').trim(),
				id: raw.id != null && raw.id !== '' ? raw.id : ''
			};
		}
		const str = String(raw || '').trim();
		if (str) {
			return { url: str, id: '' };
		}
		return { url: '', id: '' };
	}

	function getMediaUrl(raw) {
		return normalizeMediaValue(raw).url;
	}

	function applySlotSettingsToNode(node, widgetSettings, slotIndex) {
		if (!node || !widgetSettings || typeof widgetSettings.get !== 'function') {
			return;
		}
		const kind = getSlotKind(node);
		if (!kind) {
			return;
		}

		if (kind === 'image') {
			const url = getMediaUrl(widgetSettings.get(`slot_${slotIndex}_image`));
			if (url) {
				node.setAttribute('src', url);
			} else {
				node.removeAttribute('src');
			}
			const alt = String(widgetSettings.get(`slot_${slotIndex}_image_alt`) || '');
			if (alt) {
				node.setAttribute('alt', alt);
			} else {
				node.removeAttribute('alt');
			}
			return;
		}

		if (kind === 'svg') {
			const svgMode = String(widgetSettings.get(`slot_${slotIndex}_svg_mode`) || 'code');
			if (svgMode === 'url') {
				const url = getMediaUrl(widgetSettings.get(`slot_${slotIndex}_svg_url`));
				applySvgUrlToNode(node, url);
				return;
			}
			const code = String(widgetSettings.get(`slot_${slotIndex}_svg_code`) || '').trim();
			if (code) {
				applySvgCodeToNode(node, code);
			}
			return;
		}

		let textVal = widgetSettings.get(`slot_${slotIndex}`);
		if (textVal === undefined || textVal === null) {
			textVal = '';
		}
		let safeVal = String(textVal);
		if (safeVal.trim() === '' && node.nodeType === Node.TEXT_NODE) {
			safeVal = '\u200B';
		}
		if (node.nodeType === Node.TEXT_NODE) {
			node.nodeValue = safeVal;
		} else {
			node.textContent = safeVal;
		}

		if (kind === 'anchor') {
			const newLinkVal = widgetSettings.get(`slot_${slotIndex}_link`) || {};
			if (newLinkVal.url) {
				node.setAttribute('href', newLinkVal.url);
			} else {
				node.removeAttribute('href');
			}
			if (newLinkVal.is_external === 'on') {
				node.setAttribute('target', '_blank');
			} else {
				node.removeAttribute('target');
			}
			if (newLinkVal.nofollow === 'on') {
				const rels = (node.getAttribute('rel') || '').split(' ').filter((r) => r && r.toLowerCase() !== 'nofollow');
				rels.push('nofollow');
				node.setAttribute('rel', rels.join(' ').trim());
			} else {
				const rels = (node.getAttribute('rel') || '').split(' ').filter((r) => r && r.toLowerCase() !== 'nofollow').join(' ').trim();
				if (rels) {
					node.setAttribute('rel', rels);
				} else {
					node.removeAttribute('rel');
				}
			}
			applyUiChemyComposerCustomAttributesToAnchor(node, newLinkVal.custom_attributes || '');
		}
	}

	function getElementorPanelPageView() {
		try {
			if (typeof elementor === 'undefined' || typeof elementor.getPanelView !== 'function') {
				return null;
			}
			const panelView = elementor.getPanelView();
			if (!panelView || typeof panelView.getCurrentPageView !== 'function') {
				return null;
			}
			return panelView.getCurrentPageView();
		} catch (e) {
			return null;
		}
	}

	function getPanelControlView(settingKey) {
		const pageView = getElementorPanelPageView();
		if (!pageView || !pageView.collection || !pageView.children) {
			return null;
		}
		const controlModel = pageView.collection.findWhere({ name: settingKey });
		if (!controlModel) {
			return null;
		}
		return pageView.children.findByModelCid(controlModel.cid) || null;
	}

	function triggerSettingChange(settings, key) {
		if (!settings || typeof settings.trigger !== 'function' || !key) {
			return;
		}
		const value = typeof settings.get === 'function' ? settings.get(key) : undefined;
		settings.trigger('change:' + key, settings, value, {});
	}

	function syncPanelControlValue(panel, settingKey, value) {
		if (!panel || !panel.$el) {
			return;
		}
		try {
			const strVal = value == null ? '' : String(value);
			const $input = panel.$el.find('[data-setting="' + settingKey + '"]');
			if ($input.length && String($input.val() || '') !== strVal) {
				$input.val(strVal).trigger('input').trigger('change');
				return;
			}
			const wrap = panel.$el.find('.elementor-control-' + settingKey);
			if (wrap.length) {
				const nested = wrap.find('[data-setting]').first();
				if (nested.length && String(nested.val() || '') !== strVal) {
					nested.val(strVal).trigger('input').trigger('change');
				}
			}
		} catch (e) { /* ignore */ }
	}

	function syncPanelMediaControlValue(panel, settingKey, rawValue) {
		const media = normalizeMediaValue(rawValue);
		const controlView = getPanelControlView(settingKey);
		if (controlView && typeof controlView.applySavedValue === 'function') {
			try {
				controlView.applySavedValue();
				return;
			} catch (e) { /* ignore */ }
		}
		if (!panel || !panel.$el) {
			return;
		}
		try {
			const wrap = panel.$el.find('.elementor-control-' + settingKey);
			if (!wrap.length) {
				return;
			}
			const urlInput = wrap.find('[data-setting="url"]');
			const idInput = wrap.find('[data-setting="id"]');
			if (urlInput.length && String(urlInput.val() || '') !== media.url) {
				urlInput.val(media.url).trigger('input').trigger('change');
			}
			if (idInput.length && String(idInput.val() || '') !== String(media.id || '')) {
				idInput.val(media.id).trigger('input').trigger('change');
			}
		} catch (e) { /* ignore */ }
	}

	function syncSlotSettingsFromNode(widgetSettings, slotIndex, node, panel, dynamics) {
		const state = readSlotStateFromNode(node);
		if (!state || !widgetSettings || typeof widgetSettings.set !== 'function') {
			return;
		}
		const visibleKey = `slot_${slotIndex}_visible`;
		const isLinkKey = `slot_${slotIndex}_is_link`;
		const isImageKey = `slot_${slotIndex}_is_image`;
		const isSvgKey = `slot_${slotIndex}_is_svg`;
		const slotKey = `slot_${slotIndex}`;
		const linkKey = `slot_${slotIndex}_link`;
		const imageKey = `slot_${slotIndex}_image`;
		const imageAltKey = `slot_${slotIndex}_image_alt`;
		const svgModeKey = `slot_${slotIndex}_svg_mode`;
		const svgCodeKey = `slot_${slotIndex}_svg_code`;
		const svgCodeMediaKey = `slot_${slotIndex}_svg_code_media`;
		const svgUrlKey = `slot_${slotIndex}_svg_url`;
		const emptyMedia = { url: '', id: '' };

		widgetSettings.set(visibleKey, 'yes');
		widgetSettings.set(isLinkKey, state.isLink ? 'yes' : 'no');
		widgetSettings.set(isImageKey, state.isImage ? 'yes' : 'no');
		widgetSettings.set(isSvgKey, state.isSvg ? 'yes' : 'no');
		triggerSettingChange(widgetSettings, visibleKey);
		triggerSettingChange(widgetSettings, isLinkKey);
		triggerSettingChange(widgetSettings, isImageKey);
		triggerSettingChange(widgetSettings, isSvgKey);

		if (!state.isImage && !state.isSvg && !(dynamics[slotKey] && dynamics[slotKey] !== '')) {
			widgetSettings.set(slotKey, state.text);
			syncPanelControlValue(panel, slotKey, state.text);
		}

		if (state.isLink) {
			const isDynamicLink = !!(dynamics[linkKey] && dynamics[linkKey] !== '');
			if (!isDynamicLink) {
				const oldLinkVal = widgetSettings.get(linkKey) || {};
				const newLinkVal = {
					url: state.link.url || '',
					is_external: state.link.is_external || '',
					nofollow: state.link.nofollow || '',
					custom_attributes: oldLinkVal.custom_attributes || ''
				};
				widgetSettings.set(linkKey, newLinkVal);
				if (panel && panel.$el) {
					const urlInput = panel.$el.find('.elementor-control-' + linkKey + ' [data-setting="url"]');
					if (urlInput.length && urlInput.val() !== newLinkVal.url) {
						urlInput.val(newLinkVal.url).trigger('input').trigger('change');
					}
				}
			}
		}

		if (state.isImage) {
			const prevMedia = normalizeMediaValue(widgetSettings.get(imageKey));
			const nextMedia = normalizeMediaValue({
				url: state.imageUrl,
				id: prevMedia.url === state.imageUrl ? prevMedia.id : ''
			});
			widgetSettings.set(imageKey, nextMedia);
			widgetSettings.set(imageAltKey, state.imageAlt);
			syncPanelMediaControlValue(panel, imageKey, nextMedia);
			syncPanelControlValue(panel, imageAltKey, state.imageAlt);
			triggerSettingChange(widgetSettings, imageKey);
			triggerSettingChange(widgetSettings, imageAltKey);
		}

		if (state.isSvg) {
			const mode = state.svgMode || 'code';
			const isDynamicSvgCodeMedia = !!(dynamics[svgCodeMediaKey] && dynamics[svgCodeMediaKey] !== '');
			widgetSettings.set(svgModeKey, mode);
			syncPanelControlValue(panel, svgModeKey, mode);
			triggerSettingChange(widgetSettings, svgModeKey);

			if (mode === 'url') {
				const prevSvgMedia = normalizeMediaValue(widgetSettings.get(svgUrlKey));
				const nextSvgMedia = normalizeMediaValue({
					url: state.svgUrl,
					id: prevSvgMedia.url === state.svgUrl ? prevSvgMedia.id : ''
				});
				widgetSettings.set(svgUrlKey, nextSvgMedia);
				widgetSettings.set(svgCodeKey, '');
				widgetSettings.set(svgCodeMediaKey, emptyMedia);
				syncPanelMediaControlValue(panel, svgUrlKey, nextSvgMedia);
				syncPanelMediaControlValue(panel, svgCodeMediaKey, emptyMedia);
				triggerSettingChange(widgetSettings, svgUrlKey);
				triggerSettingChange(widgetSettings, svgCodeKey);
				triggerSettingChange(widgetSettings, svgCodeMediaKey);
			} else {
				widgetSettings.set(svgCodeKey, state.svgCode);
				widgetSettings.set(svgUrlKey, emptyMedia);
				if (!isDynamicSvgCodeMedia) {
					syncSlotSvgCodeMediaPreview(widgetSettings, slotIndex, state.svgCode, panel);
				}
				syncPanelMediaControlValue(panel, svgUrlKey, emptyMedia);
				triggerSettingChange(widgetSettings, svgCodeKey);
				triggerSettingChange(widgetSettings, svgUrlKey);
				triggerSettingChange(widgetSettings, svgCodeMediaKey);
			}
		}
	}



	Object.assign(UichSHE, {
		debounce,
		normalizeSharedSiteCodeValue,
		setSharedSiteCustomCode,
		initializeSharedSiteCustomCodeFromLocalizedData,
		fetchSharedSiteCustomCode,
		saveSharedSiteCustomCode,
		applySharedSiteCustomCodeToSettings,
		destroyUiChemyComposerCodeEditorById,
		initializeUiChemyComposerCodeEditor,
		refreshUiChemyComposerCodeEditors,
		normalizeUiChemyComposerLineEndings,
		getFallbackUiChemyComposerEditorSettings,
		getUiChemyComposerEditorValueById,
		setUiChemyComposerEditorValueById,
		uiChemyComposerDebugLog,
		uiChemyComposerDebugWarn,
		isPathSkippableElement,
		getPathRelevantChildren,
		reorderPathRelevantChildren,
		getPreviewElementLayerPath,
		getPreviewSelectionTargetFromEvent,
		getFirstSelectableContentElement,
		normalizeLayerPath,
		getLayerPathCandidates,
		isUiChemyComposerWidgetEditorActive,
		ensureSelectedWidgetHoverStyle,
		clearPreviewHoverTarget,
		clearPreviewSelectedTarget,
		resolvePreviewNodeByLayerPath,
		syncPreviewSelectedTargetByPath,
		reapplyUiChemyComposerPreviewSelectionOutline,
		clearSelectedWidgetHoverState,
		setPreviewSelectionEnabled,
		bindUiChemyComposerPreviewSelectionHandlers,
		escapeHtml,
		getNodeLabel,
		getNodePreview,
		isSvgUrlValue,
		svgMarkupToPreviewDataUri,
		buildSvgCodeMediaPreview,
		syncSlotSvgCodeMediaPreview,
		refreshAllSlotSvgCodeMediaPreviews,
		fetchSvgMarkupFromUrl,
		resolveSvgCodeFromPanelMediaChange,
		getTagNameUpper,
		parseUiChemyComposerCustomAttributes,
		applyUiChemyComposerCustomAttributesToAnchor,
		isDirectTextDisallowedElement,
		removeLeadingBlankDropdownOptionRows,
		getLayerLabel,
		getLayerRoot,
		isLayerSkippedElement,
		extractLayerEntries,
		extractTextNodes,
		getSlotTextValue,
		getSlotKind,
		readSlotStateFromNode,
		applySlotSettingsToNode,
		syncSlotSettingsFromNode
	});
})(jQuery);
