/**
 * Claude Agent chat integration for UiChemy Composer Widget editor.
 *
 * Hooks into the existing chat tab via the window.uiChemyComposerWidget bridge
 * exposed by uich-uichemy-composer-widget-editor-panel.js.
 *
 * Responsibilities:
 *  - Wait for the bridge to be ready
 *  - WordPress provider: browser agent loop + REST /agent/turn (no sidecar)
 *  - CLI providers: local claude-agent sidecar (/ask + WebSocket tools)
 *  - Handle the "pick element" button in the chat bar
 *  - Chat history + images: WordPress DB + uploads (all providers)
 */
( function () {
	'use strict';

	/** How often (ms) to check if the bridge is ready. */
	var BRIDGE_POLL_INTERVAL = 100;

	/** Maximum attempts before giving up (10 seconds total). */
	var BRIDGE_MAX_ATTEMPTS = 100;

	// ─── Styles ──────────────────────────────────────────────────────────────────

	function injectStyles() {
		if ( document.getElementById( 'uich-claude-chat-styles' ) ) {
			return;
		}
		var style = document.createElement( 'style' );
		style.id = 'uich-claude-chat-styles';
		style.textContent = [
			/* ── Execution log — tool step rows (excluded from text selection/copy) ── */
			'.uichemy-composer-chat-message.tool-step{font-size:10.5px;color:rgba(255,255,255,.38);padding:2px 14px;background:transparent;border:none;display:flex;align-items:center;gap:6px;animation:uich-step-in .15s ease;user-select:none;-webkit-user-select:none}',
			'@keyframes uich-step-in{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}',
			'.uichemy-composer-chat-message.tool-step::before{content:"—";color:rgba(167,139,250,.5);font-size:10px;flex-shrink:0;user-select:none;-webkit-user-select:none}',
			/* ── Waiting indicator (pulsing) ── */
			'.uichemy-composer-chat-message.tool-step.is-waiting{animation:uich-step-in .15s ease,uich-pulse 1.4s ease-in-out infinite}',
			'@keyframes uich-pulse{0%,100%{opacity:.3}50%{opacity:.7}}',
			/* ── Streaming text bubble — blinking cursor (decorative, never copied) ── */
			'.uichemy-composer-chat-message.assistant.streaming::after{content:"▋";animation:uich-cursor-blink .8s steps(1) infinite;color:rgba(167,139,250,.75);margin-left:2px;user-select:none;-webkit-user-select:none}',
			'@keyframes uich-cursor-blink{0%,100%{opacity:1}50%{opacity:0}}',
			/* ── System notices — metadata, not user content ── */
			'.uichemy-composer-chat-message.system{user-select:none;-webkit-user-select:none}',
			/* ── History separator ── */
			'.uich-history-sep{font-size:10px;text-align:center;color:rgba(255,255,255,.2);padding:6px 0;border-top:1px solid rgba(255,255,255,.06);margin-top:4px;user-select:none;-webkit-user-select:none}',
			/* ── Model selector bar ── */
			'.uich-model-bar{display:flex;align-items:center;padding:4px 10px;border-bottom:1px solid var(--uichemy-composer-border-color);background:transparent;flex-shrink:0;gap:6px}',
			'.uich-model-btn{display:inline-flex;align-items:center;gap:6px;background:var(--uichemy-composer-input-bg);border:1px solid var(--uichemy-composer-border-color);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--uichemy-composer-text-color);cursor:pointer;transition:background .15s,border-color .15s;position:relative;user-select:none;min-width:0;max-width:100%}',
			'.uich-model-btn:hover{border-color:var(--uichemy-composer-accent-color)}',
			'.uich-model-btn svg{opacity:.6;flex-shrink:0}',
			'.uich-model-btn .uich-mb-provider{font-weight:600;letter-spacing:.02em;flex-shrink:0}',
			'.uich-model-btn .uich-mb-sep{opacity:.35;flex-shrink:0}',
			'.uich-model-btn .uich-mb-name{opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
			/* Dropdown — grouped by provider, neutral colors matching the panel */
			'.uich-model-dropdown{position:fixed;min-width:240px;max-width:320px;max-height:420px;overflow-y:auto;background:var(--uichemy-composer-panel-bg);border:1px solid var(--uichemy-composer-border-color);border-radius:6px;box-shadow:0 8px 24px var(--uichemy-composer-popover-shadow,rgba(0,0,0,.25));z-index:2147483647;animation:uich-fadein .12s ease;padding:4px 0;color:var(--uichemy-composer-text-color)}',
			'.uich-model-dropdown::-webkit-scrollbar{width:6px}',
			'.uich-model-dropdown::-webkit-scrollbar-track{background:transparent}',
			'.uich-model-dropdown::-webkit-scrollbar-thumb{background:var(--uichemy-composer-border-color);border-radius:3px}',
			'.uich-model-dropdown::-webkit-scrollbar-thumb:hover{background:var(--uichemy-composer-accent-color)}',
			'.uich-model-dropdown{scrollbar-width:thin;scrollbar-color:var(--uichemy-composer-border-color) transparent}',
			'.uich-model-group + .uich-model-group{border-top:1px solid var(--uichemy-composer-border-color);margin-top:2px;padding-top:4px}',
			'.uich-model-group-header{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:6px 12px 4px;user-select:none;color:var(--uichemy-composer-text-muted);opacity:.65}',
			'.uich-model-group-empty{font-size:10.5px;color:var(--uichemy-composer-text-muted);opacity:.45;padding:2px 12px 6px;font-style:italic}',
			'.uich-model-option{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 26px;font-size:12px;color:var(--uichemy-composer-text-color);cursor:pointer;transition:background .1s;position:relative}',
			'.uich-model-option:hover{background:var(--uichemy-composer-chip-hover-bg,rgba(0,0,0,.04))}',
			'.uich-model-option.active{color:var(--uichemy-composer-text-muted);font-weight:600}',
			'.uich-model-option .uich-model-check{position:absolute;left:10px;width:12px;opacity:0}',
			'.uich-model-option.active .uich-model-check{opacity:1}',
			/* ── Refresh button ── */
			'.uich-model-refresh{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:6px;background:transparent;border:1px solid rgba(255,255,255,.1);border-radius:5px;color:rgba(255,255,255,.45);cursor:pointer;transition:background .15s,color .15s,border-color .15s;flex-shrink:0;padding:0}',
			'.uich-model-refresh:hover{background:rgba(255,255,255,.07);color:rgba(255,255,255,.8);border-color:rgba(255,255,255,.2)}',
			'.uich-model-refresh.spinning svg{animation:uich-spin .8s linear infinite}',
			'@keyframes uich-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
			/* ── Toast ── */
			'.uich-toast{position:fixed;bottom:24px;right:24px;z-index:9999999;background:#16161e;border:1px solid rgba(99,102,241,.4);border-radius:8px;padding:8px 14px;font-size:12px;color:#a5b4fc;box-shadow:0 4px 16px rgba(0,0,0,.4);animation:uich-fadein .2s ease;pointer-events:none}',
			'@keyframes uich-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
			/* ── AI provider badge (metadata — never copied) ── */
			'.uich-ai-badge{display:block;font-size:9.5px;color:rgba(255,255,255,.22);margin-top:4px;letter-spacing:.02em;user-select:none;-webkit-user-select:none}',
			'.uich-ai-badge.claude{color:rgba(167,139,250,.35)}',
			'.uich-ai-badge.codex{color:rgba(52,211,153,.3)}',
			'.uich-ai-badge.opencode{color:rgba(34,211,238,.4)}',
			'.uich-ai-badge.wp{color:rgba(96,165,250,.35)}',
			/* ── Markdown rendering inside assistant messages ── */
			'.uichemy-composer-chat-message.assistant .uich-md-p{margin:0 0 6px}',
			'.uichemy-composer-chat-message.assistant .uich-md-p:last-child{margin-bottom:0}',
			'.uichemy-composer-chat-message.assistant .uich-md-gap{height:6px}',
			'.uichemy-composer-chat-message.assistant .uich-md-h{font-weight:700;margin:10px 0 4px;line-height:1.3}',
			'.uichemy-composer-chat-message.assistant h1.uich-md-h{font-size:15px}',
			'.uichemy-composer-chat-message.assistant h2.uich-md-h{font-size:13.5px}',
			'.uichemy-composer-chat-message.assistant h3.uich-md-h{font-size:12.5px}',
			'.uichemy-composer-chat-message.assistant .uich-md-ul,.uichemy-composer-chat-message.assistant .uich-md-ol{margin:4px 0 8px;padding-left:18px}',
			'.uichemy-composer-chat-message.assistant .uich-md-ul{list-style:disc}',
			'.uichemy-composer-chat-message.assistant .uich-md-ol{list-style:decimal}',
			'.uichemy-composer-chat-message.assistant li{margin-bottom:3px;line-height:1.55}',
			'.uichemy-composer-chat-message.assistant strong{font-weight:700;color:inherit}',
			'.uichemy-composer-chat-message.assistant em{font-style:italic}',
			'.uichemy-composer-chat-message.assistant code{font-family:monospace;font-size:11.5px;background:rgba(255,255,255,.07);padding:1px 5px;border-radius:3px}',
			'.uichemy-composer-chat-message.assistant pre{background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:10px 12px;overflow-x:auto;margin:6px 0}',
			'.uichemy-composer-chat-message.assistant pre code{background:none;padding:0;font-size:11.5px}',
			'.uichemy-composer-chat-message.assistant hr{border:none;border-top:1px solid rgba(255,255,255,.1);margin:10px 0}',
		].join( '\n' );
		document.head.appendChild( style );
	}

	// ─── Markdown renderer ───────────────────────────────────────────────────────

	/**
	 * Lightweight markdown → HTML renderer for assistant messages.
	 * Handles: headings, bold, italic, inline code, code blocks, bullet lists,
	 * numbered lists, horizontal rules and line breaks.
	 *
	 * @param  {string} raw
	 * @returns {string} safe HTML
	 */
	function renderMarkdown( raw ) {
		if ( !raw ) return '';

		// 1. Escape HTML entities first so injected text can't break layout.
		function esc( s ) {
			return String( s )
				.replace( /&/g, '&amp;' )
				.replace( /</g, '&lt;' )
				.replace( />/g, '&gt;' )
				.replace( /"/g, '&quot;' );
		}

		// 2. Inline formatting (applied after block-level processing).
		function inline( s ) {
			return s
				// Inline code  `code`
				.replace( /`([^`]+)`/g, '<code>$1</code>' )
				// Bold  **text** or __text__
				.replace( /\*\*(.+?)\*\*/g, '<strong>$1</strong>' )
				.replace( /__(.+?)__/g, '<strong>$1</strong>' )
				// Italic  *text* or _text_
				.replace( /\*(.+?)\*/g, '<em>$1</em>' )
				.replace( /_(.+?)_/g, '<em>$1</em>' );
		}

		var lines   = esc( raw ).split( '\n' );
		var out     = [];
		var inList  = false;  // ul
		var inOList = false;  // ol
		var inCode  = false;  // fenced code block

		function closeList() {
			if ( inList  ) { out.push( '</ul>' );  inList  = false; }
			if ( inOList ) { out.push( '</ol>' );  inOList = false; }
		}

		for ( var i = 0; i < lines.length; i++ ) {
			var line = lines[ i ];

			// Fenced code blocks  ```
			if ( /^```/.test( line ) ) {
				if ( inCode ) {
					out.push( '</code></pre>' );
					inCode = false;
				} else {
					closeList();
					out.push( '<pre><code>' );
					inCode = true;
				}
				continue;
			}
			if ( inCode ) { out.push( line ); continue; }

			// Horizontal rule --- or ***
			if ( /^[-*]{3,}$/.test( line.trim() ) ) {
				closeList();
				out.push( '<hr>' );
				continue;
			}

			// Headings  # ## ###
			var hMatch = line.match( /^(#{1,3})\s+(.+)/ );
			if ( hMatch ) {
				closeList();
				var lvl = hMatch[ 1 ].length;
				out.push( '<h' + lvl + ' class="uich-md-h">' + inline( hMatch[ 2 ] ) + '</h' + lvl + '>' );
				continue;
			}

			// Unordered list  - or * or +
			var ulMatch = line.match( /^[\-\*\+]\s+(.+)/ );
			if ( ulMatch ) {
				if ( inOList ) { out.push( '</ol>' ); inOList = false; }
				if ( !inList ) { out.push( '<ul class="uich-md-ul">' ); inList = true; }
				out.push( '<li>' + inline( ulMatch[ 1 ] ) + '</li>' );
				continue;
			}

			// Numbered list  1. item
			var olMatch = line.match( /^\d+\.\s+(.+)/ );
			if ( olMatch ) {
				if ( inList ) { out.push( '</ul>' ); inList = false; }
				if ( !inOList ) { out.push( '<ol class="uich-md-ol">' ); inOList = true; }
				out.push( '<li>' + inline( olMatch[ 1 ] ) + '</li>' );
				continue;
			}

			// Blank line — close lists, add spacing.
			if ( !line.trim() ) {
				closeList();
				out.push( '<div class="uich-md-gap"></div>' );
				continue;
			}

			// Regular paragraph line.
			closeList();
			out.push( '<p class="uich-md-p">' + inline( line ) + '</p>' );
		}

		if ( inCode  ) out.push( '</code></pre>' );
		closeList();

		return out.join( '' );
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	/**
	 * Build a CSS selector string for an element (used as context for the agent).
	 *
	 * @param  {Element} el
	 * @returns {string}
	 */
	function getSelectionSelector( el ) {
		if ( !el || !el.tagName ) {
			return '';
		}
		var tag = String( el.tagName ).toLowerCase();
		if ( el.id ) {
			return '#' + el.id;
		}
		var classPart = '';
		if ( el.className ) {
			classPart = '.' + String( el.className ).split( ' ' ).filter( Boolean ).join( '.' );
		}
		return tag + classPart;
	}

	// ─── Toast ───────────────────────────────────────────────────────────────────

	/**
	 * Show a brief floating toast message.
	 *
	 * @param {string} msg
	 * @param {number} [duration=2800]
	 */
	function showToast( msg, duration ) {
		var t = document.createElement( 'div' );
		t.className = 'uich-toast';
		t.textContent = msg;
		document.body.appendChild( t );
		setTimeout( function () {
			if ( t.parentNode ) t.parentNode.removeChild( t );
		}, duration || 2800 );
	}

	// ─── Shared model ID formatter ───────────────────────────────────────────────

	/**
	 * Convert any model ID to a human-readable display name.
	 *
	 * Handles Claude and all OpenAI formats, including the quirk where Codex CLI
	 * reports model IDs with dashes as decimal separators (e.g. gpt-5-5 = GPT-5.5).
	 *
	 * Examples:
	 *   claude-sonnet-4-5       → Claude Sonnet 4.5
	 *   gpt-5.5                 → GPT-5.5
	 *   gpt-5-5   (CLI quirk)   → GPT-5.5   (dash-between-digits → dot)
	 *   gpt-5.4-mini            → GPT-5.4 Mini
	 *   gpt-5-4-mini            → GPT-5.4 Mini
	 *   gpt-5.3-codex           → GPT-5.3 Codex
	 *   gpt-4o                  → GPT-4o    (letter suffix preserved as-is)
	 *   o4-mini                 → O4 Mini
	 *   o3                      → O3
	 */
	function formatModelId( id ) {
		if ( !id ) return id;

		// ── OpenCode `provider/model` form — recurse on the model part ────────────
		// e.g. "anthropic/claude-sonnet-4-6" → "Claude Sonnet 4.6"
		//      "opencode/big-pickle"         → "Big Pickle"
		var slash = id.indexOf( '/' );
		if ( slash !== -1 ) {
			var modelOnly = id.slice( slash + 1 );
			var formatted = formatModelId( modelOnly );
			if ( formatted && formatted !== modelOnly ) return formatted;
			// Fallback: Title-Case the model portion.
			return modelOnly.split( '-' ).map( function ( w ) {
				return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
			} ).join( ' ' );
		}

		// ── Claude ────────────────────────────────────────────────────────────────
		var c = id.match( /^claude-([a-z]+)-(\d{1,2})-(\d{1,2})/i );
		if ( c ) {
			return 'Claude ' + c[1].charAt(0).toUpperCase() + c[1].slice(1) + ' ' + c[2] + '.' + c[3];
		}

		// ── OpenAI GPT ────────────────────────────────────────────────────────────
		var g = id.match( /^gpt-(.+)$/i );
		if ( g ) {
			var suffix = g[1];
			// Normalise: dash between two digit sequences = decimal (e.g. "5-5" → "5.5").
			suffix = suffix.replace( /(\d)-(\d)/g, '$1.$2' );
			// Split on remaining dashes → first token is version, rest are variant words.
			var parts = suffix.split( '-' );
			var formatted = parts.map( function ( p, i ) {
				// Version token (index 0): keep as-is (preserves "4o", "5.5", etc.)
				if ( i === 0 ) return p;
				// Variant words: Title Case.
				return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
			} ).join( ' ' );
			return 'GPT-' + formatted;
		}

		// ── OpenAI reasoning models (o3, o4-mini, o3-mini …) ─────────────────────
		var o = id.match( /^(o\d+)(?:-(.+))?$/i );
		if ( o ) {
			var base    = o[1].toUpperCase();
			var variant = o[2]
				? ' ' + o[2].split('-').map( function(w) {
					return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
				} ).join(' ')
				: '';
			return base + variant;
		}

		// ── Google Gemma ──────────────────────────────────────────────────────────
		// gemma-4-31b-it → Gemma 4 31B IT
		var gemma = id.match( /^gemma-(.+)$/i );
		if ( gemma ) {
			var parts = gemma[1].split('-').map(function(w){
				return /^\d+b$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
			});
			return 'Gemma ' + parts.join(' ');
		}

		// ── Google Gemini ─────────────────────────────────────────────────────────
		// gemini-2.5-pro → Gemini 2.5 Pro / gemini-2.0-flash-lite → Gemini 2.0 Flash Lite
		var gem = id.match( /^gemini-(.+)$/i );
		if ( gem ) {
			var parts = gem[1].split( '-' );
			// First two tokens are the version if they're digit-like (e.g. "2" "5" → "2.5")
			var version = '';
			var rest    = [];
			if ( parts.length >= 2 && /^\d+$/.test( parts[0] ) && /^\d+$/.test( parts[1] ) ) {
				version = parts[0] + '.' + parts[1];
				rest    = parts.slice( 2 );
			} else if ( parts.length >= 1 && /^\d+$/.test( parts[0] ) ) {
				version = parts[0];
				rest    = parts.slice( 1 );
			} else {
				rest = parts;
			}
			var variantStr = rest.map( function(w) {
				return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
			} ).join( ' ' );
			return 'Gemini ' + ( version ? version + ( variantStr ? ' ' + variantStr : '' ) : variantStr );
		}

		// Fallback — return the raw ID.
		return id;
	}

	// ─── AI provider badge ───────────────────────────────────────────────────────

	/**
	 * Build a small provider + model badge element for an assistant message.
	 *
	 * @param {string} provider   'anthropic' | 'openai' | 'google' | 'opencode' | ''
	 * @param {string} modelId    e.g. 'claude-sonnet-4-5' | 'gpt-4.1' | 'anthropic/claude-sonnet-4-6'
	 * @returns {HTMLElement}
	 */
	function buildAiBadge( provider, modelId ) {
		var badge = document.createElement( 'span' );
		var cls   = provider === 'openai'   ? 'codex'
		          : provider === 'google'   ? 'codex'
		          : provider === 'opencode' ? 'opencode'
		          : provider === 'wp'       ? 'wp'
		          : 'claude';
		badge.className = 'uich-ai-badge ' + cls;

		var icon = provider === 'openai'   ? '⬡'
		         : provider === 'google'   ? '✦'
		         : provider === 'opencode' ? '◉'
		         : '◆';
		var name = modelId
			? formatModelId( modelId )
			: ( provider === 'openai'   ? 'Codex'
			  : provider === 'google'   ? 'Gemini'
			  : provider === 'opencode' ? 'OpenCode'
			  : provider === 'wp'       ? 'WordPress'
			  : 'Claude' );

		badge.textContent = icon + ' ' + name;
		return badge;
	}

	// ─── Agent ───────────────────────────────────────────────────────────────────

	var AGENT_PORT = 3131;
	var AGENT_URL  = 'http://127.0.0.1:' + AGENT_PORT;

	// Shared pairing secret — set by the React composer's pairing panel and read
	// here from the same localStorage key so both chat surfaces stay in sync.
	var AGENT_TOKEN_KEY = 'uichemy_agent_password';
	function uichAgentToken() {
		try { return localStorage.getItem( AGENT_TOKEN_KEY ) || ''; } catch ( e ) { return ''; }
	}
	function uichAgentHeaders( extra ) {
		var h = extra || {};
		h['x-uichemy-token'] = uichAgentToken();
		return h;
	}

	/** WordPress Connectors / Engine B config (from PHP localize). */
	var WP_AGENT = ( typeof uichComposerEditorCfg !== 'undefined' && uichComposerEditorCfg.wpAgent )
		? uichComposerEditorCfg.wpAgent
		: {};

	/**
	 * Ping the local sidecar (CLI providers only).
	 *
	 * @returns {Promise<boolean>}
	 */
	function checkSidecar() {
		return fetch( AGENT_URL + '/health', { method: 'GET' } )
			.then( function ( r ) { return r.ok; } )
			.catch( function () { return false; } );
	}

	/**
	 * Whether the WordPress AI path is ready (no sidecar).
	 *
	 * @returns {Promise<boolean>}
	 */
	function checkWpAgent() {
		if ( !window.UichWpAgent || !WP_AGENT.aiSupported ) {
			return Promise.resolve( false );
		}
		return window.UichWpAgent.checkAvailable( WP_AGENT );
	}

	/**
	 * Is the active provider ready to accept chat?
	 *
	 * @param {string} provider
	 * @returns {Promise<boolean>}
	 */
	function checkAgentForProvider( provider ) {
		if ( provider === 'wp' ) {
			return checkWpAgent();
		}
		return checkSidecar();
	}

	/**
	 * Show an "agent not running" notice in the chat selection bar and chat log.
	 *
	 * @param {object} bridge
	 */
	function showAgentOfflineNotice( bridge, provider ) {
		var isWp = provider === 'wp';
		var selectionEl = document.getElementById( 'uichemy-composer-chat-selection' );
		if ( selectionEl ) {
			selectionEl.innerHTML = isWp
				? '<span style="color:#f87171">⚠ WordPress AI unavailable</span> — configure keys under <strong>Settings → Connectors</strong>.'
				: '<span style="color:#f87171">⚠ UiChemy Agent not running.</span> Run <code>npx -y @uichemy/agent-bridge</code> in a terminal, then reload.';
			selectionEl.style.color = '';
		}
		if ( bridge && typeof bridge.appendChatMessage === 'function' ) {
			bridge.appendChatMessage( 'system', isWp
				? 'WordPress AI is not available.\n' +
					'1. WordPress 7 with AI enabled.\n' +
					'2. API key under Settings → Connectors.\n' +
					'3. Matching AI provider plugin active.'
				: 'UiChemy Agent is not running.\n' +
					'1. Make sure Node.js 18+ is installed.\n' +
					'2. Open a terminal and run: npx -y @uichemy/agent-bridge\n' +
					'3. Keep the terminal open, then try again.'
			);
		}
	}

	/**
	 * Send a prompt + context to the local claude-agent and return the response text.
	 * Claude reads the widget code via MCP tools (get_widget_code) and writes
	 * changes back via apply_widget_code — no code-block parsing needed here.
	 *
	 * @param   {object}  payload  { prompt, selectedSelector, sessionId, history }
	 * @returns {Promise<string>}
	 */
	function askAgent( payload ) {
		var body = Object.assign( {}, payload, {
			wpSiteUrl:        WP_AGENT.siteUrl || '',
			wpToken:          WP_AGENT.token || '',
			wpUploadsDir:     WP_AGENT.uploadsDir || '',
			uploadsBaseUrl:   WP_AGENT.uploadsBaseUrl || '',
			userMessageSaved: !!payload.userMessageSaved,
		} );
		return fetch( AGENT_URL + '/ask', {
			method:  'POST',
			headers: uichAgentHeaders( { 'Content-Type': 'application/json' } ),
			body:    JSON.stringify( body ),
		} )
			.then( function ( r ) {
				return r.text().then( function ( text ) {
					try { return JSON.parse( text ); }
					catch ( e ) {
						// Agent returned non-JSON (HTML 500 page, empty body, etc.)
						// Surface the raw text so the user can see what came back
						// instead of a confusing JSON parse error.
						throw new Error( 'Agent returned non-JSON response (status ' + r.status + '): ' + ( text || '<empty body>' ).slice( 0, 300 ) );
					}
				} );
			} )
			.then( function ( data ) {
				if ( data && data.success && data.response ) {
					return data.response;
				}
				// Robustly coerce data.error to a string. If the agent ever sends
				// an object (shouldn't, but defensive), JSON.stringify it instead
				// of letting `new Error(obj)` produce a useless "[object Object]".
				var rawError = data && data.error;
				var errMsg;
				if ( typeof rawError === 'string' && rawError ) {
					errMsg = rawError;
				} else if ( rawError && typeof rawError.message === 'string' ) {
					errMsg = rawError.message;
				} else if ( rawError ) {
					try { errMsg = JSON.stringify( rawError ); }
					catch ( _ ) { errMsg = String( rawError ); }
				} else {
					errMsg = 'Empty response from agent.';
				}
				throw new Error( errMsg );
			} );
	}

	/**
	 * Run Engine B entirely in the browser (no sidecar).
	 *
	 * @param   {object} payload
	 * @param   {object} bridge
	 * @param   {Function} onProgress
	 * @returns {Promise<string>}
	 */
	function askWpAgent( payload, bridge, onProgress ) {
		if ( !window.UichWpAgent ) {
			return Promise.reject( new Error( 'WordPress agent script failed to load.' ) );
		}
		return window.UichWpAgent.runAgent( {
			wpAgent:          WP_AGENT,
			bridge:           bridge,
			prompt:           payload.prompt,
			selectedSelector: payload.selectedSelector || '',
			sessionId:        payload.sessionId || '',
			history:          payload.history || [],
			model:            payload.model || '',
			imageCount:       Array.isArray( payload.images ) ? payload.images.length : 0,
			onProgress:       onProgress,
		} );
	}

	// ─── Chat history (DB-backed) ────────────────────────────────────────────────

	/**
	 * Maps tool names → the same human-readable labels shown during live execution.
	 * Must stay in sync with TOOL_PROGRESS_LABELS in claude-agent.js.
	 */
	var TOOL_LABELS = {
		get_widget_code:      'Reading widget code...',
		apply_widget_code:    'Applying widget code...',
		get_selected_element: 'Inspecting selected element...',
		get_element_context:  'Reading element context...',
		apply_element_update: 'Applying element update...',
		list_page_widgets:    'Scanning page widgets...',
		insert_widget_after:  'Inserting new widget...',
		get_globals:          'Reading Elementor globals...',
		sync_globals:         'Updating Elementor globals...',
		get_page_code:        'Reading page code...',
		set_page_code:        'Updating page code...',
		get_site_code:        'Reading site code...',
		set_site_code:        'Updating site code...',
	};

	/**
	 * Fetch conversation history for a widget from the agent DB.
	 * Returns a promise that resolves to an array of message objects.
	 *
	 * @param   {string} widgetId
	 * @returns {Promise<Array>}
	 */
	function wpChatStorageReady() {
		return !!( window.UichWpAgent && WP_AGENT.historyUrl && WP_AGENT.token );
	}

	function fetchHistory( widgetId, provider ) {
		if ( !widgetId ) {
			return Promise.resolve( { messages: [] } );
		}
		if ( wpChatStorageReady() ) {
			return window.UichWpAgent.loadHistory( widgetId, WP_AGENT );
		}
		var q = 'widgetId=' + encodeURIComponent( widgetId );
		if ( WP_AGENT.siteUrl ) {
			q += '&siteUrl=' + encodeURIComponent( WP_AGENT.siteUrl );
		}
		if ( WP_AGENT.token ) {
			q += '&token=' + encodeURIComponent( WP_AGENT.token );
		}
		return fetch( AGENT_URL + '/history?' + q, { headers: uichAgentHeaders() } )
			.then( function ( r ) { return r.json(); } )
			.catch( function () { return { messages: [] }; } );
	}

	function parseMessageAttachments( msg ) {
		if ( window.UichWpAgent && typeof window.UichWpAgent.normaliseAttachments === 'function' ) {
			return window.UichWpAgent.normaliseAttachments( msg.attachments );
		}
		if ( Array.isArray( msg.attachments ) ) {
			return msg.attachments;
		}
		try {
			var parsed = JSON.parse( msg.attachments || '[]' );
			return Array.isArray( parsed ) ? parsed : [];
		} catch ( _ ) {
			return [];
		}
	}

	function parseMessageToolCalls( msg ) {
		if ( Array.isArray( msg.toolCalls ) ) {
			return msg.toolCalls;
		}
		try {
			var parsed = JSON.parse( msg.toolCalls || '[]' );
			return Array.isArray( parsed ) ? parsed : [];
		} catch ( _ ) {
			return [];
		}
	}

	function attachmentImageUrl( relPath, provider ) {
		if ( !relPath ) {
			return '';
		}
		if ( WP_AGENT.uploadsBaseUrl ) {
			return WP_AGENT.uploadsBaseUrl.replace( /\/?$/, '/' ) + relPath;
		}
		return AGENT_URL + '/uploads/' + encodeURIComponent( relPath ).replace( /%2F/g, '/' );
	}

	/**
	 * Render history messages into the chat log, matching exactly what was shown
	 * during the live session — user bubbles, tool-step rows, assistant markdown.
	 *
	 * @param {object} bridge
	 * @param {Array}  history
	 */
	function renderHistory( bridge, history, provider ) {
		if ( !history.length ) return;

		provider = provider || 'anthropic';

		var chatLog = typeof bridge.getChatLog === 'function' ? bridge.getChatLog() : null;
		if ( !chatLog ) return;

		// ── Separator ────────────────────────────────────────────────────────────
		var sep = document.createElement( 'div' );
		sep.className = 'uich-history-sep';
		sep.textContent = '— Previous conversation —';
		chatLog.appendChild( sep );

		// ── Messages ─────────────────────────────────────────────────────────────
		history.forEach( function ( msg ) {
			if ( msg.role === 'user' ) {
				// ── User bubble ───────────────────────────────────────────────────
				var attachments  = parseMessageAttachments( msg );
				var selector     = msg.selectedSelector || '';
				var hasImages    = attachments.some( function ( a ) { return a.relPath; } );
				var hasExtras    = hasImages || selector;

				if ( hasExtras ) {
					// Render as a full bubble with chips + images + text.
					var wrapper = document.createElement( 'div' );
					wrapper.className = 'uichemy-composer-chat-message user';

					var attWrap = document.createElement( 'div' );
					attWrap.className = 'uichemy-composer-chat-user-attachments';

					// Selected element chip — same style as during live session.
					if ( selector ) {
						var safeSelector = selector.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' );
						var chipEl = document.createElement( 'div' );
						chipEl.className = 'uichemy-composer-attach-chip uichemy-composer-attach-chip--target uichemy-composer-attach-chip--sent';
						chipEl.innerHTML =
							'<span class="uichemy-composer-attach-chip-label">' + safeSelector + '</span>';
						attWrap.appendChild( chipEl );
					}

					// Image thumbnails.
					attachments.forEach( function ( att ) {
						if ( !att.relPath ) return;
						var imgEl = document.createElement( 'img' );
						imgEl.className = 'uichemy-composer-chat-user-image';
						imgEl.src = attachmentImageUrl( att.relPath, provider );
						imgEl.alt = att.originalName || '';
						attWrap.appendChild( imgEl );
					} );

					wrapper.appendChild( attWrap );

					// Text content.
					if ( msg.content ) {
						var textEl = document.createElement( 'div' );
						textEl.className = 'uichemy-composer-chat-user-text';
						textEl.textContent = msg.content;
						wrapper.appendChild( textEl );
					}

					chatLog.appendChild( wrapper );
				} else if ( msg.content ) {
					// No extras — plain text bubble.
					bridge.appendChatMessage( 'user', msg.content );
				}

			} else if ( msg.role === 'assistant' ) {
				var toolCalls = parseMessageToolCalls( msg );

				toolCalls.forEach( function ( toolName ) {
					var label = TOOL_LABELS[ toolName ] || ( 'Used ' + toolName );
					var stepEl = document.createElement( 'div' );
					stepEl.className = 'uichemy-composer-chat-message tool-step';
					stepEl.textContent = label;
					chatLog.appendChild( stepEl );
				} );

			// ── Assistant reply — markdown rendered, same as live ─────────────
			if ( msg.content ) {
				var el = document.createElement( 'div' );
				el.className = 'uichemy-composer-chat-message assistant';
				el.innerHTML = renderMarkdown( msg.content );
				el.appendChild( buildAiBadge( msg.provider || 'anthropic', msg.model || '' ) );
				chatLog.appendChild( el );
			}
			}
		} );

		chatLog.scrollTop = chatLog.scrollHeight;
	}

	// ─── Main init ───────────────────────────────────────────────────────────────

	/**
	 * Main init — called once the bridge is ready.
	 *
	 * @param {object} bridge  window.uiChemyComposerWidget
	 */
	function init( bridge ) {
		injectStyles();

		// ── Clipboard hijack fix ──────────────────────────────────────────────────
		// The chat lives inside Elementor's editor, which binds a global Ctrl+C
		// handler that copies the currently-selected widget's JSON to the system
		// clipboard. Without intercepting it, pressing Ctrl+C after selecting chat
		// text gives the user that JSON dump instead of their actual selection.
		// We listen in the capture phase so we run BEFORE Elementor's handler:
		//   • keydown Ctrl/Cmd+C — stop propagation so Elementor never sees it.
		//   • copy            — stop propagation and write the live selection text
		//                       into the clipboard explicitly, in case Elementor
		//                       (or another upstream listener) already grabbed it.
		( function installClipboardGuard() {
			function getChatLogEl() {
				return typeof bridge.getChatLog === 'function' ? bridge.getChatLog() : null;
			}
			function selectionInChatLog() {
				var log = getChatLogEl();
				if ( !log ) return false;
				var sel = window.getSelection && window.getSelection();
				if ( !sel || !sel.rangeCount || sel.isCollapsed ) return false;
				var node = sel.anchorNode;
				return !!( node && log.contains( node ) );
			}
			function targetInChatLog( target ) {
				var log = getChatLogEl();
				return !!( log && target && log.contains( target ) );
			}

			document.addEventListener( 'keydown', function ( e ) {
				var key = e.key;
				var isCopyShortcut = ( e.ctrlKey || e.metaKey ) && !e.shiftKey && !e.altKey
					&& ( key === 'c' || key === 'C' );
				if ( !isCopyShortcut ) return;
				if ( selectionInChatLog() || targetInChatLog( e.target ) ) {
					e.stopPropagation();
				}
			}, true );

			document.addEventListener( 'copy', function ( e ) {
				if ( !selectionInChatLog() ) return;
				e.stopPropagation();
				try {
					var text = String( window.getSelection() );
					if ( text && e.clipboardData ) {
						e.clipboardData.setData( 'text/plain', text );
						e.preventDefault();
					}
				} catch ( _ ) {}
			}, true );
		} )();

		// ── Chat history — loaded from agent DB ───────────────────────────────────
		// chatHistory holds the last 10 messages in RAM — used as AI context for
		// both Claude and Codex. Full conversation is always rendered in the chat log.
		// Saving to DB happens on the agent side automatically on every /ask call.

		var CONTEXT_WINDOW  = 10; // messages kept in RAM for Claude context

		var widgetId         = typeof bridge.getWidgetId === 'function' ? bridge.getWidgetId() : '';
		var chatHistory      = [];
		var selectedModel    = '';
		var selectedProvider = WP_AGENT.aiSupported ? 'wp' : 'anthropic';

		// Push a message and keep chatHistory trimmed to CONTEXT_WINDOW.
		function pushHistory( msg ) {
			chatHistory.push( msg );
			if ( chatHistory.length > CONTEXT_WINDOW ) {
				chatHistory = chatHistory.slice( -CONTEXT_WINDOW );
			}
		}

		fetchHistory( widgetId, selectedProvider ).then( function ( data ) {
			var history = Array.isArray( data ) ? data : ( data.messages || [] );
			if ( data && data.uploadsBaseUrl ) {
				WP_AGENT.uploadsBaseUrl = data.uploadsBaseUrl;
			}
			if ( history.length ) renderHistory( bridge, history, selectedProvider );
			// Keep only the last CONTEXT_WINDOW in RAM for AI context.
			chatHistory = history.slice( -CONTEXT_WINDOW );
			// Restore this widget's saved provider + model.
			if ( data && data.provider && data.provider !== selectedProvider ) {
				var p0 = data.provider;
				switchProvider( p0 === 'wp' ? 'wp'
				              : p0 === 'openai' ? 'openai'
				              : p0 === 'google' ? 'google'
				              : p0 === 'opencode' ? 'opencode'
				              : 'anthropic' );
			}
			if ( data && data.model ) setActiveModel( data.model );
		} );

		// ── Model / provider selector ─────────────────────────────────────────────

		var availableModels     = [];            // Claude models
		var codexModels         = [];            // Codex / OpenAI models
		var geminiModels        = [];            // Gemini models
		var opencodeModels      = [];            // OpenCode (provider/model format)
		var wpModels            = [];            // WordPress Connectors (provider/model)
		var wpConfigured        = false;         // at least one connector has a key
		var opencodeAuthed      = [];            // ['anthropic','opencode',…] — informational
		var claudeInstalled     = false;         // true if claude CLI is present on this machine
		var codexInstalled      = false;         // true if codex CLI is present on this machine
		var geminiInstalled     = false;         // true if gemini CLI is present on this machine
		var opencodeInstalled   = false;         // true if opencode CLI is present on this machine
		var modelRefreshSpin    = false;         // refresh button spinning state

		/** Return the model list for the active provider. */
		function activeModels() {
			if ( selectedProvider === 'openai' )    return codexModels;
			if ( selectedProvider === 'google' )    return geminiModels;
			if ( selectedProvider === 'opencode' )  return opencodeModels;
			if ( selectedProvider === 'wp' )        return wpModels;
			return availableModels;
		}

		/**
		 * Friendly display name from a model ID — delegates to the shared formatModelId().
		 */
		function modelDisplayName( id ) {
			var formatted = formatModelId( id );
			if ( formatted && formatted !== id ) return formatted;
			// Fallback for unexpected formats — just prettify the raw ID.
			return id.replace( /^claude-/, 'Claude ' ).replace( /-/g, ' ' )
				.replace( /\b\w/g, function ( c ) { return c.toUpperCase(); } );
		}

		// Provider metadata — order also drives dropdown group order.
		var PROVIDERS = [
			{ id: 'wp',        label: 'WordPress', list: function () { return wpModels; } },
			{ id: 'anthropic', label: 'Claude',    list: function () { return availableModels; } },
			{ id: 'openai',    label: 'Codex',     list: function () { return codexModels; } },
			{ id: 'google',    label: 'Gemini',    list: function () { return geminiModels; } },
			{ id: 'opencode',  label: 'OpenCode',  list: function () { return opencodeModels; } },
		];

		function providerLabel( id ) {
			for ( var i = 0; i < PROVIDERS.length; i++ ) {
				if ( PROVIDERS[ i ].id === id ) return PROVIDERS[ i ].label;
			}
			return id;
		}

		/** Inject the model bar (single combined provider/model dropdown) above the image strip. */
		function injectModelBar() {
			if ( document.getElementById( 'uich-model-bar' ) ) return;
			var imageStrip = document.getElementById( 'uichemy-composer-chat-image-strip' );
			if ( !imageStrip ) return;

			var bar = document.createElement( 'div' );
			bar.className = 'uich-model-bar';
			bar.id        = 'uich-model-bar';
			bar.innerHTML =
				// Combined provider + model picker
				'<div class="uich-model-btn" id="uich-model-btn" data-provider="anthropic" title="Switch provider / model">' +
					'<span class="uich-mb-provider" id="uich-model-provider-label">Claude</span>' +
					'<span class="uich-mb-sep">·</span>' +
					'<span class="uich-mb-name" id="uich-model-label">Loading…</span>' +
					'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
				'</div>' +
				// Refresh button — re-runs model discovery for all providers
				'<button class="uich-model-refresh" id="uich-model-refresh" title="Refresh model lists">' +
					'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>' +
				'</button>';

			imageStrip.parentNode.insertBefore( bar, imageStrip );

			document.getElementById( 'uich-model-btn' ).addEventListener( 'click', function ( e ) {
				e.stopPropagation();
				toggleModelDropdown();
			} );

			// Refresh button — re-run model discovery for every provider.
			document.getElementById( 'uich-model-refresh' ).addEventListener( 'click', function ( e ) {
				e.stopPropagation();
				triggerModelRefresh();
			} );

			// Sync the trigger button with the current provider/model.
			updateModelButton();
			updateOpenCodeTabTooltip();
		}

		/** Sync the trigger button's provider tint + labels with current state. */
		function updateModelButton() {
			var btn = document.getElementById( 'uich-model-btn' );
			if ( !btn ) return;
			btn.setAttribute( 'data-provider', selectedProvider );
			var pLabel = document.getElementById( 'uich-model-provider-label' );
			if ( pLabel ) pLabel.textContent = providerLabel( selectedProvider );
			var mLabel = document.getElementById( 'uich-model-label' );
			if ( mLabel ) {
				mLabel.textContent = selectedModel
					? modelDisplayName( selectedModel )
					: ( providerLabel( selectedProvider ) + ' (default)' );
			}
		}

		/** POST /models/refresh and visually spin the icon until next WS push. */
		function triggerModelRefresh() {
			if ( modelRefreshSpin ) return;   // already spinning
			var btn = document.getElementById( 'uich-model-refresh' );
			if ( !btn ) return;

			modelRefreshSpin = true;
			btn.classList.add( 'spinning' );

			fetch( AGENT_URL + '/models/refresh', { method: 'POST', headers: uichAgentHeaders() } )
				.catch( function () {} );   // agent offline — UI just spins then resets
			fetchWpModels();

			// Auto-stop after 12s in case no WS push arrives.
			setTimeout( stopModelRefreshSpin, 12_000 );
		}

		function stopModelRefreshSpin() {
			if ( !modelRefreshSpin ) return;
			modelRefreshSpin = false;
			var btn = document.getElementById( 'uich-model-refresh' );
			if ( btn ) btn.classList.remove( 'spinning' );
		}

		/**
		 * Update the trigger button's tooltip to reflect OpenCode's authenticated
		 * vendor list, so the user can see which vendors are configured and how
		 * to add more. The combined picker no longer has a dedicated tab.
		 */
		function updateOpenCodeTabTooltip() {
			var btn = document.getElementById( 'uich-model-btn' );
			if ( !btn ) return;
			if ( opencodeAuthed && opencodeAuthed.length ) {
				btn.title =
					'Switch provider / model\n' +
					'OpenCode authenticated: ' + opencodeAuthed.join( ', ' ) + '\n' +
					'Run `opencode auth login` in a terminal to add more vendors.';
			} else {
				btn.title = 'Switch provider / model';
			}
		}

		/** Switch the active provider and refresh the trigger button. */
		function switchProvider( provider ) {
			selectedProvider = provider;
			refreshStatus();

			// Close any open dropdown.
			var existing = document.getElementById( 'uich-model-dropdown' );
			if ( existing ) existing.remove();

			// Always clear selectedModel BEFORE re-deciding, otherwise when the
			// new provider's list is empty we'd leak the previous provider's
			// selection (e.g. switching Codex→Gemini while geminiModels is still
			// loading would keep `selectedModel='gpt-5'`, which a later WS
			// refresh would re-display as Gemini's label).
			selectedModel = '';
			var models = activeModels();
			if ( models.length ) {
				setActiveModel( models[ 0 ] );
			} else {
				updateModelButton();
			}
			saveModelPreference( selectedModel || '' );
		}

		/** Show / hide the combined provider+model dropdown. */
		function toggleModelDropdown() {
			var existing = document.getElementById( 'uich-model-dropdown' );
			if ( existing ) { existing.remove(); return; }

			var btn = document.getElementById( 'uich-model-btn' );
			if ( !btn ) return;

			// Need at least one provider with models — otherwise nothing to show.
			var anyModels = PROVIDERS.some( function ( p ) { return p.list().length > 0; } );
			if ( !anyModels ) return;

			var dropdown = document.createElement( 'div' );
			dropdown.className = 'uich-model-dropdown';
			dropdown.id        = 'uich-model-dropdown';

			PROVIDERS.forEach( function ( provider ) {
				var models = provider.list();

				// Hide providers whose CLI is not installed and have no models to show.
				if ( !models.length ) {
					if ( provider.id === 'wp'        && !WP_AGENT.aiSupported ) return;
					if ( provider.id === 'anthropic' && !claudeInstalled   ) return;
					if ( provider.id === 'openai'    && !codexInstalled    ) return;
					if ( provider.id === 'google'    && !geminiInstalled   ) return;
					if ( provider.id === 'opencode'  && !opencodeInstalled ) return;
				}

				var group = document.createElement( 'div' );
				group.className = 'uich-model-group';
				group.setAttribute( 'data-provider', provider.id );

				var header = document.createElement( 'div' );
				header.className   = 'uich-model-group-header';
				header.textContent = provider.label;
				group.appendChild( header );

				if ( !models.length ) {
					var empty = document.createElement( 'div' );
					empty.className   = 'uich-model-group-empty';
					empty.textContent = provider.id === 'wp'
						? ( wpConfigured ? 'No models available' : 'Add API keys under Settings → Connectors' )
						: 'No models discovered';
					group.appendChild( empty );
				} else {
					models.forEach( function ( modelId ) {
						var isActive = ( provider.id === selectedProvider && modelId === selectedModel );
						var opt = document.createElement( 'div' );
						opt.className = 'uich-model-option' + ( isActive ? ' active' : '' );
						opt.innerHTML =
							'<svg class="uich-model-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
							'<span>' + modelDisplayName( modelId ) + '</span>';
						opt.addEventListener( 'click', function () {
							dropdown.remove();
							// Switch provider first (without auto-picking default), then set the chosen model.
							if ( provider.id !== selectedProvider ) {
								selectedProvider = provider.id;
							}
							setActiveModel( modelId );
							saveModelPreference( modelId );
							if ( provider.id !== selectedProvider ) {
								refreshStatus();
							}
						} );
						group.appendChild( opt );
					} );
				}

				dropdown.appendChild( group );
			} );

			// Append to body so it's never clipped by overflow:hidden panels.
			// Position it above the button using getBoundingClientRect.
			document.body.appendChild( dropdown );
			var rect = btn.getBoundingClientRect();
			dropdown.style.position = 'fixed';
			dropdown.style.left     = rect.left + 'px';
			dropdown.style.top      = ( rect.top - dropdown.offsetHeight - 4 ) + 'px';
			// Re-measure after paint in case height wasn't available yet.
			requestAnimationFrame( function () {
				dropdown.style.top = ( rect.top - dropdown.offsetHeight - 4 ) + 'px';
			} );

			// Close on outside click.
			setTimeout( function () {
				document.addEventListener( 'click', function closeDropdown() {
					var d = document.getElementById( 'uich-model-dropdown' );
					if ( d ) d.remove();
					document.removeEventListener( 'click', closeDropdown );
				} );
			}, 0 );
		}

		/** Update the selected model + refresh the trigger button. */
		function setActiveModel( modelId ) {
			if ( !modelId ) return;
			selectedModel = modelId;
			updateModelButton();
		}

		/** Save the chosen model to the agent DB for this widget. */
		function saveModelPreference( modelId ) {
			if ( wpChatStorageReady() ) {
				window.UichWpAgent.saveModelPreference( modelId || '', WP_AGENT, selectedProvider );
				return;
			}
			if ( !modelId ) return;
			if ( !widgetId ) return;
			fetch( AGENT_URL + '/model', {
				method:  'PATCH',
				headers: uichAgentHeaders( { 'Content-Type': 'application/json' } ),
				body:    JSON.stringify( {
					widgetId: widgetId,
					model:    modelId,
					provider: selectedProvider,
					siteUrl:  WP_AGENT.siteUrl || '',
					token:    WP_AGENT.token || '',
				} ),
			} ).catch( function () {} );
		}

		/**
		 * Normalise a model ID so dash-separated versions equal dot-separated ones,
		 * then deduplicate a list while preserving order.
		 * e.g. ["gpt-5.5","gpt-5-5","gpt-4o"] → ["gpt-5.5","gpt-4o"]
		 */
		function dedupeModels( list ) {
			// IMPORTANT: never rewrite IDs here. They flow back to the agent
			// verbatim as the `--model` argument, and the CLIs are strict:
			//   • OpenCode router rejects `claude-sonnet-4.6` (wants `4-6`)
			//   • Claude CLI rejects `claude-haiku-4.5-20251001` (wants `4-5-20251001`)
			//
			// An earlier version of this function did dash→dot rewriting to
			// dedupe Codex's `gpt-5-5`/`gpt-5.5` duplicates, but that corrupted
			// every other provider's IDs. Pure pass-through dedupe is correct.
			var seen = {};
			return list.filter( function ( id ) {
				if ( seen[ id ] ) return false;
				seen[ id ] = true;
				return true;
			} );
		}

		/** Load models from WordPress Connectors (Settings → Connectors). */
		function wpAuthHeaders() {
			var h = {};
			if ( WP_AGENT.restNonce ) {
				h[ 'X-WP-Nonce' ] = WP_AGENT.restNonce;
			}
			return h;
		}

		function fetchWpModels() {
			if ( !WP_AGENT.aiSupported || !WP_AGENT.modelsUrl ) {
				return Promise.resolve();
			}
			if ( !WP_AGENT.restNonce ) {
				return Promise.resolve();
			}
			return fetch( WP_AGENT.modelsUrl, {
				headers: wpAuthHeaders(),
				credentials: 'same-origin',
			} )
				.then( function ( r ) { return r.json(); } )
				.then( function ( data ) {
					wpConfigured = !!( data && data.configured );
					if ( data && Array.isArray( data.models ) && data.models.length ) {
						onProviderModelsUpdated( 'wp', data.models );
						if ( selectedProvider === 'anthropic' && !availableModels.length ) {
							switchProvider( 'wp' );
						}
					} else if ( WP_AGENT.aiSupported ) {
						injectModelBar();
					}
				} )
				.catch( function () {} );
		}

		/** Fetch available models for all providers and inject the selector bar. */
		function initModelSelector() {
			fetchWpModels();

			fetch( AGENT_URL + '/models', { headers: uichAgentHeaders() } )
				.then( function ( r ) { return r.json(); } )
				.then( function ( data ) {
					availableModels   = dedupeModels( Array.isArray( data.claude  ) ? data.claude
					                               : Array.isArray( data.models  ) ? data.models : [] );
					codexModels       = dedupeModels( Array.isArray( data.codex    ) ? data.codex    : [] );
					geminiModels      = dedupeModels( Array.isArray( data.gemini   ) ? data.gemini   : [] );
					opencodeModels    = dedupeModels( Array.isArray( data.opencode ) ? data.opencode : [] );
					opencodeAuthed    = Array.isArray( data.opencodeAuthed ) ? data.opencodeAuthed : [];
					claudeInstalled   = !! data.claudeInstalled;
					codexInstalled    = !! data.codexInstalled;
					geminiInstalled   = !! data.geminiInstalled;
					opencodeInstalled = !! data.opencodeInstalled;

					// Always inject the bar so provider tabs are visible even if only one works.
					if ( availableModels.length || codexModels.length || geminiModels.length || opencodeModels.length || wpModels.length || WP_AGENT.aiSupported ) {
						injectModelBar();
					}
					updateOpenCodeTabTooltip();

					// Set default model for the active provider.
					var models = activeModels();
					if ( !selectedModel && models.length ) {
						setActiveModel( models[ 0 ] );
					}
				} )
				.catch( function () {} ); // agent offline — hide selector silently
		}

		initModelSelector();

		// ── Widget switch — reload history when user opens a different widget ─────
		// The editor fires bridge.onWidgetChange(newWidgetId) every time a UiChemy Composer
		// HTML widget panel is opened. Clear the chat log and load that widget's
		// own conversation from the DB.
		bridge.onWidgetChange = function ( newWidgetId ) {
			// Nothing changed — ignore (same widget clicked again).
			if ( newWidgetId === widgetId ) return;

			widgetId    = newWidgetId;
			chatHistory = [];

			// Clear visible chat log.
			var chatLog = typeof bridge.getChatLog === 'function' ? bridge.getChatLog() : null;
			if ( chatLog ) chatLog.innerHTML = '';

			// Load and render the new widget's history + restore model/provider selection.
			fetchHistory( widgetId, selectedProvider ).then( function ( data ) {
				var history = Array.isArray( data ) ? data : ( data.messages || [] );
				if ( data && data.uploadsBaseUrl ) {
					WP_AGENT.uploadsBaseUrl = data.uploadsBaseUrl;
				}
				if ( history.length ) renderHistory( bridge, history, selectedProvider );
				chatHistory = history.slice( -CONTEXT_WINDOW );
				if ( data && data.provider && data.provider !== selectedProvider ) {
					var p = data.provider;
					switchProvider( p === 'wp' ? 'wp'
					              : p === 'openai' ? 'openai'
					              : p === 'google' ? 'google'
					              : p === 'opencode' ? 'opencode'
					              : 'anthropic' );
				}
				if ( data && data.model ) setActiveModel( data.model );
			} );
		};

		// ── Model list push from agent ────────────────────────────────────────────
		// The agent discovers models asynchronously and pushes via WebSocket.
		// MODELS_UPDATED = Claude, CODEX_MODELS_UPDATED = Codex.

		function onProviderModelsUpdated( provider, models ) {
			if ( !Array.isArray( models ) || !models.length ) return;

			if ( provider === 'openai' ) {
				codexModels    = dedupeModels( models );
			} else if ( provider === 'google' ) {
				geminiModels   = dedupeModels( models );
			} else if ( provider === 'opencode' ) {
				opencodeModels = dedupeModels( models );
			} else if ( provider === 'wp' ) {
				wpModels = dedupeModels( models );
			} else {
				availableModels = dedupeModels( models );
			}

			// Inject bar if not already there.
			var btn = document.getElementById( 'uich-model-btn' );
			if ( !btn ) injectModelBar();

			// Any model push means discovery finished — stop the refresh spinner.
			stopModelRefreshSpin();

			// If this is the active provider, ensure selectedModel is still valid.
			if ( provider === selectedProvider ) {
				var activeList = activeModels();
				// Defensive: if selectedModel is empty OR it isn't in the
				// active provider's list (stale cross-provider value, or live
				// discovery removed it), fall back to the first available one.
				var isValidSelection = selectedModel && activeList.indexOf( selectedModel ) !== -1;
				if ( !isValidSelection && activeList.length ) {
					setActiveModel( activeList[ 0 ] );
				} else if ( isValidSelection ) {
					setActiveModel( selectedModel );
				}
			}

			// Re-render the combined dropdown if it's open, regardless of which
			// provider updated — the user sees every provider's list at once.
			var existing = document.getElementById( 'uich-model-dropdown' );
			if ( existing ) { existing.remove(); toggleModelDropdown(); }
		}

		bridge.onModelsUpdated = function ( models, installed ) {
			if ( typeof installed === 'boolean' ) claudeInstalled = installed;
			onProviderModelsUpdated( 'anthropic', models );
		};

		bridge.onCodexModelsUpdated = function ( models, installed ) {
			if ( typeof installed === 'boolean' ) codexInstalled = installed;
			onProviderModelsUpdated( 'openai', models );
		};

		bridge.onGeminiModelsUpdated = function ( models, installed ) {
			if ( typeof installed === 'boolean' ) geminiInstalled = installed;
			onProviderModelsUpdated( 'google', models );
		};

		bridge.onOpenCodeModelsUpdated = function ( models, authed, installed ) {
			if ( Array.isArray( authed ) ) {
				opencodeAuthed = authed;
				updateOpenCodeTabTooltip();
			}
			if ( typeof installed === 'boolean' ) opencodeInstalled = installed;
			onProviderModelsUpdated( 'opencode', models );
		};

		// ── Agent status polling ──────────────────────────────────────────────────

		var agentOnline = false;

		function refreshStatus() {
			checkAgentForProvider( selectedProvider ).then( function ( online ) {
				agentOnline = online;
				var pickBtn  = document.getElementById( 'uichemy-composer-chat-pick-btn' );
				var statusEl = document.getElementById( 'uichemy-composer-agent-status' );
				if ( online ) {
					if ( pickBtn )  pickBtn.disabled = false;
					if ( statusEl ) statusEl.style.display = 'none';
				} else {
					if ( pickBtn )  pickBtn.disabled = true;
					if ( statusEl ) {
						statusEl.style.display = '';
						statusEl.innerHTML = selectedProvider === 'wp'
							? '<span style="color:#f87171">⚠ WordPress AI unavailable</span> — Settings → Connectors'
							: '<span style="color:#f87171">⚠ UiChemy Agent offline</span> — run <code>npx -y @uichemy/agent-bridge</code>';
					}
				}
			} );
		}

		refreshStatus();
		setInterval( refreshStatus, 5000 );

		// ── Chat element picker ───────────────────────────────────────────────────

		var pickBtn     = document.getElementById( 'uichemy-composer-chat-pick-btn' );
		var pickLabel   = document.getElementById( 'uichemy-composer-chat-pick-label' );
		var pickBadge   = document.getElementById( 'uichemy-composer-chat-pick-badge' );
		var pickClear   = document.getElementById( 'uichemy-composer-chat-pick-clear' );
		var targetClear = document.getElementById( 'uichemy-composer-chat-target-clear' );
		var isPicking   = false;

		/** Currently picked element info — null when nothing is picked. */
		var currentPickInfo = null;

		/** Build a readable label from pick info (e.g. "div.nav-item" or "#hero"). */
		function pickDisplayLabel( info ) {
			if ( !info ) return '';
			var tag      = info.tagName  || '';
			var selector = info.selector || '';
			return selector
				? ( tag && selector.charAt( 0 ) !== '#' && selector.indexOf( tag ) !== 0
					? tag + selector : selector )
				: ( tag || '?' );
		}

		/**
		 * Update the pick chip in the attachment strip and the pick button label.
		 * The old floating target-bar is no longer shown — the chip IS the indicator.
		 *
		 * @param {object|null} info  chatPickSelectedInfo, or null to clear.
		 */
		function setChatPickBadge( info ) {
			currentPickInfo = info || null;

			// Legacy badge — always hidden (kept for panel.js compat).
			if ( pickBadge ) pickBadge.style.display = 'none';

			// Rebuild the attachment strip so target chip appears/disappears.
			renderAttachmentStrip();

			// Update pick button label.
			if ( pickBtn )   pickBtn.classList.remove( 'is-picking' );
			if ( pickLabel ) pickLabel.textContent = info ? 'Re-pick' : 'Pick element';
		}

		function doClearPick() {
			if ( typeof bridge.clearChatElementPick === 'function' ) {
				bridge.clearChatElementPick();
			}
			setChatPickBadge( null );
			isPicking = false;
			if ( pickBtn )   pickBtn.classList.remove( 'is-picking' );
			if ( pickLabel ) pickLabel.textContent = 'Pick element';
		}

		function exitPickMode( cancelled ) {
			isPicking = false;
			if ( pickBtn )   pickBtn.classList.remove( 'is-picking' );
			if ( pickLabel ) pickLabel.textContent = 'Pick element';
			if ( cancelled ) doClearPick();
		}

		if ( pickBtn ) {
			pickBtn.addEventListener( 'click', function () {
				if ( isPicking ) {
					exitPickMode( true );
					return;
				}
				if ( typeof bridge.startChatElementPick !== 'function' ) return;
				// Clear any previous pick before starting a new one.
				doClearPick();
				isPicking = true;
				pickBtn.classList.add( 'is-picking' );
				if ( pickLabel ) pickLabel.textContent = 'Click element…';

				bridge.startChatElementPick(
					function onPick( info ) {
						isPicking = false;
						setChatPickBadge( info );
					},
					function onCancel() {
						exitPickMode( true );
					}
				);
			} );
		}

		// Both the legacy badge clear and the new target bar clear button do the same thing.
		if ( pickClear ) {
			pickClear.addEventListener( 'click', doClearPick );
		}
		if ( targetClear ) {
			targetClear.addEventListener( 'click', doClearPick );
		}

		// ── Image attachment ──────────────────────────────────────────────────────

		/** @type {Array<{data:string, mediaType:string, name:string}>} */
		var attachedImages = [];

		var attachBtn   = document.getElementById( 'uichemy-composer-chat-attach-btn' );
		var fileInput   = document.getElementById( 'uichemy-composer-chat-file-input' );
		var imageStrip  = document.getElementById( 'uichemy-composer-chat-image-strip' );
		var chatInput   = document.getElementById( 'uichemy-composer-chat-input' );

		/** Convert a File to base64 and add it to attachedImages. */
		function addImageFile( file ) {
			if ( !file || !file.type || file.type.indexOf( 'image/' ) !== 0 ) return;
			var reader = new FileReader();
			reader.onload = function ( e ) {
				var result = e.target.result || '';
				var base64 = result.split( ',' )[ 1 ] || '';
				if ( !base64 ) return;
				attachedImages.push( { data: base64, mediaType: file.type, name: file.name || 'image' } );
				renderAttachmentStrip();
			};
			reader.readAsDataURL( file );
		}

		/**
		 * Redraw the attachment strip: target chip (if picked) + image thumbnails.
		 * This is the single source of truth for what shows in the compose strip.
		 */
		function renderAttachmentStrip() {
			if ( !imageStrip ) return;
			var hasTarget = !!currentPickInfo;
			var hasImages = attachedImages.length > 0;
			if ( !hasTarget && !hasImages ) {
				imageStrip.style.display = 'none';
				imageStrip.innerHTML = '';
				return;
			}
			imageStrip.style.display = 'flex';

			// Target element chip — first in the strip when a pick is active.
			var targetChipHtml = '';
			if ( hasTarget ) {
				var label = pickDisplayLabel( currentPickInfo );
				targetChipHtml =
					'<div class="uichemy-composer-attach-chip uichemy-composer-attach-chip--target" id="uich-target-chip">' +
						'<span class="uichemy-composer-attach-chip-label">' + label.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ) + '</span>' +
						'<button class="uichemy-composer-attach-chip-remove" id="uich-target-chip-clear" type="button" title="Clear target">×</button>' +
					'</div>';
			}

			// Image thumbnail chips.
			var imageChipsHtml = attachedImages.map( function ( img, idx ) {
				return '<div class="uichemy-composer-chat-image-thumb" data-idx="' + idx + '">' +
					'<img src="data:' + img.mediaType + ';base64,' + img.data + '" alt="' + img.name + '">' +
					'<button class="uichemy-composer-chat-image-remove" data-idx="' + idx + '" type="button" title="Remove image">×</button>' +
				'</div>';
			} ).join( '' );

			imageStrip.innerHTML = targetChipHtml + imageChipsHtml;

			// Wire target chip clear button.
			var chipClear = document.getElementById( 'uich-target-chip-clear' );
			if ( chipClear ) {
				chipClear.addEventListener( 'click', doClearPick );
			}

			// Wire image remove buttons.
			imageStrip.querySelectorAll( '.uichemy-composer-chat-image-remove' ).forEach( function ( btn ) {
				btn.addEventListener( 'click', function () {
					var idx = parseInt( btn.getAttribute( 'data-idx' ), 10 );
					attachedImages.splice( idx, 1 );
					renderAttachmentStrip();
				} );
			} );
		}

		// Click → open file picker.
		if ( attachBtn && fileInput ) {
			attachBtn.addEventListener( 'click', function () { fileInput.click(); } );
			fileInput.addEventListener( 'change', function () {
				Array.prototype.forEach.call( fileInput.files, addImageFile );
				fileInput.value = '';
			} );
		}

		// Ctrl+V / paste image directly into textarea.
		if ( chatInput ) {
			chatInput.addEventListener( 'paste', function ( e ) {
				var items = e.clipboardData && e.clipboardData.items;
				if ( !items ) return;
				for ( var i = 0; i < items.length; i++ ) {
					if ( items[ i ].type.indexOf( 'image' ) !== -1 ) {
						e.preventDefault();
						var file = items[ i ].getAsFile();
						if ( file ) addImageFile( file );
					}
				}
			} );
		}

		// ── Chat send handler ─────────────────────────────────────────────────────

		/**
		 * Every message goes straight to the claude-agent. The full execution is
		 * shown live in the chat log — each tool call appears as its own row,
		 * Claude's text streams in progressively, and nothing is removed or replaced.
		 *
		 * @param {string}      text       The user's message.
		 * @param {Element}     [targetEl] Element from hover popup (overrides pick/selection).
		 * @param {object}      [opts]
		 *   opts.onDone {function(status)} — called with 'ok' or 'error' when done.
		 */
		bridge.onChatSend = function ( text, targetEl, opts ) {
			var options = opts || {};
			var onDone  = typeof options.onDone === 'function' ? options.onDone : null;

			var chatLog = typeof bridge.getChatLog === 'function' ? bridge.getChatLog() : null;

			// Element context: hover popup > chat pick > main editor selection.
			var chatPick = typeof bridge.getChatPickInfo === 'function' ? bridge.getChatPickInfo() : null;
			var selectedEl, selectedSelector;
			if ( targetEl ) {
				selectedEl       = targetEl;
				selectedSelector = getSelectionSelector( selectedEl );
			} else if ( chatPick && chatPick.html ) {
				selectedEl       = null;
				selectedSelector = chatPick.selector || '';
			} else {
				selectedEl       = typeof bridge.getSelectedElement === 'function' ? bridge.getSelectedElement() : null;
				selectedSelector = getSelectionSelector( selectedEl );
			}

			var sessionId = typeof bridge.getSessionId === 'function' ? bridge.getSessionId() : '';
			var widgetId  = typeof bridge.getWidgetId  === 'function' ? bridge.getWidgetId()  : '';

			function runSend( ready ) {
			if ( !ready ) {
				if ( typeof bridge.appendChatMessage === 'function' ) {
					bridge.appendChatMessage( 'user', text );
				}
				showAgentOfflineNotice( bridge, selectedProvider );
				if ( chatLog ) chatLog.scrollTop = chatLog.scrollHeight;
				if ( onDone ) onDone( 'error' );
				return;
			}

			// Snapshot attachments for this message, then clear the strip.
			var messageImages = attachedImages.slice();
			var messagePick   = currentPickInfo;   // target chip — stays picked, just shown in bubble
			attachedImages = [];
			renderAttachmentStrip();

			// Build and show the user bubble.
			var chatLogEl = typeof bridge.getChatLog === 'function' ? bridge.getChatLog() : null;
			if ( chatLogEl ) {
				var userEl = document.createElement( 'div' );
				userEl.className = 'uichemy-composer-chat-message user';

				var hasAttachments = messagePick || messageImages.length;
				if ( hasAttachments ) {
					var attachHtml = '';

					// Target element chip — looks identical to the compose strip chip.
					if ( messagePick ) {
						var pLabel = pickDisplayLabel( messagePick );
						attachHtml +=
							'<div class="uichemy-composer-attach-chip uichemy-composer-attach-chip--target uichemy-composer-attach-chip--sent">' +
								'<span class="uichemy-composer-attach-chip-label">' + pLabel.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ) + '</span>' +
							'</div>';
					}

					// Image thumbnails.
					if ( messageImages.length ) {
						attachHtml += messageImages.map( function ( img ) {
							return '<img class="uichemy-composer-chat-user-image" src="data:' + img.mediaType + ';base64,' + img.data + '" alt="">';
						} ).join( '' );
					}

					var safeText = text
						? text.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' )
						: '';
					userEl.innerHTML =
						'<div class="uichemy-composer-chat-user-attachments">' + attachHtml + '</div>' +
						( safeText ? '<div class="uichemy-composer-chat-user-text">' + safeText + '</div>' : '' );
				} else {
					userEl.textContent = text;
				}
				chatLogEl.appendChild( userEl );
				chatLogEl.scrollTop = chatLogEl.scrollHeight;
			}
			var chatMeta = {
				postId:    typeof window.elementor !== 'undefined' && elementor.config && elementor.config.document
					? parseInt( elementor.config.document.id, 10 ) || 0 : 0,
				pageTitle: typeof document !== 'undefined' && document.title ? document.title : '',
			};

			// ── Execution log state ───────────────────────────────────────────────
			// waitingEl     : pulsing "Claude is starting" row, removed on first event.
			// streamingBubble: the assistant text bubble currently being written into.
			var waitingEl       = null;
			var streamingBubble = null;

			if ( chatLog ) {
				var aiName = selectedProvider === 'wp'       ? 'WordPress AI'
				           : selectedProvider === 'openai'   ? 'Codex'
				           : selectedProvider === 'google'   ? 'Gemini'
				           : selectedProvider === 'opencode' ? 'OpenCode'
				           : 'Claude';
				waitingEl = document.createElement( 'div' );
				waitingEl.className = 'uichemy-composer-chat-message tool-step is-waiting';
				waitingEl.textContent = aiName + ' is starting';
				chatLog.appendChild( waitingEl );
				chatLog.scrollTop = chatLog.scrollHeight;
			}

			function removeWaiting() {
				if ( waitingEl && waitingEl.parentNode ) {
					waitingEl.parentNode.removeChild( waitingEl );
					waitingEl = null;
				}
			}

			// Append a permanent tool-call row (stays visible forever).
			function appendToolStep( label ) {
				removeWaiting();
				if ( !chatLog ) return;
				// Finalise any in-progress text bubble before starting a new step.
				if ( streamingBubble ) {
					streamingBubble.classList.remove( 'streaming' );
					streamingBubble = null;
				}
				var el = document.createElement( 'div' );
				el.className = 'uichemy-composer-chat-message tool-step';
				el.textContent = label;
				chatLog.appendChild( el );
				chatLog.scrollTop = chatLog.scrollHeight;
			}

			// Append a text chunk to the current streaming assistant bubble.
			// Raw text is stored in dataset.raw so we can re-render markdown each chunk.
			function appendStreamingText( chunk ) {
				removeWaiting();
				if ( !chatLog ) return;
				if ( !streamingBubble ) {
					streamingBubble = document.createElement( 'div' );
					streamingBubble.className = 'uichemy-composer-chat-message assistant streaming';
					streamingBubble.dataset.raw = '';
					chatLog.appendChild( streamingBubble );
				}
				streamingBubble.dataset.raw += chunk + ' ';
				streamingBubble.innerHTML = renderMarkdown( streamingBubble.dataset.raw );
				chatLog.scrollTop = chatLog.scrollHeight;
			}

		// Called when the HTTP response arrives — replace streaming content with
		// the authoritative full response, fully rendered as markdown.
		function finalizeExecution( fullResponse ) {
			bridge.updateChatProgress = function () {}; // detach live events
			removeWaiting();
			if ( streamingBubble ) {
				if ( fullResponse ) streamingBubble.innerHTML = renderMarkdown( fullResponse );
				streamingBubble.appendChild( buildAiBadge( selectedProvider, selectedModel ) );
				streamingBubble.classList.remove( 'streaming' );
				streamingBubble = null;
			} else if ( fullResponse ) {
				// No streaming — create the bubble now with rendered markdown.
				var el = document.createElement( 'div' );
				el.className = 'uichemy-composer-chat-message assistant';
				el.innerHTML = renderMarkdown( fullResponse );
				el.appendChild( buildAiBadge( selectedProvider, selectedModel ) );
				if ( chatLog ) {
					chatLog.appendChild( el );
					chatLog.scrollTop = chatLog.scrollHeight;
				}
			}
		}

			// Route live progress events into the execution log.
			bridge.updateChatProgress = function ( event ) {
				if ( !event ) return;
				if ( event.eventType === 'tool' ) {
					appendToolStep( event.message );
				} else if ( event.eventType === 'text' ) {
					appendStreamingText( event.message );
				}
			};

			// Last 10 messages as context — no char cap, include attachment paths
			// so the agent can reference previously attached images in the prompt.
			var historySlice = chatHistory.slice( -CONTEXT_WINDOW ).map( function ( m ) {
				return {
					role:        m.role,
					content:     String( m.content || '' ),
					attachments: Array.isArray( m.attachments ) ? m.attachments : [],
				};
			} );

			var trackedToolCalls = [];
			var savedAttachments = [];

			function normalizeToolName( raw ) {
				var s = String( raw || '' ).trim();
				var m = s.match( /^(?:mcp__uichemy-editor__|mcp_uichemy-editor_|uichemy-editor_)?([\w]+)$/ );
				return m ? m[ 1 ] : s;
			}

			var progressCb = function ( event ) {
				if ( !event ) return;
				if ( event.eventType === 'tool' || event.tool ) {
					var toolName = normalizeToolName( event.tool || '' );
					if ( toolName ) {
						trackedToolCalls.push( toolName );
					}
					var label = event.message || TOOL_LABELS[ toolName ] || ( 'Running ' + toolName + '...' );
					appendToolStep( label );
				} else if ( event.eventType === 'text' || event.text ) {
					appendStreamingText( event.message || event.text || '' );
				}
			};

			function persistUserMessage( attachments ) {
				savedAttachments = attachments || [];
				var userHistMsg = {
					role:             'user',
					content:          text,
					selectedSelector: selectedSelector || '',
					attachments:      savedAttachments,
				};
				pushHistory( userHistMsg );
				if ( wpChatStorageReady() && widgetId ) {
					return window.UichWpAgent.appendHistoryMessage(
						widgetId, selectedProvider, selectedModel, userHistMsg, WP_AGENT, chatMeta
					);
				}
				return Promise.resolve();
			}

			function startAgentTurn() {
				return selectedProvider === 'wp'
					? askWpAgent( {
						prompt:           text,
						selectedSelector: selectedSelector,
						sessionId:        sessionId,
						history:          historySlice,
						images:           messageImages,
						model:            selectedModel,
					}, bridge, progressCb )
				: askAgent( {
					prompt:             text,
					selectedSelector:   selectedSelector,
					sessionId:          sessionId,
					widgetId:           widgetId,
					history:            historySlice,
					images:             messageImages,
					attachments:        savedAttachments,
					provider:           selectedProvider,
					model:              selectedModel,
					postId:             chatMeta.postId,
					pageTitle:          chatMeta.pageTitle,
					userMessageSaved:   wpChatStorageReady() && !!widgetId,
				} );
			}

			var preparePromise;
			if ( wpChatStorageReady() && widgetId ) {
				preparePromise = window.UichWpAgent.uploadImages( widgetId, messageImages, WP_AGENT )
					.then( function ( attachments ) {
						return persistUserMessage( attachments );
					} );
			} else {
				preparePromise = persistUserMessage(
					messageImages.map( function ( img ) {
						return { relPath: null, originalName: img.name || '' };
					} )
				);
			}

			preparePromise
				.then( function () {
					return startAgentTurn();
				} )
				.then( function ( response ) {
					finalizeExecution( response );
					showToast( '✓ Changes applied' );
					var assistantMsg = {
						role:        'assistant',
						content:     String( response ),
						attachments: [],
						toolCalls:   trackedToolCalls.slice(),
					};
					pushHistory( assistantMsg );
					if ( selectedProvider === 'wp' && wpChatStorageReady() && widgetId ) {
						return window.UichWpAgent.appendHistoryMessage(
							widgetId, 'wp', selectedModel, assistantMsg, WP_AGENT, chatMeta
						).then( function () {
							if ( chatLog ) chatLog.scrollTop = chatLog.scrollHeight;
							if ( onDone ) onDone( 'ok' );
						} );
					}
					if ( chatLog ) chatLog.scrollTop = chatLog.scrollHeight;
					if ( onDone ) onDone( 'ok' );
				} )
				.catch( function ( err ) {
					bridge.updateChatProgress = function () {};
					removeWaiting();
					if ( streamingBubble ) {
						streamingBubble.classList.remove( 'streaming' );
						streamingBubble = null;
					}
					// Build a readable message from whatever `err` actually is.
					// Earlier versions did `String(err && err.message ? err.message : err)`
					// which produced "[object Object]" when err was a plain object
					// or when err.message was itself an object/non-string.
					var msg;
					if ( err instanceof Error && typeof err.message === 'string' && err.message ) {
						msg = err.message;
					} else if ( typeof err === 'string' && err ) {
						msg = err;
					} else if ( err && typeof err.message === 'string' && err.message ) {
						msg = err.message;
					} else if ( err ) {
						try { msg = JSON.stringify( err ); }
						catch ( _ ) { msg = String( err ); }
					} else {
						msg = 'Unknown error (no details from agent).';
					}
					// Log raw error for debugging — helps trace [object Object]-style
					// surprises if any path still produces them.
					if ( msg === '[object Object]' || msg === '{}' ) {
						console.error( '[chat] Opaque error from agent path:', err );
						msg = 'Agent returned an opaque error. See browser console for details.';
					}
					if ( msg.toLowerCase().indexOf( 'failed to fetch' ) !== -1 ||
					     msg.toLowerCase().indexOf( 'networkerror' ) !== -1 ) {
						agentOnline = false;
						showAgentOfflineNotice( bridge, selectedProvider );
					} else {
						if ( typeof bridge.appendChatMessage === 'function' ) {
							bridge.appendChatMessage( 'system', 'Error: ' + msg );
						}
						showToast( '⚠ AI error — check Chat tab.' );
					}
					if ( chatLog ) chatLog.scrollTop = chatLog.scrollHeight;
					if ( onDone ) onDone( 'error' );
				} );
			}

			if ( agentOnline ) {
				runSend( true );
				return;
			}
			checkAgentForProvider( selectedProvider ).then( function ( ready ) {
				agentOnline = ready;
				runSend( ready );
			} );
		};
	}

	// ─── Boot ────────────────────────────────────────────────────────────────────

	/**
	 * Poll until window.uiChemyComposerWidget bridge is available, then init.
	 *
	 * @param {number} attempts
	 */
	function waitForBridge( attempts ) {
		var bridge = window.uiChemyComposerWidget;
		if ( bridge && typeof bridge.appendChatMessage === 'function' ) {
			init( bridge );
			return;
		}
		if ( ( attempts || 0 ) >= BRIDGE_MAX_ATTEMPTS ) {
			return; // Bridge never appeared — give up silently.
		}
		setTimeout( function () {
			waitForBridge( ( attempts || 0 ) + 1 );
		}, BRIDGE_POLL_INTERVAL );
	}

	waitForBridge( 0 );
} )();
