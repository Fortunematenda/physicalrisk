(function ($) {
	'use strict';
	var UichSHE = window.UichUiChemyComposerEditor;
	if (!UichSHE) {
		return;
	}

	function onElementorInit() {
		try {
			UichSHE.isClosedByUser = localStorage.getItem('uich_composer_closed_by_user') === '1';
		} catch (e) {
			UichSHE.isClosedByUser = false;
		}

		try {
			if (typeof UichSHE.injectFloatingPanel === 'function') {
				UichSHE.injectFloatingPanel();
			}
		} catch (err) {
			if (window.console && typeof window.console.error === 'function') {
				window.console.error('[UiChemy UiChemy Composer] injectFloatingPanel failed:', err);
			}
		}

		function openComposerFloatingTab(tabName) {
			UichSHE.isClosedByUser = false;
			try {
				localStorage.setItem('uich_composer_closed_by_user', '0');
			} catch (e) {}
			const tab = tabName === 'layers' ? 'direct' : String(tabName || 'direct');
			document.body.classList.add('uichemy-composer-active');
			const floatPanel = document.getElementById('uichemy-composer-floating-panel');
			if (floatPanel) {
				floatPanel.classList.add('active');
				floatPanel.classList.remove('minimized');
				const tBtn = document.getElementById('uichemy-composer-panel-toggle');
				if (tBtn) {
					tBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
				}
			}
			try {
				window.dispatchEvent(new CustomEvent('uich:composer-switch-tab', { detail: { tab: tab } }));
			} catch (err) { /* ignore */ }
			if (typeof UichSHE.openComposerPanelTab === 'function') {
				UichSHE.openComposerPanelTab(tab);
			}
		}

		if (!UichSHE.uiChemyComposerStyleTabHooksBound) {
			UichSHE.uiChemyComposerStyleTabHooksBound = true;
			elementor.channels.editor.on('uichemy:composer:edit_layers', function () {
				openComposerFloatingTab('direct');
			});
			elementor.channels.editor.on('uichemy:composer:edit_code', function () {
				openComposerFloatingTab('code');
			});
			elementor.channels.editor.on('uichemy:composer:edit_chat', function () {
				openComposerFloatingTab('chat');
			});
		}

		if (!UichSHE.uiChemyComposerGlobalsHooksBound) {
			UichSHE.uiChemyComposerGlobalsHooksBound = true;
			const bumpUiChemyComposerGlobalsReadonly = UichSHE.debounce(function () {
				if (UichSHE.uiChemyComposerActiveCodeRowTab === 'globals') {
					UichSHE.refreshUiChemyComposerGlobalsPanel();
				}
			}, 200);
			elementor.on('globals:loaded', bumpUiChemyComposerGlobalsReadonly);
			elementor.on('document:loaded', bumpUiChemyComposerGlobalsReadonly);
			elementor.on('document:loaded', hideFloatingPanel);
			elementor.channels.editor.on('saved', bumpUiChemyComposerGlobalsReadonly);
			if (elementor.saver && typeof elementor.saver.on === 'function') {
				elementor.saver.on('after:save', bumpUiChemyComposerGlobalsReadonly);
			}
			elementor.on('document:loaded', function uiChemyComposerBindKitGlobalsLiveSync() {
				try {
					const documents = elementor.documents && elementor.documents.documents;
					if (!documents) {
						return;
					}
					Object.keys(documents).forEach((docId) => {
						const doc = documents[docId];
						if (!doc || !doc.config || doc.config.type !== 'kit') {
							return;
						}
						const settingsModel = doc.container && doc.container.settings;
						if (!settingsModel || settingsModel.__uiChemyComposerGlobalsBound) {
							return;
						}
						settingsModel.__uiChemyComposerGlobalsBound = true;
						const onKitSettingsChange = UichSHE.debounce(function () {
							if (UichSHE.uiChemyComposerActiveCodeRowTab === 'globals') {
								UichSHE.refreshUiChemyComposerGlobalsPanel();
							}
						}, 150);
						settingsModel.on('change', onKitSettingsChange);
					});
				} catch (e) {
					// Ignore binding failures across Elementor versions.
				}
			});
		}

		function hideFloatingPanel() {
			document.body.classList.remove('uichemy-composer-active');
			UichSHE.activeWidgetSettings = null;
			UichSHE.activePanelView = null;
			UichSHE.clearSelectedWidgetHoverState();
			const floatPanel = document.getElementById('uichemy-composer-floating-panel');
			if (floatPanel) {
				floatPanel.classList.remove('active');
			}
		}

		function closeFloatingPanel() {
			UichSHE.isClosedByUser = true;
			try {
				localStorage.setItem('uich_composer_closed_by_user', '1');
			} catch (e) {}
			document.body.classList.remove('uichemy-composer-active');
			const floatPanel = document.getElementById('uichemy-composer-floating-panel');
			if (floatPanel) {
				floatPanel.classList.remove('active');
			}
		}
		UichSHE.hideFloatingPanel = closeFloatingPanel;

		/** Walk Elementor document container tree (Elementor 3+). */
		function uichWalkElementorContainers(container, visitor) {
			if (!container || typeof visitor !== 'function') {
				return;
			}
			visitor(container);
			const children = container.children;
			if (!children) {
				return;
			}
			const list = [];
			if (typeof children.forEach === 'function') {
				children.forEach(function (c) {
					list.push(c);
				});
			} else if (typeof children.each === 'function') {
				children.each(function (c) {
					list.push(c);
				});
			} else if (Array.isArray(children)) {
				children.forEach(function (c) {
					list.push(c);
				});
			}
			list.forEach(function (child) {
				uichWalkElementorContainers(child, visitor);
			});
		}

		function uichGetCurrentElementorDocumentContainer() {
			try {
				const doc = elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent();
				return doc && doc.container ? doc.container : null;
			} catch (e) {
				return null;
			}
		}

		/** Page custom code is shared across all UiChemy Composer widgets on the page — read first non-empty from any instance. */
		function uichFindFirstUiChemyComposerPageCustomCode(settingKey) {
			let found = '';
			const root = uichGetCurrentElementorDocumentContainer();
			if (!root) {
				return found;
			}
			uichWalkElementorContainers(root, function (container) {
				if (found) {
					return;
				}
				const model = container.model;
				if (!model || model.get('elType') !== 'widget' || model.get('widgetType') !== 'proton') {
					return;
				}
				const settings = model.get('settings');
				if (!settings || typeof settings.get !== 'function') {
					return;
				}
				const v = settings.get(settingKey) || '';
				if (String(v).trim()) {
					found = v;
				}
			});
			return found;
		}

		/** Keep page head/footer in sync on every UiChemy Composer widget so the floating panel matches for any section. */
		function uichPropagateUiChemyComposerPageCustomCodeToAllWidgets(settingKey, value) {
			if (settingKey !== 'page_custom_code_head' && settingKey !== 'page_custom_code_footer') {
				return;
			}
			const root = uichGetCurrentElementorDocumentContainer();
			if (!root) {
				return;
			}
			const strVal = value == null ? '' : String(value);
			uichWalkElementorContainers(root, function (container) {
				const model = container.model;
				if (!model || model.get('elType') !== 'widget' || model.get('widgetType') !== 'proton') {
					return;
				}
				const settings = model.get('settings');
				if (!settings || typeof settings.set !== 'function' || typeof settings.get !== 'function') {
					return;
				}
				const cur = settings.get(settingKey) || '';
				if (String(cur) !== strVal) {
					settings.set(settingKey, strVal);
				}
			});
		}

		// Hide panel if other widget is selected or panel changed
		elementor.hooks.addAction('panel/open_editor/widget', function (panel, model, view) {
			if (model.get('widgetType') !== 'proton') hideFloatingPanel();
		});
		elementor.hooks.addAction('panel/open_editor/elements', hideFloatingPanel);
		elementor.hooks.addAction('panel/open_editor/page_settings', hideFloatingPanel);
		elementor.hooks.addAction('panel/open_editor/section', hideFloatingPanel);
		elementor.hooks.addAction('panel/open_editor/column', hideFloatingPanel);
		elementor.hooks.addAction('panel/open_editor/container', hideFloatingPanel);

		// Target only the proton widget
		elementor.hooks.addAction('panel/open_editor/widget/proton', function (panel, model, view) {
			UichSHE.uiChemyComposerDebugLog('editor-open', {
				widgetId: model && model.get ? model.get('id') : null,
				widgetType: model && model.get ? model.get('widgetType') : null
			});
			UichSHE.activePanelView = panel;
			UichSHE.clearSelectedWidgetHoverState();
			UichSHE.activeWidgetPreviewView = view || null;
			UichSHE.ensureSelectedWidgetHoverStyle(view);
			if (UichSHE.activeWidgetPreviewView && UichSHE.activeWidgetPreviewView.$el && UichSHE.activeWidgetPreviewView.$el.length) {
				UichSHE.activeWidgetPreviewView.$el.addClass('uichemy-composer-widget-selected');
			}
			UichSHE.bindUiChemyComposerPreviewSelectionHandlers(UichSHE.activeWidgetPreviewView);


			// Hide panel if this specific widget is deleted
			model.on('destroy', hideFloatingPanel);

			// Maximize or reopen panel if widget is clicked in the preview again
			const floatPanel = document.getElementById('uichemy-composer-floating-panel');
			if (view && view.$el) {
				view.$el.off('click.uiChemyComposer').on('click.uiChemyComposer', function (e) {
					if (floatPanel) {
						if (floatPanel.classList.contains('minimized')) {
							floatPanel.classList.remove('minimized');
							const tBtn = document.getElementById('uichemy-composer-panel-toggle');
							if (tBtn) {
								tBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
							}
						}
						}
				});
			}

			const widgetSettings = model.get('settings');
			UichSHE.activeWidgetSettings = widgetSettings;

			// Notify the chat UI that a (possibly different) widget is now active
			// so it can reload the correct conversation history.
			const newWidgetId = String( widgetSettings && ( widgetSettings.id || widgetSettings.cid ) || '' );
			if ( window.uiChemyComposerWidget && typeof window.uiChemyComposerWidget.onWidgetChange === 'function' ) {
				window.uiChemyComposerWidget.onWidgetChange( newWidgetId );
			}

			UichSHE.initializeSharedSiteCustomCodeFromLocalizedData();
			UichSHE.applySharedSiteCustomCodeToSettings(widgetSettings, panel);
			UichSHE.fetchSharedSiteCustomCode().then(() => {
				UichSHE.applySharedSiteCustomCodeToSettings(widgetSettings, panel);
				UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-site-head', UichSHE.sharedSiteCustomCode.head, false);
				UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-site-footer', UichSHE.sharedSiteCustomCode.footer, false);
			});
			let isSyncing = false;
			let isFloatingSyncing = false;

			// Floating panel elements
			const htmlArea = document.getElementById('uichemy-composer-panel-html');
			const cssArea = document.getElementById('uichemy-composer-panel-css');
			const jsArea = document.getElementById('uichemy-composer-panel-js');
			const pageHeadArea = document.getElementById('uichemy-composer-panel-page-head');
			const pageFooterArea = document.getElementById('uichemy-composer-panel-page-footer');
			const siteHeadArea = document.getElementById('uichemy-composer-panel-site-head');
			const siteFooterArea = document.getElementById('uichemy-composer-panel-site-footer');
			if (!htmlArea || !cssArea || !jsArea || !pageHeadArea || !pageFooterArea || !siteHeadArea || !siteFooterArea) {
				// Panel markup comes from localized `panelHtml` + assets/html; missing nodes usually means empty config or mount race.
				if (window.console && typeof window.console.warn === 'function') {
					window.console.warn('[UiChemy UiChemy Composer] Floating panel fields not found. Check that panelHtml is localized and assets/html/uich-uichemy-composer-widget-editor-panel.html is readable.');
				}
				return;
			}
			UichSHE.destroyUiChemyComposerCodeEditorById('uichemy-composer-panel-html');
			UichSHE.destroyUiChemyComposerCodeEditorById('uichemy-composer-panel-css');
			UichSHE.destroyUiChemyComposerCodeEditorById('uichemy-composer-panel-js');
			UichSHE.destroyUiChemyComposerCodeEditorById('uichemy-composer-panel-page-head');
			UichSHE.destroyUiChemyComposerCodeEditorById('uichemy-composer-panel-page-footer');
			UichSHE.destroyUiChemyComposerCodeEditorById('uichemy-composer-panel-site-head');
			UichSHE.destroyUiChemyComposerCodeEditorById('uichemy-composer-panel-site-footer');

			// Populate initial values
			htmlArea.value = widgetSettings.get('raw_html') || '';
			cssArea.value = widgetSettings.get('raw_css') || '';
			jsArea.value = widgetSettings.get('raw_js') || '';
			const existingPageHead = widgetSettings.get('page_custom_code_head') || '';
			const existingPageFooter = widgetSettings.get('page_custom_code_footer') || '';
			const inheritPageHead = existingPageHead || uichFindFirstUiChemyComposerPageCustomCode('page_custom_code_head') || '';
			const inheritPageFooter = existingPageFooter || uichFindFirstUiChemyComposerPageCustomCode('page_custom_code_footer') || '';
			pageHeadArea.value = inheritPageHead;
			pageFooterArea.value = inheritPageFooter;
			// Backfill other UiChemy Composer widgets that were missing page-level fields (e.g. incremental MCP before this sync).
			if (!existingPageHead && inheritPageHead) {
				widgetSettings.set('page_custom_code_head', inheritPageHead);
				uichPropagateUiChemyComposerPageCustomCodeToAllWidgets('page_custom_code_head', inheritPageHead);
			}
			if (!existingPageFooter && inheritPageFooter) {
				widgetSettings.set('page_custom_code_footer', inheritPageFooter);
				uichPropagateUiChemyComposerPageCustomCodeToAllWidgets('page_custom_code_footer', inheritPageFooter);
			}
			siteHeadArea.value = widgetSettings.get('site_custom_code_head') || '';
			siteFooterArea.value = widgetSettings.get('site_custom_code_footer') || '';

			// Client-side instant live preview engine
			function getWidgetScopeSelector() {
				if (!view || !view.$el || !view.$el.length) {
					return '';
				}
				const classAttr = String(view.$el.attr('class') || '');
				const tokens = classAttr.split(/\s+/).filter(Boolean);
				for (let i = 0; i < tokens.length; i++) {
					if (/^elementor-element-[a-z0-9]+$/i.test(tokens[i])) {
						return `.${tokens[i]}`;
					}
				}
				return '';
			}

			function scopeCssToWidgetSelector(rawCss, scopeSelector) {
				const css = String(rawCss || '');
				const scope = String(scopeSelector || '').trim();
				if (!css.trim() || !scope) {
					return css;
				}
				// Inside @media we prefix selectors with a doubled scope so breakpoint rules bump up by
				// one class in specificity. This makes a `@media { .x { } }` rule win against a base
				// `.scope .compound img { }` rule that authored a higher-specificity base selector — the
				// natural Elementor behavior users expect when they author "tablet/mobile" overrides.
				const scopeBoostForMedia = `${scope}${scope}`;

				function findNextOpenBrace(text, offset) {
					let quote = '';
					for (let i = offset; i < text.length; i++) {
						const char = text[i];
						const next = text[i + 1] || '';

						if (quote) {
							if (char === '\\') {
								i++;
								continue;
							}
							if (char === quote) {
								quote = '';
							}
							continue;
						}

						if (char === '"' || char === "'") {
							quote = char;
							continue;
						}

						if (char === '/' && next === '*') {
							const end = text.indexOf('*/', i + 2);
							if (end === -1) {
								return -1;
							}
							i = end + 1;
							continue;
						}

						if (char === '{') {
							return i;
						}
					}
					return -1;
				}

				function findMatchingBrace(text, openIndex) {
					let depth = 0;
					let quote = '';
					for (let i = openIndex; i < text.length; i++) {
						const char = text[i];
						const next = text[i + 1] || '';

						if (quote) {
							if (char === '\\') {
								i++;
								continue;
							}
							if (char === quote) {
								quote = '';
							}
							continue;
						}

						if (char === '"' || char === "'") {
							quote = char;
							continue;
						}

						if (char === '/' && next === '*') {
							const end = text.indexOf('*/', i + 2);
							if (end === -1) {
								return -1;
							}
							i = end + 1;
							continue;
						}

						if (char === '{') {
							depth++;
							continue;
						}

						if (char === '}') {
							depth--;
							if (depth === 0) {
								return i;
							}
						}
					}
					return -1;
				}

				function prefixSelectorGroup(selectorGroup, currentScope) {
					const rawSelectorGroup = String(selectorGroup || '');
					if (/^\s*@/.test(rawSelectorGroup)) {
						return '';
					}
					const effectiveScope = String(currentScope || scope);

					const leadingGroupMatch = rawSelectorGroup.match(/^(\s*(?:\/\*[\s\S]*?\*\/\s*)*)/);
					const leadingGroup = leadingGroupMatch ? leadingGroupMatch[1] : '';
					const selectorGroupBody = rawSelectorGroup.slice(leadingGroup.length);

					const scopedGroup = selectorGroupBody
						.split(',')
						.map((part) => String(part || ''))
						.filter(Boolean)
						.map((part) => {
							const leadingSelectorMatch = part.match(/^(\s*(?:\/\*[\s\S]*?\*\/\s*)*)/);
							const leadingSelector = leadingSelectorMatch ? leadingSelectorMatch[1] : '';
							let selector = part.slice(leadingSelector.length).trim();

							if (!selector) {
								return '';
							}

							selector = selector.replace(/\{\{WRAPPER\}\}/gi, effectiveScope);
							selector = selector.replace(/(^|[\s>+~,(])selector(?=$|[\s>+~#.:,\[])/gi, `$1${effectiveScope}`);
							selector = selector.trim();

							const normalized = selector.toLowerCase();
							if (normalized === 'from' || normalized === 'to' || /^\d+%$/.test(selector)) {
								return `${leadingSelector}${selector}`;
							}
							if (selector === ':root') {
								return `${leadingSelector}${effectiveScope}`;
							}
							if (selector.indexOf(scope) === 0) {
								// Already scope-prefixed. Re-prefix with the effective (possibly boosted) scope so
								// nested @media bodies still get the higher specificity even when the inner rule
								// happens to start with the base scope token.
								const tail = selector.slice(scope.length);
								return `${leadingSelector}${effectiveScope}${tail}`;
							}
							return `${leadingSelector}${effectiveScope} ${selector}`;
						})
						.filter(Boolean)
						.join(', ');

					return scopedGroup ? `${leadingGroup}${scopedGroup}` : '';
				}

				function scopeCssBlock(blockCss, currentScope) {
					let output = '';
					let offset = 0;
					const activeScope = String(currentScope || scope);

					while (offset < blockCss.length) {
						const open = findNextOpenBrace(blockCss, offset);
						if (open === -1) {
							output += blockCss.slice(offset);
							break;
						}

						const close = findMatchingBrace(blockCss, open);
						if (close === -1) {
							output += blockCss.slice(offset);
							break;
						}

						const prelude = blockCss.slice(offset, open);
						let body = blockCss.slice(open + 1, close);
						let atRulePrelude = prelude;
						let atRuleMatch = prelude.match(/^\s*@([a-z-]+)/i);
						if (!atRuleMatch) {
							// Detect at-rules embedded in the prelude (e.g. stale `.elementor-element-x @media (...)` prefix).
							const embeddedMatch = prelude.match(/@(media|supports|container|layer|scope|document)\b/i);
							if (embeddedMatch) {
								atRulePrelude = prelude.substring(prelude.indexOf(embeddedMatch[0]));
								atRuleMatch = atRulePrelude.match(/^\s*@([a-z-]+)/i);
							}
						}

						if (atRuleMatch) {
							const atRule = String(atRuleMatch[1] || '').toLowerCase();
							if (['media', 'supports', 'container', 'layer', 'scope', 'document'].indexOf(atRule) !== -1) {
								const innerScope = atRule === 'media' ? scopeBoostForMedia : activeScope;
								body = scopeCssBlock(body, innerScope);
							}
							output += `${atRulePrelude}{${body}}`;
						} else {
							const scopedPrelude = prefixSelectorGroup(prelude, activeScope);
							output += `${scopedPrelude || prelude}{${body}}`;
						}

						offset = close + 1;
					}

					return output;
				}

				return reorderResponsiveMediaQueriesToEnd(scopeCssBlock(css, scope));
			}

			/**
			 * Frontend cascade fix: rules authored at the top level (desktop / base) and rules wrapped in
			 * @media (max-width/min-width) all collapse to the same specificity once scoped. CSS resolves
			 * ties by source order, so a base rule written AFTER a media block ends up overriding the
			 * breakpoint rule on small viewports. We sort @media blocks AFTER non-@media rules and order
			 * media-min/max-width pairs so the most-restrictive viewport wins (mobile-first cascade).
			 */
			function reorderResponsiveMediaQueriesToEnd(cssText) {
				const text = String(cssText || '');
				if (!text.trim() || text.indexOf('@media') === -1) {
					return text;
				}
				const blocks = [];
				let offset = 0;
				const len = text.length;
				while (offset < len) {
					const preStart = offset;
					while (offset < len) {
						const c = text[offset];
						if (/\s/.test(c)) { offset++; continue; }
						if (c === '/' && text[offset + 1] === '*') {
							const end = text.indexOf('*/', offset + 2);
							if (end === -1) { offset = len; break; }
							offset = end + 2;
							continue;
						}
						break;
					}
					const prelude = text.substring(preStart, offset);
					if (offset >= len) {
						if (prelude) {
							blocks.push({ type: 'rule', text: prelude });
						}
						break;
					}
					const headerStart = offset;
					let quote = '';
					while (offset < len) {
						const c = text[offset];
						const n = text[offset + 1] || '';
						if (quote) {
							if (c === '\\') { offset += 2; continue; }
							if (c === quote) quote = '';
							offset++;
							continue;
						}
						if (c === '"' || c === "'") { quote = c; offset++; continue; }
						if (c === '/' && n === '*') {
							const end = text.indexOf('*/', offset + 2);
							if (end === -1) { offset = len; break; }
							offset = end + 2;
							continue;
						}
						if (c === '{' || c === ';') break;
						offset++;
					}
					if (offset >= len) {
						blocks.push({ type: 'rule', text: prelude + text.substring(headerStart) });
						break;
					}
					if (text[offset] === ';') {
						offset++;
						blocks.push({ type: 'rule', text: prelude + text.substring(headerStart, offset) });
						continue;
					}
					const header = text.substring(headerStart, offset).trim();
					let depth = 1;
					let bodyQuote = '';
					offset++;
					while (offset < len && depth > 0) {
						const c = text[offset];
						const n = text[offset + 1] || '';
						if (bodyQuote) {
							if (c === '\\') { offset += 2; continue; }
							if (c === bodyQuote) bodyQuote = '';
							offset++;
							continue;
						}
						if (c === '"' || c === "'") { bodyQuote = c; offset++; continue; }
						if (c === '/' && n === '*') {
							const end = text.indexOf('*/', offset + 2);
							if (end === -1) { offset = len; break; }
							offset = end + 2;
							continue;
						}
						if (c === '{') depth++;
						else if (c === '}') depth--;
						offset++;
					}
					const blockText = prelude + text.substring(headerStart, offset);
					if (/^\s*@media\b/i.test(header)) {
						const mediaText = header.replace(/^\s*@media\s+/i, '').trim();
						let maxWidth = Infinity;
						let minWidth = 0;
						const maxMatch = mediaText.match(/max-width\s*:\s*([\d.]+)\s*px/i);
						const minMatch = mediaText.match(/min-width\s*:\s*([\d.]+)\s*px/i);
						if (maxMatch) maxWidth = parseFloat(maxMatch[1]);
						if (minMatch) minWidth = parseFloat(minMatch[1]);
						blocks.push({ type: 'media', text: blockText, maxWidth, minWidth, originalIdx: blocks.length });
					} else {
						blocks.push({ type: 'rule', text: blockText });
					}
				}
				const baseBlocks = [];
				const mediaBlocks = [];
				blocks.forEach((b) => {
					if (b.type === 'media') {
						mediaBlocks.push(b);
					} else {
						baseBlocks.push(b);
					}
				});
				mediaBlocks.sort((a, b) => {
					if (a.maxWidth !== b.maxWidth) {
						// max-width DESC — smaller max-width (more restrictive viewport) goes LAST so it wins.
						return b.maxWidth - a.maxWidth;
					}
					if (a.minWidth !== b.minWidth) {
						// min-width ASC — larger min-width (narrower desktop range) goes LAST so it wins.
						return a.minWidth - b.minWidth;
					}
					return (a.originalIdx || 0) - (b.originalIdx || 0);
				});
				return baseBlocks.map((b) => b.text).join('') + mediaBlocks.map((b) => b.text).join('');
			}

			function scopeStyleTagsInDoc(rootDoc, scopeSelector) {
				if (!rootDoc || typeof rootDoc.querySelectorAll !== 'function') {
					return;
				}
				const scope = String(scopeSelector || '').trim();
				if (!scope) {
					return;
				}
				rootDoc.querySelectorAll('style').forEach((styleEl) => {
					const cssText = styleEl && styleEl.textContent ? String(styleEl.textContent) : '';
					if (!cssText.trim()) {
						return;
					}
					styleEl.textContent = scopeCssToWidgetSelector(cssText, scope);
				});
			}

			function liveUpdatePreview() {
				if (!view || !view.$el) return;
				const container = view.$el.find('.elementor-widget-container');
				if (!container.length) return;

				const widgetScopeSelector = getWidgetScopeSelector();
				const rawHtml = widgetSettings.get('raw_html') || '';
				const rawCss = widgetSettings.get('raw_css') || '';
				const rawJs = widgetSettings.get('raw_js') || '';
				const doc = document.createElement('div');
				doc.innerHTML = rawHtml;
				scopeStyleTagsInDoc(doc, widgetScopeSelector);
				const nodes = UichSHE.extractTextNodes(doc);

				const currentDoc = document.createElement('div');
				currentDoc.innerHTML = container.html();
				Array.from(currentDoc.querySelectorAll('style, script')).forEach(el => el.remove());
				const currentNodes = UichSHE.extractTextNodes(currentDoc);

				for (let i = 0; i < 20; i++) {
					if (!nodes[i]) continue;
					UichSHE.applySlotSettingsToNode(nodes[i], widgetSettings, i);
				}

				let finalHtml = doc.innerHTML;
				const scopedRawCss = scopeCssToWidgetSelector(rawCss, widgetScopeSelector);
				if (scopedRawCss) finalHtml += `<style>${scopedRawCss}</style>`;
				if (rawJs) finalHtml += `<script>${rawJs}</script>`;

				container.html(finalHtml);
				UichSHE.refreshUiChemyComposerLayersPanel();
				// Rebuild preview selection handlers when hover/select mode is on. The previous binding
				// closed over a layer-root reference that was detached by `container.html(...)`, so
				// clicks would stop selecting until the user toggled the button off and on.
				if (UichSHE.activePreviewSelectionEnabled) {
					UichSHE.bindUiChemyComposerPreviewSelectionHandlers(view);
				}
				if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
					window.requestAnimationFrame(function () {
						window.requestAnimationFrame(function () {
							UichSHE.reapplyUiChemyComposerPreviewSelectionOutline();
						});
					});
				} else {
					UichSHE.reapplyUiChemyComposerPreviewSelectionOutline();
				}
			}

			// Helper to bind textarea to widget setting
			function bindFloatingArea(area, settingKey, editorInstance) {
				const handler = function () {
					if (isSyncing) return;
					isFloatingSyncing = true;
					const areaValue = editorInstance && editorInstance.codemirror
						? editorInstance.codemirror.getValue()
						: area.value;

					// Set the model first so any control handlers see the latest value; then mirror into the panel input.
					widgetSettings.set(settingKey, areaValue);

					if (settingKey === 'page_custom_code_head' || settingKey === 'page_custom_code_footer') {
						uichPropagateUiChemyComposerPageCustomCodeToAllWidgets(settingKey, areaValue);
					}

					if (panel && panel.$el) {
						const controlInput = panel.$el.find(`[data-setting="${settingKey}"]`);
						if (controlInput.length) {
							controlInput.val(areaValue).trigger('input').trigger('change');
						}
					}

					if (settingKey === 'site_custom_code_head' || settingKey === 'site_custom_code_footer') {
						const nextHead = settingKey === 'site_custom_code_head' ? areaValue : (widgetSettings.get('site_custom_code_head') || '');
						const nextFooter = settingKey === 'site_custom_code_footer' ? areaValue : (widgetSettings.get('site_custom_code_footer') || '');
						UichSHE.saveSharedSiteCustomCode(nextHead, nextFooter);
					}

					if (settingKey === 'raw_html') {
						if (view && view.$el) {
							const container = view.$el.find('.elementor-widget-container');
							if (container.length) {
								let finalHtml = areaValue;
								const rawCss = widgetSettings.get('raw_css') || '';
								const rawJs = widgetSettings.get('raw_js') || '';
								const widgetScopeSelector = getWidgetScopeSelector();
								const htmlDoc = document.createElement('div');
								htmlDoc.innerHTML = finalHtml;
								scopeStyleTagsInDoc(htmlDoc, widgetScopeSelector);
								finalHtml = htmlDoc.innerHTML;
								const scopedRawCss = scopeCssToWidgetSelector(rawCss, widgetScopeSelector);
								if (scopedRawCss) finalHtml += `<style>${scopedRawCss}</style>`;
								if (rawJs) finalHtml += `<script>${rawJs}</script>`;
								container.html(finalHtml);
								if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
									window.requestAnimationFrame(function () {
										window.requestAnimationFrame(function () {
											UichSHE.reapplyUiChemyComposerPreviewSelectionOutline();
										});
									});
								} else {
									UichSHE.reapplyUiChemyComposerPreviewSelectionOutline();
								}
							}
						}
					} else {
						liveUpdatePreview(); // Instant visual update without server refresh
					}
					UichSHE.refreshUiChemyComposerLayersPanel();

					isFloatingSyncing = false;
				};
				if (editorInstance && editorInstance.codemirror) {
					editorInstance.codemirror.on('change', handler);
				} else {
					area.addEventListener('input', handler);
				}

				// Clean up listener on next widget open by overwriting the element or we can just leave it if we clear listeners.
				// For simplicity, we can clone and replace the elements to remove old listeners.
			}

			// Clean up old listeners
			const newHtmlArea = htmlArea.cloneNode(true);
			const newCssArea = cssArea.cloneNode(true);
			const newJsArea = jsArea.cloneNode(true);
			const newPageHeadArea = pageHeadArea.cloneNode(true);
			const newPageFooterArea = pageFooterArea.cloneNode(true);
			const newSiteHeadArea = siteHeadArea.cloneNode(true);
			const newSiteFooterArea = siteFooterArea.cloneNode(true);
			htmlArea.parentNode.replaceChild(newHtmlArea, htmlArea);
			cssArea.parentNode.replaceChild(newCssArea, cssArea);
			jsArea.parentNode.replaceChild(newJsArea, jsArea);
			pageHeadArea.parentNode.replaceChild(newPageHeadArea, pageHeadArea);
			pageFooterArea.parentNode.replaceChild(newPageFooterArea, pageFooterArea);
			siteHeadArea.parentNode.replaceChild(newSiteHeadArea, siteHeadArea);
			siteFooterArea.parentNode.replaceChild(newSiteFooterArea, siteFooterArea);
			const htmlEditor = UichSHE.initializeUiChemyComposerCodeEditor(newHtmlArea, 'html');
			const cssEditor = UichSHE.initializeUiChemyComposerCodeEditor(newCssArea, 'css');
			const jsEditor = UichSHE.initializeUiChemyComposerCodeEditor(newJsArea, 'js');
			const pageHeadEditor = UichSHE.initializeUiChemyComposerCodeEditor(newPageHeadArea, 'pageCode');
			const pageFooterEditor = UichSHE.initializeUiChemyComposerCodeEditor(newPageFooterArea, 'pageCode');
			const siteHeadEditor = UichSHE.initializeUiChemyComposerCodeEditor(newSiteHeadArea, 'siteCodeEditor');
			const siteFooterEditor = UichSHE.initializeUiChemyComposerCodeEditor(newSiteFooterArea, 'siteCodeEditor');

			bindFloatingArea(newHtmlArea, 'raw_html', htmlEditor);
			bindFloatingArea(newCssArea, 'raw_css', cssEditor);
			bindFloatingArea(newJsArea, 'raw_js', jsEditor);
			bindFloatingArea(newPageHeadArea, 'page_custom_code_head', pageHeadEditor);
			bindFloatingArea(newPageFooterArea, 'page_custom_code_footer', pageFooterEditor);
			bindFloatingArea(newSiteHeadArea, 'site_custom_code_head', siteHeadEditor);
			bindFloatingArea(newSiteFooterArea, 'site_custom_code_footer', siteFooterEditor);

			// Sync from Elementor to Floating panel (in case changed via history or other means)
			widgetSettings.on('change:raw_html', function () {
				const nextValue = widgetSettings.get('raw_html') || '';
				if (!isFloatingSyncing && UichSHE.getUiChemyComposerEditorValueById('uichemy-composer-panel-html') !== nextValue) {
					UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-html', nextValue, false);
				}
				UichSHE.refreshUiChemyComposerLayersPanel();
			});
			widgetSettings.on('change:raw_css', function () {
				const nextValue = widgetSettings.get('raw_css') || '';
				if (!isFloatingSyncing && UichSHE.getUiChemyComposerEditorValueById('uichemy-composer-panel-css') !== nextValue) {
					UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-css', nextValue, false);
				}
			});
			widgetSettings.on('change:raw_js', function () {
				const nextValue = widgetSettings.get('raw_js') || '';
				if (!isFloatingSyncing && UichSHE.getUiChemyComposerEditorValueById('uichemy-composer-panel-js') !== nextValue) {
					UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-js', nextValue, false);
				}
			});
			widgetSettings.on('change:page_custom_code_head', function () {
				const nextValue = widgetSettings.get('page_custom_code_head') || '';
				if (!isFloatingSyncing && UichSHE.getUiChemyComposerEditorValueById('uichemy-composer-panel-page-head') !== nextValue) {
					UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-page-head', nextValue, false);
				}
			});
			widgetSettings.on('change:page_custom_code_footer', function () {
				const nextValue = widgetSettings.get('page_custom_code_footer') || '';
				if (!isFloatingSyncing && UichSHE.getUiChemyComposerEditorValueById('uichemy-composer-panel-page-footer') !== nextValue) {
					UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-page-footer', nextValue, false);
				}
			});
			widgetSettings.on('change:site_custom_code_head', function () {
				const nextValue = widgetSettings.get('site_custom_code_head') || '';
				UichSHE.setSharedSiteCustomCode(nextValue, widgetSettings.get('site_custom_code_footer') || '');
				if (!isFloatingSyncing && UichSHE.getUiChemyComposerEditorValueById('uichemy-composer-panel-site-head') !== nextValue) {
					UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-site-head', nextValue, false);
				}
			});
			widgetSettings.on('change:site_custom_code_footer', function () {
				const nextValue = widgetSettings.get('site_custom_code_footer') || '';
				UichSHE.setSharedSiteCustomCode(widgetSettings.get('site_custom_code_head') || '', nextValue);
				if (!isFloatingSyncing && UichSHE.getUiChemyComposerEditorValueById('uichemy-composer-panel-site-footer') !== nextValue) {
					UichSHE.setUiChemyComposerEditorValueById('uichemy-composer-panel-site-footer', nextValue, false);
				}
			});

			/** Pending slot_/link_ reverse-sync timers; cleared when raw_html changes so stale slot values cannot overwrite newer HTML. */
			const cancelPendingUiChemyComposerSlotLinkReverseSync = [];

			/**
			 * Keep slot_* / link / visibility in the Elementor model aligned with the current raw_html markup.
			 * Must run on every raw_html change (not only debounced): liveUpdatePreview merges slot_* into the
			 * canvas immediately on change:slot_*; if slots lag behind raw_html by ~1s, deleted text reappears.
			 */
			function applyUiChemyComposerSlotModelFromParsedRawHtml(rawHtml) {
				if (typeof rawHtml !== 'string') {
					return;
				}

				const doc = document.createElement('div');
				doc.innerHTML = rawHtml;

				const nodes = UichSHE.extractTextNodes(doc);

				isSyncing = true;
				const dynamics = widgetSettings.get('__dynamic__') || {};

				for (let i = 0; i < 20; i++) {
					const visibleKey = `slot_${i}_visible`;
					if (i < nodes.length) {
						UichSHE.syncSlotSettingsFromNode(widgetSettings, i, nodes[i], panel, dynamics);
					} else {
						widgetSettings.set(visibleKey, 'no');
					}
				}

				isSyncing = false;

				UichSHE.refreshAllSlotSvgCodeMediaPreviews(widgetSettings, panel);

				if (!isFloatingSyncing) {
					liveUpdatePreview();
				}
			}

			const debouncedHtmlChange = UichSHE.debounce(function () {
				const rawHtml = widgetSettings.get('raw_html');
				if (typeof rawHtml !== 'string') return;

				applyUiChemyComposerSlotModelFromParsedRawHtml(rawHtml);

				// Avoid server re-render while the UiChemy Composer floating UI is active: it can restore stale markup
				// and revert in-panel text / slot edits. Hover/selection DOM is also replaced by that path.
				if (typeof model.renderRemoteServer === 'function' && !UichSHE.isUiChemyComposerWidgetEditorActive()) {
					model.renderRemoteServer();
				}

				if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
					window.requestAnimationFrame(reapplyUiChemyComposerPreviewSelectionOutline);
				} else {
					UichSHE.reapplyUiChemyComposerPreviewSelectionOutline();
				}
			}, 1000);

			// Listen to changes on raw_html
			widgetSettings.on('change:raw_html', function () {
				if (isSyncing) return;
				cancelPendingUiChemyComposerSlotLinkReverseSync.forEach(function (fn) {
					if (typeof fn.cancel === 'function') {
						fn.cancel();
					}
				});
				const rawHtmlNow = widgetSettings.get('raw_html');
				if (typeof rawHtmlNow === 'string') {
					applyUiChemyComposerSlotModelFromParsedRawHtml(rawHtmlNow);
				}
				debouncedHtmlChange();
			});

			// Listen to changes on fields (Reverse Sync)
			for (let i = 0; i < 20; i++) {
				const debouncedSlotReverseSync = UichSHE.debounce(function () {
					const dynamics = widgetSettings.get('__dynamic__') || {};
					const isDynamic = !!(dynamics[`slot_${i}`] && dynamics[`slot_${i}`] !== '');
					if (isDynamic) return;

					const rawHtml = widgetSettings.get('raw_html');
					if (typeof rawHtml !== 'string') return;

					const doc = document.createElement('div');
					doc.innerHTML = rawHtml;
					const nodes = UichSHE.extractTextNodes(doc);
					const node = nodes[i];
					if (!node) return;

					const kind = UichSHE.getSlotKind(node);
					if (kind === 'image' || kind === 'svg') return;

					isSyncing = true;
					UichSHE.applySlotSettingsToNode(node, widgetSettings, i);
					widgetSettings.set('raw_html', doc.innerHTML);
					isSyncing = false;
					UichSHE.refreshUiChemyComposerLayersPanel();
				}, 500);
				cancelPendingUiChemyComposerSlotLinkReverseSync.push(debouncedSlotReverseSync);

				const debouncedMediaSlotReverseSync = UichSHE.debounce(function () {
					const rawHtml = widgetSettings.get('raw_html');
					if (typeof rawHtml !== 'string') return;

					const doc = document.createElement('div');
					doc.innerHTML = rawHtml;
					const nodes = UichSHE.extractTextNodes(doc);
					const node = nodes[i];
					if (!node) return;

					isSyncing = true;
					UichSHE.applySlotSettingsToNode(node, widgetSettings, i);
					widgetSettings.set('raw_html', doc.innerHTML);
					isSyncing = false;
					UichSHE.refreshUiChemyComposerLayersPanel();
				}, 500);

				const debouncedSvgCodeMediaReverseSync = UichSHE.debounce(function () {
					if (isSyncing) {
						return;
					}
					if (String(widgetSettings.get(`slot_${i}_svg_mode`) || 'code') !== 'code') {
						return;
					}
					UichSHE.resolveSvgCodeFromPanelMediaChange(widgetSettings, i).then(function () {
						debouncedMediaSlotReverseSync();
					});
				}, 500);
				cancelPendingUiChemyComposerSlotLinkReverseSync.push(debouncedMediaSlotReverseSync);
				cancelPendingUiChemyComposerSlotLinkReverseSync.push(debouncedSvgCodeMediaReverseSync);

				widgetSettings.on(`change:slot_${i}`, function () {
					if (!isSyncing) liveUpdatePreview();
					if (isSyncing) return;
					debouncedSlotReverseSync();
					UichSHE.refreshUiChemyComposerLayersPanel();
				});

				[
					`slot_${i}_link`,
					`slot_${i}_image`,
					`slot_${i}_image_alt`,
					`slot_${i}_svg_mode`,
					`slot_${i}_svg_code`,
					`slot_${i}_svg_code_media`,
					`slot_${i}_svg_url`
				].forEach(function (settingKey) {
					widgetSettings.on(`change:${settingKey}`, function () {
						if (!isSyncing) liveUpdatePreview();
						if (isSyncing) return;
						if (settingKey === `slot_${i}_svg_code_media`) {
							debouncedSvgCodeMediaReverseSync();
						} else {
							debouncedMediaSlotReverseSync();
						}
						UichSHE.refreshUiChemyComposerLayersPanel();
						if (settingKey === `slot_${i}_svg_code` || settingKey === `slot_${i}_svg_mode`) {
							UichSHE.syncSlotSvgCodeMediaPreview(
								widgetSettings,
								i,
								widgetSettings.get(`slot_${i}_svg_code`) || '',
								panel
							);
						}
					});
				});
			}

			const debouncedServerRender = UichSHE.debounce(function () {
				if (typeof model.renderRemoteServer === 'function') {
					model.renderRemoteServer();
				}
			}, 1000);

			// Dynamic tags cannot be resolved purely on the client side, they require a server fetch
			widgetSettings.on('change:__dynamic__', function () {
				debouncedServerRender();
				UichSHE.refreshUiChemyComposerLayersPanel();
			});

			// Run an initial synchronisation sequence immediately upon editor open.
			// This covers the case where the widget was imported from JSON or an external platform (like UiChemy)
			// without generating active local keystroke inputs inside the Editor.
			if (!isSyncing) {
				const rhInit = widgetSettings.get('raw_html');
				if (typeof rhInit === 'string') {
					applyUiChemyComposerSlotModelFromParsedRawHtml(rhInit);
				}
				debouncedHtmlChange();
				UichSHE.refreshUiChemyComposerLayersPanel();
				window.setTimeout(function () {
					UichSHE.refreshAllSlotSvgCodeMediaPreviews(widgetSettings, panel);
				}, 120);
			}

		});

	}

	if (window.elementor) {
		onElementorInit();
	} else {
		$(window).on('elementor:init', onElementorInit);
	}

})(jQuery);
