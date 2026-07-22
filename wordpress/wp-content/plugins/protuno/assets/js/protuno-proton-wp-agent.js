/**
 * Engine B in the browser — WordPress Connectors AI + direct editor tools.
 * No claude-agent sidecar required for provider "wp".
 */
( function () {
	'use strict';

	var MAX_ITERATIONS           = 16;
	/** Max chars per tool result sent back to the model (large widgets). */
	var MAX_TOOL_RESPONSE_CHARS  = 100000;
	var MAX_HISTORY_CONTENT_CHARS = 2500;

	var EDITOR_TOOLS = [
		{
			name:        'get_widget_code',
			description: 'Read code from a UiChemy Composer widget. Returns { html, css, js } for the requested fields. ' +
				'Pass widgetId to target a specific widget on the page; omit widgetId to read the active widget ' +
				'(widget scope) or the only widget on the page. Pass fields:["html"] / ["css","js"] to limit which ' +
				'sections are returned — defaults to all three.',
			inputSchema: {
				type:       'object',
				properties: {
					widgetId: { type: 'string', description: 'Optional Elementor widget ID. Omit to target the active widget.' },
					fields:   { type: 'array', description: 'Optional subset of fields: "html", "css", "js". Defaults to all three.', items: { type: 'string', enum: [ 'html', 'css', 'js' ] } },
				},
				required: [],
			},
		},
		{
			name:        'apply_widget_code',
			description: 'Write code into a UiChemy Composer widget. Pass any combination of html / css / js — fields you omit stay unchanged. ' +
				'HTML and JS are FULL REPLACE; CSS APPENDS to existing rules (pass only new/changed rules, never repeat existing ones). ' +
				'Pass widgetId to target a specific widget; omit widgetId for the active widget. ' +
				'Do NOT use this to add a new section — use insert_widget_after for brand-new content on the page.',
			inputSchema: {
				type:       'object',
				properties: {
					widgetId: { type: 'string', description: 'Optional Elementor widget ID. Omit to target the active widget.' },
					html:     { type: 'string', description: 'Full replacement HTML. Omit to leave HTML unchanged.' },
					css:      { type: 'string', description: 'CSS rules to APPEND. Pass only new/changed rules. Omit to leave CSS unchanged.' },
					js:       { type: 'string', description: 'Full replacement JavaScript. Omit to leave JS unchanged.' },
				},
				required: [],
			},
		},
		{
			name:        'get_selected_element',
			description: 'Get the element picked in the chat element picker. Returns tagName, selector (class-based, may match siblings), ' +
				'nthSelector (unique nth-of-type path — use THIS for CSS rules), html (outerHTML). ' +
				'When a selection is active, call this FIRST. Available in both widget and page scope.',
			inputSchema: { type: 'object', properties: {}, required: [] },
		},
		// ── Page-scope tools (available when scope === "page") ────────────────
		{
			name:        'list_page_widgets',
			description: 'List all UiChemy Composer widgets on the current Elementor page. Returns an array of { id, label, htmlPreview }. Always call this first when working in page scope to know which widgets are available.',
			inputSchema: { type: 'object', properties: {}, required: [] },
		},
		{
			name:        'insert_widget_after',
			description: '★ PRIMARY TOOL for ADDING NEW CONTENT to the page. ★ ' +
				'Use this whenever the user asks to ADD / CREATE / INSERT / PUT / BUILD a NEW section, widget, or block of content. ' +
				'Examples that REQUIRE this tool (not apply_widget_code on an existing widget): ' +
				'"add a testimonial section after X", "create a pricing section", "insert a CTA after the hero", ' +
				'"put a contact form at the bottom", "build a champions section after the team carousel". ' +
				'Creates a brand-new UiChemy Composer widget and places it immediately after the reference widget. ' +
				'Returns { widgetId } — capture this id for chaining further inserts. ' +
				'Workflow: 1) Call list_page_widgets first to get widget IDs. ' +
				'2) Pick the widget whose ID should be after_widget_id (the widget ABOVE the insertion point). ' +
				'3) Call insert_widget_after with self-contained html + css for the new widget. ' +
				'Omit after_widget_id to insert at the top of the page. ' +
				'Use the LAST widget\'s ID to append at the bottom. ' +
				'★ CHAINING FOR MULTI-SECTION BUILDS ★ When inserting multiple sections in order ' +
				'(e.g. Nav → Hero → Features → Footer), DO NOT pass the same after_widget_id for ' +
				'every call — that places them in REVERSE order. Instead, capture the returned ' +
				'widgetId from each call and pass it as after_widget_id for the NEXT call. ' +
				'★ EMPTY-WIDGET REUSE ★ If list_page_widgets returns a widget with empty / "(empty)" / ' +
				'placeholder htmlPreview at the position you want to start, REUSE it via apply_widget_code ' +
				'(passing widgetId) instead of inserting a new widget — this avoids leaving an orphan empty widget. ' +
				'CRITICAL: Do NOT use apply_widget_code on a NON-EMPTY existing widget to "add" new content — that MODIFIES the existing widget. ' +
				'Never tell the user to manually add a widget — always call this tool yourself.',
			inputSchema: {
				type:       'object',
				properties: {
					after_widget_id: { type: 'string', description: 'Widget ID to insert AFTER (from list_page_widgets). Omit to insert at the top. Use last widget ID for bottom.' },
					label:           { type: 'string', description: 'Human-readable label for the navigator (e.g. "Pricing", "Champions"). Defaults to "New Section".' },
					html:            { type: 'string', description: 'HTML for the new widget (self-contained).' },
					css:             { type: 'string', description: 'CSS for the new widget.' },
					js:              { type: 'string', description: 'Optional JavaScript for the new widget.' },
				},
				required: [ 'html' ],
			},
		},
		// ── Elementor globals tools ───────────────────────────────────────────
		{
			name:        'get_globals',
			description: 'Return the current Elementor globals (colors, typography, container width). Call this PROACTIVELY before writing any new HTML/CSS. Returns JSON { present, snapshot, counts:{ colors, typography, container_width:{ size, unit } }, hash }. The snapshot string contains the full globals CSS — color vars, container width class with desktop max-width, and typography class blocks. Read the snapshot to know which color vars and class names to use. If present is false the kit is empty — proceed with raw values.',
			inputSchema: {
				type:       'object',
				properties: {},
				required:   [],
			},
		},
		{
			name:        'sync_globals',
			description: 'Add, update, or delete Elementor kit globals — colors, typography, AND container/box widths. Each color/typography entry is { action: "ADD"|"SET"|"DEL", value: { id, title, value } }. For ADD: generate a random 7-char lowercase hex id. For SET / DEL: use an existing id from get_globals. Color value is "#rrggbb". Typography value is an object with typography_typography:"custom", typography_font_family, typography_font_weight (string), typography_font_size:{unit:"px",size,sizes:[]}, typography_line_height:{unit:"em"|"px",size,sizes:[]}, typography_letter_spacing:{unit:"px",size,sizes:[]}. Container widths replace existing values per breakpoint: pass container_width as { widescreen?, desktop?, laptop?, tablet_extra?, tablet?, mobile_extra?, mobile? } where each value is { unit:"px", size:N, sizes:[] }. Send only the breakpoints you want to change. DEL operations require the user to confirm in the browser — if the user declines, the response is { success:false, cancelled:true }. After ADD/SET, call get_globals again to capture server-issued ids.',
			inputSchema: {
				type:       'object',
				properties: {
					colors:          { type: 'array',  description: 'Color ops: [{ action, value:{ id, title, value } }, …].' },
					typography:      { type: 'array',  description: 'Typography ops: [{ action, value:{ id, title, value:{ typography_typography:"custom", typography_font_family, typography_font_weight, typography_font_size:{unit,size,sizes:[]}, typography_line_height:{...}, typography_letter_spacing:{...} } } }, …].' },
					container_width: { type: 'object', description: 'Replace container/box widths per breakpoint. Keys: widescreen, desktop, laptop, tablet_extra, tablet, mobile_extra, mobile. Each value is { unit:"px", size:N, sizes:[] }. Omit keys you do not want to change.' },
				},
				required: [],
			},
		},
		// ── Page code tools ────────────────────────────────────────────────────
		{
			name:        'get_page_code',
			description: 'Return the current page-level custom code { head, body } shared across all UiChemy Composer widgets on this page. "head" maps to the "Before </head>" field — code injected before the closing </head> tag on this page only. "body" maps to the "Before </body>" field — code injected before the closing </body> tag on this page only. Call this BEFORE adding page code to avoid duplicates.',
			inputSchema: {
				type:       'object',
				properties: {},
				required:   [],
			},
		},
		{
			name:        'set_page_code',
			description: 'Replace the page-level custom code shared by all UiChemy Composer widgets on this page. Full replace per field — always call get_page_code first, then include existing content plus your additions. "head" is the "Before </head>" field: page-specific <link>, <style>, meta tags. "body" is the "Before </body>" field: page-specific <script> tags. Omitting a field (pass null or omit key) leaves it unchanged. Returns { success, widgetsUpdated }.',
			inputSchema: {
				type:       'object',
				properties: {
					head: { type: 'string', description: 'Full replacement for the "Before </head>" field on this page. Omit or pass null to leave unchanged.' },
					body: { type: 'string', description: 'Full replacement for the "Before </body>" field on this page. Omit or pass null to leave unchanged.' },
				},
				required: [],
			},
		},
		// ── Site code tools ────────────────────────────────────────────────────
		{
			name:        'get_site_code',
			description: 'Return the current site-wide custom code { head, body }. "head" maps to the "Before </head>" field — injected before </head> on every page. "body" maps to the "Before </body>" field — injected before </body> on every page. Call this BEFORE adding any site-wide code to check what is already there and avoid duplicates.',
			inputSchema: {
				type:       'object',
				properties: {},
				required:   [],
			},
		},
		{
			name:        'set_site_code',
			description: 'Replace the site-wide custom code. Full replace per field — always call get_site_code first, then include existing content plus your additions. "head" is the "Before </head>" field: <link>, <style>, meta tags for every page. "body" is the "Before </body>" field: <script> tags and analytics for every page. Omitting a field (pass null or omit key) leaves it unchanged. Returns { success, head, body }.',
			inputSchema: {
				type:       'object',
				properties: {
					head: { type: 'string', description: 'Full replacement for the site-wide "Before </head>" field. Omit or pass null to leave unchanged.' },
					body: { type: 'string', description: 'Full replacement for the site-wide "Before </body>" field. Omit or pass null to leave unchanged.' },
				},
				required: [],
			},
		},
	];

	// Per-tool scope+intent visibility — mirrors TOOL_SCOPE in claude-agent.js.
	// 'scopes' lists the scopes a tool is visible in. 'intents' is '*' (any) or
	// an array of accepted intents ('create' | 'modify' | 'unknown'). Used by
	// filterToolsForScope() to narrow the model's tool menu per turn.
	var TOOL_SCOPE = {
		get_widget_code:      { scopes: [ 'widget', 'page' ], intents: [ 'modify', 'unknown' ] },
		apply_widget_code:    { scopes: [ 'widget', 'page' ], intents: [ 'modify', 'unknown' ] },
		get_selected_element: { scopes: [ 'widget', 'page' ], intents: '*' },
		list_page_widgets:    { scopes: [ 'page' ],           intents: '*' },
		insert_widget_after:  { scopes: [ 'page' ],           intents: [ 'create', 'unknown' ] },
		get_globals:          { scopes: [ 'widget', 'page' ], intents: '*' },
		sync_globals:         { scopes: [ 'widget', 'page' ], intents: '*' },
		get_page_code:        { scopes: [ 'page' ],           intents: '*' },
		set_page_code:        { scopes: [ 'page' ],           intents: '*' },
		get_site_code:        { scopes: [ 'widget', 'page' ], intents: '*' },
		set_site_code:        { scopes: [ 'widget', 'page' ], intents: '*' },
	};

	function filterToolsForScope( tools, scope, intent ) {
		var s = scope === 'page' ? 'page' : 'widget';
		var i = intent === 'create' || intent === 'modify' ? intent : 'unknown';
		return ( tools || [] ).filter( function ( t ) {
			var rule = TOOL_SCOPE[ t.name ];
			if ( ! rule ) return true;
			if ( rule.scopes.indexOf( s ) === -1 ) return false;
			if ( rule.intents === '*' ) return true;
			return rule.intents.indexOf( i ) !== -1;
		} );
	}

	var TOOL_LABELS = {
		get_widget_code:      'Reading widget code...',
		apply_widget_code:    'Applying widget code...',
		get_selected_element: 'Inspecting selected element...',
		list_page_widgets:    'Scanning page widgets...',
		insert_widget_after:  'Inserting new widget...',
		// Elementor globals
		get_globals:          'Reading Elementor globals...',
		sync_globals:         'Updating Elementor globals...',
		// Page code
		get_page_code:        'Reading page code...',
		set_page_code:        'Updating page code...',
		// Site code
		get_site_code:        'Reading site code...',
		set_site_code:        'Updating site code...',
	};

	/**
	 * Shrink huge tool output so the next API turn stays within limits.
	 *
	 * @param {string} text
	 * @param {string} toolName
	 * @returns {string}
	 */
	function truncateForModel( text, toolName ) {
		var s = String( text || '' );
		if ( s.length <= MAX_TOOL_RESPONSE_CHARS ) {
			return s;
		}
		var keep = Math.floor( MAX_TOOL_RESPONSE_CHARS / 2 );
		var omitted = s.length - MAX_TOOL_RESPONSE_CHARS;
		return (
			s.slice( 0, keep ) +
			'\n\n...[UiChemy: ' + omitted + ' characters omitted from ' + ( toolName || 'tool' ) +
			' response. Content is truncated for the model — the full code remains in the editor. ' +
			'Make targeted apply_* changes rather than re-reading entire files.]...\n\n' +
			s.slice( -keep )
		);
	}

	function normaliseArgs( raw ) {
		if ( raw && typeof raw === 'object' ) {
			return raw;
		}
		if ( typeof raw === 'string' && raw.trim() ) {
			try {
				return JSON.parse( raw );
			} catch ( _ ) {
				return {};
			}
		}
		return {};
	}

	function toToolDeclarations( tools ) {
		return ( tools || [] ).map( function ( t ) {
			return {
				name:        t.name,
				description: t.description || '',
				parameters:  t.inputSchema || null,
			};
		} );
	}

	function buildAuthHeaders( wpAgent ) {
		var headers = { 'Content-Type': 'application/json' };
		if ( wpAgent.restNonce ) {
			headers[ 'X-WP-Nonce' ] = wpAgent.restNonce;
		}
		return headers;
	}

	function postTurn( url, wpAgent, payload, signal ) {
		return fetch( url, {
			method:      'POST',
			headers:     buildAuthHeaders( wpAgent ),
			body:        JSON.stringify( payload ),
			credentials: 'same-origin',
			signal:      signal || null,
		} )
			.then( function ( res ) {
				return res.text().then( function ( text ) {
					var body;
					try {
						body = text ? JSON.parse( text ) : {};
					} catch ( _ ) {
						throw new Error( 'WordPress AI endpoint returned non-JSON (HTTP ' + res.status + ').' );
					}
					if ( body && body.success === false ) {
						throw new Error( body.error || body.message || 'WordPress AI error.' );
					}
					if ( ! res.ok ) {
						throw new Error( ( body && ( body.error || body.message ) ) || 'HTTP ' + res.status );
					}
					return body || {};
				} );
			} );
	}

	/**
	 * Heuristic classifier for the user's intent in page scope.
	 * Mirrors the sidecar's classifyPageIntent so the browser-side WP agent
	 * can inject the same hard PATH A directive when needed.
	 *
	 * @param {string} userPrompt
	 * @returns {'create'|'modify'|'unknown'}
	 */
	function classifyPageIntent( userPrompt ) {
		var text = String( userPrompt || '' ).toLowerCase().trim();
		if ( ! text ) { return 'unknown'; }
		var createPatterns = [
			/\b(add|create|insert|put|build|make|generate|append|prepend|place)\b[^.]*\b(new\s+)?(section|widget|block|card|panel|area|row|module|container)\b/,
			/\b(add|create|insert|put|build)\b[^.]*\b(after|before|below|above|between)\s+the\b/,
			/\b(after|before|below|above)\s+the\s+\w+(\s+\w+){0,3}\s+(section|widget|block)\b/,
			/\b(build|create|make|generate)\s+(my|a|the|this)?\s*(page|landing\s+page|layout|design|template|website|site)\b/,
			/\b(divide|split)\s+(the|this)?\s*(code|page|sections?|html|layout)\b/,
			/\bcreate\s+a\s+new\b/,
			/\badd\s+a\s+new\b/,
			/\binsert\s+a\b/,
		];
		for ( var i = 0; i < createPatterns.length; i++ ) {
			if ( createPatterns[ i ].test( text ) ) { return 'create'; }
		}
		var modifyPatterns = [
			/\b(change|update|fix|restyle|recolor|rename|edit|adjust|tweak)\b[^.]*\b(the|this)\b/,
			/\b(make|set)\b[^.]*\b(bigger|smaller|larger|red|blue|green|bold|italic|responsive)\b/,
			/\b(remove|delete)\b/,
		];
		for ( var j = 0; j < modifyPatterns.length; j++ ) {
			if ( modifyPatterns[ j ].test( text ) ) { return 'modify'; }
		}
		return 'unknown';
	}

	/**
	 * Build the system + user prompts.
	 *
	 * Returns { system, user } so runAgent can send the instructions in the
	 * actual `system` field (rather than burying them in the first user
	 * message, which weakens the model's instruction-following).
	 *
	 * @param {object} opts
	 * @returns {{ system: string, user: string }}
	 */
	function buildPrompt( opts ) {
		var prompt           = opts.prompt || '';
		var selectedSelector = opts.selectedSelector || '';
		var history          = opts.history || [];
		var sessionId        = opts.sessionId || '';
		var imageCount       = opts.imageCount || 0;
		var attachments      = Array.isArray( opts.attachments ) ? opts.attachments : [];
		var uploadsBaseUrl   = String( opts.uploadsBaseUrl || '' ).replace( /\/+$/, '' );
		var scope                   = opts.scope || 'widget';
		var templateType            = opts.templateType || '';
		var templateTargetPostType  = opts.templateTargetPostType || 'post';
		// Multi-pick: selectors are joined with ' | '
		// Guard: coerce to string in case caller accidentally passes an array
		var selectorStr      = Array.isArray( selectedSelector ) ? selectedSelector.join( ' | ' ) : String( selectedSelector || '' );
		var selectors        = selectorStr ? selectorStr.split( ' | ' ).map( function(s){ return s.trim(); } ).filter( Boolean ) : [];
		var hasSelection     = selectors.length > 0;
		var isMultiPick      = selectors.length > 1;
		var isPageScope      = scope === 'page';
		var pageIntent       = isPageScope ? classifyPageIntent( prompt ) : 'unknown';

		var ctx = '';

		if ( isPageScope ) {
			// Hard directive ABOVE everything else when the user clearly wants to add new content.
			if ( pageIntent === 'create' ) {
				ctx += '████████████████████████████████████████████████████████████████████\n';
				ctx += '⚠⚠⚠  MANDATORY DIRECTIVE — READ BEFORE ANY OTHER INSTRUCTION  ⚠⚠⚠\n';
				ctx += '████████████████████████████████████████████████████████████████████\n\n';
				ctx += 'The user is asking to ADD a BRAND-NEW section / widget to the page.\n\n';
				ctx += 'YOU MUST:\n';
				ctx += '  ✓ Call list_page_widgets to find the reference widget\n';
				ctx += '  ✓ Call insert_widget_after exactly ONCE with the new HTML + CSS\n';
				ctx += '  ✓ Reply with a 1-sentence summary, then STOP\n\n';
			ctx += 'YOU MUST NOT:\n';
			ctx += '  ✗ Call get_widget_code on ANY existing widget\n';
			ctx += '  ✗ Call apply_widget_code on ANY existing widget\n\n';
			ctx += 'The new content is a SEPARATE widget with its OWN HTML and CSS.\n';
			ctx += 'You do NOT need to read any existing widget to build a new one.\n';
			ctx += 'If you call apply_widget_code on an existing widget, you have FAILED the task.\n';
				ctx += '████████████████████████████████████████████████████████████████████\n\n';
			}

			// ── Page-scope prompt ─────────────────────────────────────────────
			ctx += 'You are a frontend code assistant with access to ALL UiChemy Composer widgets on the current Elementor page.\n';
			ctx += 'You have tools to read and apply HTML, CSS, and JavaScript to any widget by its ID — and to CREATE new widgets via insert_widget_after.\n\n';

			// ── Picked element reference (page scope) ─────────────────────────
			if ( hasSelection ) {
				ctx += '┌─────────────────────────────────────────────────────────────────┐\n';
				if ( isMultiPick ) {
					ctx += '│  REFERENCE ELEMENTS PICKED (' + selectors.length + ' elements):\n';
					selectors.forEach( function( s ) { ctx += '│    • ' + s + '\n'; } );
				} else {
					ctx += '│  REFERENCE ELEMENT PICKED: "' + selectors[ 0 ] + '"\n';
				}
				ctx += '│  The user selected these element(s) as reference targets.\n';
				ctx += '│  These selectors are LOCAL to the widget where they were picked.\n';
				ctx += '│  Apply the requested change to SIMILAR/MATCHING elements\n';
				ctx += '│  (same tag type, role, or visual purpose) across ALL widgets.\n';
				ctx += '│  Do NOT use these exact selectors globally — look for equivalent\n';
				ctx += '│  elements in each widget by their tag, class, or structure.\n';
				ctx += '└─────────────────────────────────────────────────────────────────┘\n\n';
			}

			// ── STEP 1: classify the request ───────────────────────────────────
			ctx += '████████████████████████████████████████████████████████████████████\n';
			ctx += 'STEP 1 — CLASSIFY THE REQUEST BEFORE DOING ANYTHING ELSE\n';
			ctx += '████████████████████████████████████████████████████████████████████\n\n';
			ctx += '  ┌─ PATH A: ADD/CREATE a new section or widget ────────────────────┐\n';
			ctx += '  │  Triggers: "add a ... section", "create a new ...",             │\n';
			ctx += '  │            "insert ... after / before", "build ... after ...",  │\n';
			ctx += '  │            "put a ... below the ... section".                   │\n';
			ctx += '  │  → You MUST use insert_widget_after.                            │\n';
			ctx += '  │  → You MUST NOT touch existing widgets\' HTML/CSS/JS.            │\n';
			ctx += '  └─────────────────────────────────────────────────────────────────┘\n\n';
			ctx += '  ┌─ PATH B: MODIFY/UPDATE/CHANGE existing content ─────────────────┐\n';
			ctx += '  │  Triggers: "change the ...", "update the ...", "make the ...    │\n';
			ctx += '  │            bigger/red", "fix the ...", "remove the ...".        │\n';
			ctx += '  │  → Use get_widget_code / apply_widget_code (with widgetId).     │\n';
			ctx += '  └─────────────────────────────────────────────────────────────────┘\n\n';
			ctx += 'If unsure, assume PATH A whenever the user says "add", "create",\n';
			ctx += '"insert", "new", or positional words like "after / before / below".\n\n';

			// ── PATH A workflow ────────────────────────────────────────────────
			ctx += '████████████████████████████████████████████████████████████████████\n';
			ctx += 'PATH A — CREATE A NEW WIDGET (use insert_widget_after)\n';
			ctx += '████████████████████████████████████████████████████████████████████\n\n';
			ctx += 'Workflow for PATH A — single new section:\n';
			ctx += '  1. Call list_page_widgets — get all widgets, in display order.\n';
			ctx += '  2. Decide WHERE the new section should go:\n';
			ctx += '     • "after the X section" → after_widget_id = ID of widget X\n';
			ctx += '     • "at the top" → omit after_widget_id\n';
			ctx += '     • "at the bottom" → use the LAST widget\'s ID\n';
			ctx += '  3. ★ EMPTY-WIDGET REUSE ★ — Before inserting, check list_page_widgets for a\n';
			ctx += '     widget whose htmlPreview is empty / "(empty)" / very short placeholder.\n';
			ctx += '     If one exists AT or NEAR your target position, REUSE it via\n';
			ctx += '     apply_widget_code({ widgetId, html, css }) instead of inserting a new one.\n';
			ctx += '     This is the one allowed exception to "never touch existing widgets" on PATH A\n';
			ctx += '     — it avoids leaving an orphan blank section.\n';
			ctx += '  4. Call get_globals — read the snapshot to get:\n';
			ctx += '     • Color vars (use these instead of raw hex in CSS)\n';
			ctx += '     • Typography class IDs (add to elements, omit repeated font props)\n';
			ctx += '     • Container width class (add this class to your outer wrapper —\n';
			ctx += '       do NOT write max-width manually)\n';
			ctx += '  5. Build self-contained HTML + CSS using the globals from step 4.\n';
			ctx += '  6. Call apply_widget_code (if reusing empty widget) OR insert_widget_after.\n';
			ctx += '  7. Reply with a 1-sentence summary.\n\n';

			ctx += 'Workflow for PATH A — MULTIPLE new sections (full-page build / "divide into sections"):\n';
			ctx += '  When the user gives you a multi-section design (e.g. a full HTML page with\n';
			ctx += '  navigation + hero + features + footer), build the sections IN DISPLAY ORDER,\n';
			ctx += '  top-to-bottom, one at a time, CHAINING the widget IDs:\n\n';
			ctx += '    1. Call list_page_widgets. Note the empty widget (if any) and the last widget id.\n';
			ctx += '    1b. Call get_globals — read the snapshot for color vars, typography class IDs,\n';
			ctx += '        and the container width class. Use these across ALL sections you build.\n';
			ctx += '    2. Place section #1:\n';
			ctx += '       • If an empty widget exists at the start position → reuse it via\n';
			ctx += '         apply_widget_code({ widgetId: <empty>, html: <section #1>, css: <css #1> }).\n';
			ctx += '         Capture <empty> as the "previous" widget id.\n';
			ctx += '       • Otherwise → insert_widget_after({ after_widget_id: <last existing>,\n';
			ctx += '         html: <section #1>, ... }) and capture the returned widgetId as "previous".\n';
			ctx += '    3. For section #2..N (in display order):\n';
			ctx += '       • insert_widget_after({ after_widget_id: <previous>, html: <section i>, ... })\n';
			ctx += '       • Capture the returned widgetId as the new "previous" for section i+1.\n';
			ctx += '    4. Reply with a 1-sentence summary of what was built.\n\n';
			ctx += '  ⚠ ORDER BUG (do not do this):\n';
			ctx += '    Calling insert_widget_after THREE times with the SAME after_widget_id places\n';
			ctx += '    the sections in REVERSE because each insert shoves prior ones down. Always use\n';
			ctx += '    the PREVIOUS section\'s returned id as the next after_widget_id.\n\n';

			ctx += '⚠ PATH A HARD RULES:\n';
			ctx += '  ✗ Do NOT call get_widget_code on an existing NON-EMPTY widget.\n';
			ctx += '  ✗ Do NOT call apply_widget_code on a NON-EMPTY existing widget to add new content.\n';
			ctx += '  ✗ Do NOT append new section content to an existing widget\'s HTML.\n';
			ctx += '  ✓ Reusing a confirmed-EMPTY widget via apply_widget_code for the FIRST section is ALLOWED.\n';
			ctx += '  ✓ Chain inserts: previous insert\'s returned id → next after_widget_id.\n\n';

			ctx += '★ SPLITTING A FULL HTML PAGE INTO WIDGETS — strict format rules ★\n';
			ctx += 'When the user pastes a complete HTML document (<!doctype html>, <html>, <head>,\n';
			ctx += '<body>, etc.) and asks you to build it as widgets, you MUST transform each\n';
			ctx += 'section before passing it to apply_widget_code / insert_widget_after:\n';
			ctx += '  ✗ DROP <!doctype html>, <html>, <head>, <body>, <title>, <meta> entirely.\n';
			ctx += '  ✗ DROP <script src="https://cdn.tailwindcss.com"> and other external CDN scripts —\n';
			ctx += '     they cannot be loaded reliably from inside a widget. Convert Tailwind\n';
			ctx += '     utility classes (flex, text-6xl, bg-black/20, md:grid-cols-3, etc.)\n';
			ctx += '     into plain CSS rules in the widget\'s css field instead.\n';
			ctx += '  ✗ DROP <link rel="stylesheet" href="..."> for Google Fonts — re-add fonts via\n';
			ctx += '     @import url(...) at the TOP of the widget CSS.\n';
			ctx += '  ✗ Do NOT style body { ... } or html { ... } selectors — those rules will not\n';
			ctx += '     apply inside a widget. Move the styling to a wrapper <div> at the top of\n';
			ctx += '     the widget HTML, and target that wrapper\'s class in the CSS.\n';
			ctx += '  ✓ For position: fixed / absolute elements, either keep position: fixed if\n';
			ctx += '     intended to be page-wide, or change to position: absolute INSIDE a\n';
			ctx += '     position: relative wrapper if scoped.\n';
			ctx += '  ✓ Each widget MUST be self-contained: include its own @keyframes, font-face,\n';
			ctx += '     and any utility CSS its HTML references. Widgets do NOT share styles.\n';
			ctx += '  ✓ JavaScript goes via apply_widget_code\'s js field, NEVER inside <script> tags in HTML.\n\n';

			// ── PATH B workflow ────────────────────────────────────────────────
			ctx += '████████████████████████████████████████████████████████████████████\n';
		ctx += 'PATH B — MODIFY EXISTING WIDGETS (use get_widget_code / apply_widget_code)\n';
		ctx += '████████████████████████████████████████████████████████████████████\n\n';
		ctx += 'Workflow for PATH B:\n';
		ctx += '  1. Call list_page_widgets() to see all UiChemy Composer widgets on this page.\n';
		ctx += '  2. Decide which widgets the user\'s request applies to.\n';
		ctx += '  3. For each relevant widget:\n';
		ctx += '     a. Call get_widget_code({ widgetId, fields: ["html","css"] }) to read it.\n';
		if ( hasSelection ) {
			ctx += '     b. Find elements similar to the reference selector in that widget\'s HTML.\n';
			ctx += '     c. Apply the change to those matching elements.\n';
			ctx += '     d. Re-call get_widget_code with fields: ["js"] only if JS changes are needed.\n';
		} else {
			ctx += '     b. Re-call get_widget_code with fields: ["js"] only if JS changes are needed.\n';
		}
		ctx += '     e. Apply changes with apply_widget_code({ widgetId, html?, css?, js? }) — pass only fields you are changing.\n';
		ctx += '  4. Reply with a short summary listing which widgets were changed.\n\n';

		ctx += 'STRICT RULES:\n';
		ctx += '- Skip widgets where the request does not apply\n';
		ctx += '- apply_widget_code.html: pass COMPLETE html for that widget — not just the changed portion\n';
		ctx += '- apply_widget_code.css: APPEND-only — only new/changed rules, never repeat existing ones\n';
		ctx += '- apply_widget_code.js: pass COMPLETE updated JavaScript\n';
		ctx += '- NEVER add <script> tags inside HTML — all JavaScript goes via the apply_widget_code js field\n';
		ctx += '- Do NOT output code blocks — apply changes via tools\n';
		ctx += '- Keep final response short — changes are already live in the browser\n\n';
		} else {
			// ── Header / footer template context (prepended when applicable) ──
			if ( templateType === 'header' || templateType === 'footer' ) {
				ctx  = '────────────────────────────────────────────────────────────────────\n';
				ctx += 'TEMPLATE CONTEXT: SITE ' + templateType.toUpperCase() + ' TEMPLATE\n';
				ctx += '────────────────────────────────────────────────────────────────────\n';
				ctx += 'You are editing a site-wide ' + templateType + ' template, not a regular page.\n';
				ctx += 'This template renders on every page of the site.\n';
				ctx += '- Root element must be <' + templateType + '>.\n';
				if ( templateType === 'header' ) {
					ctx += '- For a sticky/fixed navbar: use position: fixed or sticky on the <header> or inner bar.\n';
					ctx += '- If the fixed header overlaps page content, add margin-top / padding-top to the body\n';
					ctx += '  via set_site_code (site-wide CSS), not via page code.\n';
					ctx += '\n';
					ctx += '★ NAVIGATION MENU — MANDATORY RULE ★\n';
					ctx += 'NEVER hardcode navigation links (<a href="#">Page</a>).\n';
					ctx += 'ALWAYS use the <uichemy-nav-menu> tag — it renders the WordPress nav menu automatically.\n';
					ctx += 'Exact syntax (add your own CSS classes as needed):\n';
					ctx += '\n';
					ctx += '  <uichemy-nav-menu>\n';
					ctx += '    <li for="nav_item in nav_menu" class="your-item-class">\n';
					ctx += '      {nav_item}\n';
					ctx += '      <ul if="sub_items in nav_item" class="your-submenu-class">\n';
					ctx += '        <li for="sub_item in nav_item.sub_items" class="your-sub-item-class">\n';
					ctx += '          {sub_item}\n';
					ctx += '        </li>\n';
					ctx += '      </ul>\n';
					ctx += '    </li>\n';
					ctx += '  </uichemy-nav-menu>\n';
					ctx += '\n';
					ctx += '- {nav_item} and {sub_item} render as the actual WordPress <a> link elements.\n';
					ctx += '- Add CSS classes to <li> and <ul> for styling — target them in your CSS.\n';
					ctx += '- The <ul if="sub_items in nav_item"> block only renders for items with sub-pages.\n';
					ctx += '- You can add any attribute (id, class, data-*) directly to <uichemy-nav-menu>.\n';
					ctx += '- Style links via CSS: .your-item-class a { ... }\n';
					ctx += '\n';
					ctx += '★ LOGO & ICON — MANDATORY RULE ★\n';
					ctx += 'NEVER hardcode logo/icon URLs (<img src="logo.png">).\n';
					ctx += 'Use these self-closing tags — they read from WordPress Site Identity automatically:\n';
					ctx += '\n';
					ctx += '  <uichemy-site-logo class="your-logo-class" />\n';
					ctx += '    → Renders the WordPress custom logo as <a href="/"><img .../></a>.\n';
					ctx += '    → Falls back to site name as text if no logo is uploaded yet.\n';
					ctx += '    → Any attributes (class, id, data-*) are forwarded to the <a> wrapper.\n';
					ctx += '\n';
					ctx += '  <uichemy-site-icon class="your-icon-class" data-size="64" />\n';
					ctx += '    → Renders the WordPress site icon (favicon). Default size: 192px.\n';
					ctx += '    → Use data-size for a specific size (e.g. data-size="32" or "64").\n';
					ctx += '    → Useful as a small brand mark next to the logo or as a mobile-only mark.\n';
					ctx += '    → Attributes are forwarded to the <a> wrapper.\n';
				}
				ctx += '- get_page_code and set_page_code do NOT apply to this template — do not call them.\n';
				ctx += '- For site-wide CSS that affects other pages (e.g. body margin), use set_site_code.\n';
				ctx += '────────────────────────────────────────────────────────────────────\n\n';
			} else if ( templateType === 'single' ) {
				ctx  = '────────────────────────────────────────────────────────────────────\n';
				ctx += 'TEMPLATE CONTEXT: SINGLE POST TEMPLATE\n';
				ctx += '────────────────────────────────────────────────────────────────────\n';
				ctx += 'You are editing a theme builder single post template, not a regular page.\n';
				ctx += 'This template is ACTIVE on all "' + templateTargetPostType + '" posts across the site.\n';
				ctx += 'The template contains a UiChemy Composer widget — use get_widget_code / apply_widget_code\n';
				ctx += 'exactly as you would on a regular page.\n';
				ctx += '\n';
				ctx += '★ DYNAMIC CONTENT — MANDATORY RULES ★\n';
				ctx += 'NEVER hardcode post-specific data (title, author name, publish date,\n';
				ctx += 'category, tags, featured image URL, or post body text).\n';
				ctx += 'These values are different for every post — hardcoding them breaks every other post.\n';
				ctx += '\n';
				ctx += 'Use these two custom tags for dynamic content:\n';
				ctx += '\n';
				ctx += '  <uichemy-post-content />\n';
				ctx += '    → The ONLY way to render the post body content.\n';
				ctx += '    → Place it inside a styled wrapper — do NOT style the tag itself.\n';
				ctx += '    → Required. Every single post template MUST include this tag.\n';
				ctx += '\n';
				ctx += '  <uichemy-toc>\n';
				ctx += '    <li for="item in toc">...</li>\n';
				ctx += '  </uichemy-toc>\n';
				ctx += '    → Optional table of contents, auto-generated from post headings.\n';
				ctx += '    → Omit entirely if no TOC is needed.\n';
				ctx += '\n';
				ctx += '★ LAYOUT RULES ★\n';
				ctx += '- Do NOT include a header, footer, navigation bar, or logo — those are separate templates.\n';
				ctx += '- Do NOT include site-wide layout chrome (skip links, body wrappers, etc.).\n';
				ctx += '- Root element should be an <article> or <main> wrapping the post layout.\n';
				ctx += '- Use get_globals to read color vars and typography classes — apply them as on any page.\n';
				ctx += '\n';
				ctx += '★ CODE TOOLS ★\n';
				ctx += '- get_widget_code / apply_widget_code — read and write the widget HTML/CSS/JS as normal.\n';
				ctx += '- get_page_code / set_page_code — valid for page-level <head>/<body> injection on this template.\n';
				ctx += '- For CSS that must apply across all posts (e.g. body font), use set_site_code instead.\n';
				ctx += '────────────────────────────────────────────────────────────────────\n\n';
			} else {
				ctx = '';
			}
			// ── Widget-scope prompt (existing behaviour) ──────────────────────
			ctx += 'You are a frontend code assistant inside a live Elementor HTML widget editor.\n';
			ctx += 'You have tools to read and apply HTML, CSS, and JavaScript directly in the editor.\n\n';

			if ( hasSelection ) {
				if ( isMultiPick ) {
					ctx += 'ACTIVE SELECTION: the user picked ' + selectors.length + ' specific elements:\n';
					selectors.forEach( function( s, i ) { ctx += '  ' + ( i + 1 ) + '. ' + s + '\n'; } );
					ctx += 'Call get_selected_element() to read their full details. Apply changes to ALL picked elements.\n\n';
				} else {
					ctx += 'ACTIVE SELECTION: the user picked ONE specific element.\n';
					ctx += 'Display selector (may match siblings): ' + selectors[ 0 ] + '\n\n';
				}
			}

		ctx += 'WORKFLOW — follow this exact order every time:\n';
		if ( hasSelection ) {
			if ( isMultiPick ) {
				ctx += '1. Call get_selected_element() FIRST — returns all ' + selectors.length + ' picked elements\n';
				ctx += '2. Call get_widget_code (no widgetId, fields: ["html","css"]) — read current widget code\n';
				ctx += '3. Re-call get_widget_code with fields: ["js"] if JavaScript is needed\n';
				ctx += '4. Apply the requested change to EACH picked element (inline styles preferred for\n';
				ctx += '   visual tweaks; CSS rules for shared/structural changes)\n';
				ctx += '5. Call apply_widget_code({ html?, css?, js? }) — pass only fields you changed\n';
				ctx += '6. Reply with a short summary mentioning all changed elements\n\n';
			} else {
				ctx += '1. Call get_selected_element() FIRST\n';
				ctx += '2. Call get_widget_code (no widgetId, fields: ["html","css"]) — read current widget code\n';
				ctx += '3. Re-call get_widget_code with fields: ["js"] if JavaScript is needed\n';
				ctx += '4. Apply changes (prefer inline styles on the picked element for color/size changes)\n';
				ctx += '5. Call apply_widget_code({ html?, css?, js? }) — pass only fields you changed\n';
				ctx += '6. Reply with a short summary\n\n';
			}
		} else {
			ctx += '1. Call get_globals — note the color vars, typography class IDs, and container width class.\n';
			ctx += '2. Call get_widget_code (no widgetId, fields: ["html","css"]) — read current widget code\n';
			ctx += '3. Re-call get_widget_code with fields: ["js"] if needed\n';
			ctx += '4. Call apply_widget_code({ html?, css?, js? }) — pass only fields you are changing\n';
			ctx += '5. Short summary\n\n';
		}

		ctx += 'STRICT RULES:\n';
		ctx += '- Always read with get_widget_code before making changes — never assume the current code\n';
		ctx += '- Default get_widget_code call: fields:["html","css"]; only fetch js if you need it\n';
		ctx += '- apply_widget_code.html: COMPLETE html — not just the changed portion\n';
		ctx += '- apply_widget_code.css: APPEND-only — only new/changed rules, never repeat existing ones\n';
		ctx += '- apply_widget_code.js: COMPLETE js — not just the changed portion; never use <script> in HTML\n';
		ctx += '- Do NOT output code blocks — use tools\n\n';

		if ( hasSelection ) {
			ctx += 'SELECTION: class selectors may match multiple elements. For color/font on the picked element, prefer inline style on that element in apply_widget_code\'s html field.\n\n';
		}

		}

		if ( sessionId ) {
			ctx += 'Session ID: ' + sessionId + '\n\n';
		}

		// ── Elementor globals — tool-driven (kit or atomic) ─────────────────
		var atomicEnabled = !!( typeof window !== 'undefined' && window.uichComposerCfg && window.uichComposerCfg.atomicEnabled );
		ctx += '────────────────────────────────────────────────────────────────────\n';
		ctx += 'ELEMENTOR GLOBALS (get_globals / sync_globals)\n';
		ctx += '────────────────────────────────────────────────────────────────────\n\n';
		ctx += 'Globals tools are always available. Use them as follows:\n\n';
		ctx += '  • BEFORE writing any new HTML/CSS — call get_globals to check the\n';
		ctx += '    active palette, typography, and container width. The snapshot\n';
		ctx += '    field in the response contains the exact CSS to read:\n';
		if ( atomicEnabled ) {
			ctx += '      – Colors: use var(--label) instead of raw hex\n';
			ctx += '        e.g. snapshot shows "--brand-primary: #1a73e8" →\n';
			ctx += '        write var(--brand-primary) wherever that color is needed.\n';
			ctx += '      – Typography: add the global class ID shown in the snapshot\n';
			ctx += '        (e.g. .g-utabc12) to the element AND omit font-family/\n';
			ctx += '        font-size/font-weight/line-height/letter-spacing from its\n';
			ctx += '        CSS (the global class supplies them).\n';
			ctx += '      – Container width: add class elementor-atomic-boxed-width to\n';
			ctx += '        any section wrapper that needs a max-width constraint.\n';
			ctx += '        Do NOT write max-width manually.\n';
		} else {
			ctx += '      – Colors: use var(--e-global-color-{id}) instead of raw hex.\n';
			ctx += '      – Typography: for text matching a .text-{id} preset, add\n';
			ctx += '        that class AND omit font-family/size/weight/line-height/\n';
			ctx += '        letter-spacing from its CSS (the global class supplies them).\n';
			ctx += '      – Container width: add class elementor-global-boxed-width to\n';
			ctx += '        any section wrapper that needs a max-width constraint.\n';
			ctx += '        Do NOT write max-width manually.\n';
		}
		ctx += '      – Leave rgba() and gradients as-is — do not map them to globals.\n\n';
		ctx += '  • TO ADD / RENAME / REMOVE a global color or typography preset —\n';
		ctx += '    call sync_globals. Always call get_globals first to get existing ids.\n\n';
		ctx += '  • USER OPT-OUT — if the user says "use raw values" or "no globals",\n';
		ctx += '    skip get_globals and write plain CSS values.\n\n';

		// ── Site code — tool-driven ───────────────────────────────────────────
		ctx += '────────────────────────────────────────────────────────────────────\n';
		ctx += 'SITE CODE (get_site_code / set_site_code)\n';
		ctx += '────────────────────────────────────────────────────────────────────\n\n';
		ctx += 'Site code is injected on EVERY page of the site. The two fields map\n';
		ctx += 'to the panel labels exactly:\n';
		ctx += '  • head   = "Before </head>" — injected before </head> on every page.\n';
		ctx += '    Use for: <link> tags (fonts, CDN CSS), <style>, <meta>.\n';
		ctx += '  • body   = "Before </body>" — injected before </body> on every page.\n';
		ctx += '    Use for: <script> tags, analytics.\n\n';
		ctx += 'Use these tools when the user asks to add site-wide scripts, fonts,\n';
		ctx += 'global styles, or analytics that must load on every page:\n\n';
		ctx += '  • BEFORE adding site code — call get_site_code to see what is\n';
		ctx += '    already there. Avoid duplicating tags that are already present.\n\n';
		ctx += '  • set_site_code is a FULL REPLACE — always include the existing\n';
		ctx += '    content plus your additions (get first, then merge, then set).\n';
		ctx += '    Omit a field (or pass null) to leave it unchanged.\n\n';
		ctx += '  • Do NOT use site code for widget-specific or page-specific code.\n';
		ctx += '    Use the widget HTML/CSS/JS fields or page code tools instead.\n\n';

		// ── Page code — tool-driven ───────────────────────────────────────────
		ctx += '────────────────────────────────────────────────────────────────────\n';
		ctx += 'PAGE CODE (get_page_code / set_page_code)\n';
		ctx += '────────────────────────────────────────────────────────────────────\n\n';
		ctx += 'Page code is injected for THIS PAGE ONLY (shared across all UiChemy Composer\n';
		ctx += 'HTML widgets on the page). The two fields map to the panel labels:\n';
		ctx += '  • head   = "Before </head>" — injected before </head> on this page.\n';
		ctx += '    Use for: page-specific <link>, <style>, <meta> tags.\n';
		ctx += '  • body   = "Before </body>" — injected before </body> on this page.\n';
		ctx += '    Use for: page-specific <script> tags, inline JS.\n\n';
		ctx += 'Use these tools for code that applies to this page but not the\n';
		ctx += 'entire site:\n\n';
		ctx += '  • BEFORE adding page code — call get_page_code to see what is\n';
		ctx += '    already there. Avoid duplicating tags already present.\n\n';
		ctx += '  • set_page_code is a FULL REPLACE per field — always include\n';
		ctx += '    existing content plus your additions (get first, then set).\n';
		ctx += '    Omit a field (or pass null) to leave it unchanged.\n\n';
		ctx += '  • Use site code for fonts/scripts that apply to ALL pages.\n';
		ctx += '    Use widget HTML/CSS/JS for code tied to a specific widget.\n\n';

		// ── Third-party libraries — placement rules ───────────────────────────
		ctx += '────────────────────────────────────────────────────────────────────\n';
		ctx += 'THIRD-PARTY LIBRARIES (Swiper, GSAP, AOS, Alpine.js, Lottie, etc.)\n';
		ctx += '────────────────────────────────────────────────────────────────────\n\n';
		ctx += 'NEVER put <link> or <script> CDN tags inside widget HTML — browsers\n';
		ctx += 'silently ignore them when content is injected via innerHTML.\n\n';
		ctx += 'Correct placement:\n';
		ctx += '  • CDN CSS  → page code "Before </head>"  (<link rel="stylesheet">)\n';
		ctx += '  • CDN JS   → page code "Before </head>"  (NOT "Before </body>" —\n';
		ctx += '    widget JS runs in the body before </body> scripts load;\n';
		ctx += '    library must already be available)\n';
		ctx += '  • Init JS  → widget JS field (runs after widget renders; library\n';
		ctx += '    is already loaded from head)\n\n';
		ctx += 'Exception: if you place CDN JS in "Before </body>" or use async/defer,\n';
		ctx += 'init code must also go in "Before </body>" AFTER the CDN line — not in\n';
		ctx += 'widget JS.\n\n';
		ctx += 'SCOPE — default to PAGE code for any library. Only use site code if\n';
		ctx += 'the user explicitly says the library is needed on every page.\n\n';
		ctx += 'JQUERY — WordPress already loads jQuery globally. Never add it to\n';
		ctx += 'page or site code. Use window.jQuery or $ directly in widget JS.\n\n';
		ctx += 'DUPLICATE CHECK — always call get_page_code first. If the CDN link\n';
		ctx += 'is already present, skip adding it. If the version is outdated,\n';
		ctx += 'replace that line — do not add a second copy.\n\n';
		ctx += 'FONTS (Google Fonts, Adobe Fonts, etc.) → page code "Before </head>"\n';
		ctx += 'for this page, site code "Before </head>" for the whole site.\n';
		ctx += 'Never in widget HTML.\n\n';

		// Everything above is the system part. History + user request form the
		// "user" part so it can be sent as a proper user message — this gives
		// the system instructions full system-level authority.
		var systemPart = ctx;
		var userPart   = '';

		if ( history.length ) {
			userPart += 'Recent conversation:\n';
			history.forEach( function ( msg ) {
				var role = msg.role === 'assistant' ? 'Assistant' : 'User';
				var content = String( msg.content || '' );
				if ( content.length > MAX_HISTORY_CONTENT_CHARS ) {
					content = content.slice( 0, MAX_HISTORY_CONTENT_CHARS ) + '...[truncated]';
				}
				userPart += role + ': ' + content + '\n';
				var atts = normaliseAttachments( msg.attachments );
				if ( atts.length ) {
					var paths = atts.filter( function ( a ) { return a.relPath; } ).map( function ( a ) {
						return a.relPath;
					} );
					if ( paths.length ) {
						userPart += '  (attached images: ' + paths.join( ', ' ) + ')\n';
					}
				}
			} );
			userPart += '\n';
		}

		// When attachments are present, real image parts are added to the messages
		// array by runAgent — no placeholder text needed in the prompt body.
		if ( !attachments.length && imageCount > 0 ) {
			userPart += '(User attached ' + imageCount + ' image(s) in this message.)\n\n';
		}

		userPart += 'User request: ' + prompt + '\n';
		return { system: systemPart, user: userPart, scope: scope, intent: pageIntent };
	}

	/**
	 * Convert literal JSON escape sequences (e.g. the two-character sequence
	 * backslash-n) into their real counterparts.  This is needed because some
	 * AI models double-encode their tool-call arguments, so what should be a
	 * real newline arrives as the two characters \ and n.
	 *
	 * @param {string} str
	 * @returns {string}
	 */
	function sanitizeCode( str ) {
		if ( typeof str !== 'string' ) { return str; }
		return str
			.replace( /\\n/g,  '\n' )
			.replace( /\\t/g,  '\t' )
			.replace( /\\r/g,  '\r' )
			.replace( /\\"/g,  '"'  )
			.replace( /\\'/g,  "'"  )
			.replace( /\\\\/g, '\\' );
	}

	/**
	 * Run an editor tool via uiChemyComposerWidget bridge (no WebSocket / sidecar).
	 *
	 * @param {string} name
	 * @param {object} args
	 * @param {object} bridge window.uiChemyComposerWidget
	 * @returns {Promise<string>}
	 */
	function callEditorTool( name, args, bridge ) {
		if ( ! bridge ) {
			return Promise.reject( new Error( 'Editor bridge not available.' ) );
		}

		return new Promise( function ( resolve, reject ) {
			try {
			switch ( name ) {
				case 'get_widget_code': {
					var wid    = args && typeof args.widgetId === 'string' && args.widgetId ? args.widgetId : '';
					var flds   = Array.isArray( args && args.fields ) ? args.fields.filter( function( f ) { return f === 'html' || f === 'css' || f === 'js'; } ) : [];
					var fields = flds.length ? flds : [ 'html', 'css', 'js' ];
					var out    = {};
					if ( wid ) {
						if ( fields.indexOf( 'html' ) !== -1 ) { out.html = ( typeof bridge.getWidgetHtml === 'function' ? bridge.getWidgetHtml( wid ) : '' ) || ''; }
						if ( fields.indexOf( 'css'  ) !== -1 ) { out.css  = ( typeof bridge.getWidgetCss  === 'function' ? bridge.getWidgetCss( wid )  : '' ) || ''; }
						if ( fields.indexOf( 'js'   ) !== -1 ) { out.js   = ( typeof bridge.getWidgetJs   === 'function' ? bridge.getWidgetJs( wid )   : '' ) || ''; }
					} else {
						if ( fields.indexOf( 'html' ) !== -1 ) { out.html = ( typeof bridge.getHtmlCode === 'function' ? bridge.getHtmlCode() : '' ) || ''; }
						if ( fields.indexOf( 'css'  ) !== -1 ) { out.css  = ( typeof bridge.getCssCode  === 'function' ? bridge.getCssCode()  : '' ) || ''; }
						if ( fields.indexOf( 'js'   ) !== -1 ) { out.js   = ( typeof bridge.getJsCode   === 'function' ? bridge.getJsCode()   : '' ) || ''; }
					}
					resolve( JSON.stringify( out, null, 2 ) );
					break;
				}
				case 'apply_widget_code': {
					var wid    = args && typeof args.widgetId === 'string' && args.widgetId ? args.widgetId : '';
					var hasHtml = typeof args.html === 'string';
					var hasCss  = typeof args.css  === 'string';
					var hasJs   = typeof args.js   === 'string';
					if ( ! hasHtml && ! hasCss && ! hasJs ) {
						reject( new Error( 'apply_widget_code needs at least one of: html, css, js.' ) );
						return;
					}
					var applied = [];
					if ( wid ) {
						if ( hasHtml ) { if ( typeof bridge.applyWidgetHtml  === 'function' ) { bridge.applyWidgetHtml( wid, sanitizeCode( args.html ) ); }  applied.push( 'html' ); }
						if ( hasCss  ) { if ( typeof bridge.appendWidgetCss  === 'function' ) { bridge.appendWidgetCss( wid, sanitizeCode( args.css ) ); }   applied.push( 'css' ); }
						if ( hasJs   ) { if ( typeof bridge.applyWidgetJs    === 'function' ) { bridge.applyWidgetJs( wid, sanitizeCode( args.js ) ); }      applied.push( 'js' ); }
						resolve( 'Widget ' + wid + ' updated (' + applied.join( ', ' ) + '). The Elementor preview has been updated.' );
					} else {
						if ( hasHtml ) { if ( typeof bridge.applyHtmlCode      === 'function' ) { bridge.applyHtmlCode( sanitizeCode( args.html ) ); }          applied.push( 'html' ); }
						if ( hasCss  ) { if ( typeof bridge.appendAndApplyCss  === 'function' ) { bridge.appendAndApplyCss( sanitizeCode( args.css ) ); }        applied.push( 'css' ); }
						if ( hasJs   ) { if ( typeof bridge.applyJsCode        === 'function' ) { bridge.applyJsCode( sanitizeCode( args.js ) ); }               applied.push( 'js' ); }
						resolve( 'Widget code applied (' + applied.join( ', ' ) + '). The Elementor preview has been updated.' );
					}
					break;
				}
				case 'get_selected_element': {
					var info = typeof bridge.getChatPickInfo === 'function' ? bridge.getChatPickInfo() : null;
					resolve(
						info
							? JSON.stringify( info, null, 2 )
							: 'No element selected. Ask the user to use Pick element in the chat bar.'
					);
					break;
				}

				// ── Page-scope tools ──────────────────────────────────────
				case 'list_page_widgets': {
					var widgets = typeof bridge.getPageWidgets === 'function' ? bridge.getPageWidgets() : [];
					resolve(
						widgets.length
							? JSON.stringify( widgets, null, 2 )
							: 'No UiChemy Composer widgets found on this page.'
					);
					break;
				}
					case 'insert_widget_after': {
						if ( ! args.html ) { reject( new Error( 'Missing required argument: html' ) ); return; }
						if ( typeof bridge.insertWidget !== 'function' ) {
							reject( new Error( 'Editor bridge does not support insertWidget. Reload the editor and try again.' ) );
							return;
						}
						var result = bridge.insertWidget(
							args.after_widget_id || null,
							sanitizeCode( args.html || '' ),
							sanitizeCode( args.css  || '' ),
							sanitizeCode( args.js   || '' ),
							args.label || ''
						);
						if ( result && result.success && result.widgetId ) {
							resolve(
								'New widget created successfully (id=' + result.widgetId +
								', label="' + ( result.label || 'New Section' ) + '", position=' + result.position + '). ' +
								'The Elementor preview has been updated. STOP — do not call apply_widget_code on existing widgets.'
							);
						} else {
							reject( new Error( ( result && result.error ) || 'Failed to insert widget.' ) );
						}
						break;
					}

					// ── Elementor globals tools ─────────────────────────────────
					case 'get_globals': {
						Promise.resolve(
							typeof bridge.getGlobalsSnapshot === 'function' ? bridge.getGlobalsSnapshot() : null
						).then( function ( snap ) {
							resolve( JSON.stringify( snap || null ) );
						} ).catch( function ( e ) {
							resolve( JSON.stringify( { present: false, error: e && e.message } ) );
						} );
						return;
					}
					case 'sync_globals': {
						if ( typeof bridge.syncGlobals !== 'function' ) {
							reject( new Error( 'Editor bridge does not support syncGlobals. Reload the editor and try again.' ) );
							return;
						}
						var ops = {
							colors:          Array.isArray( args.colors )     ? args.colors     : [],
							typography:      Array.isArray( args.typography ) ? args.typography : [],
							container_width: args.container_width || undefined,
						};
						if ( ! ops.colors.length && ! ops.typography.length && ! ops.container_width ) {
							reject( new Error( 'sync_globals needs at least one operation in colors / typography / container_width.' ) );
							return;
						}
						Promise.resolve( bridge.syncGlobals( ops ) ).then( function ( out ) {
							resolve( JSON.stringify( out || null ) );
						} ).catch( function ( e ) {
							reject( e instanceof Error ? e : new Error( String( e ) ) );
						} );
						break;
					}
					// ── Page code tools ────────────────────────────────────────
					case 'get_page_code': {
						var pageCode = typeof bridge.getPageCode === 'function' ? bridge.getPageCode() : { head: '', body: '' };
						resolve( JSON.stringify( pageCode ) );
						break;
					}
					case 'set_page_code': {
						if ( typeof bridge.setPageCode !== 'function' ) {
							reject( new Error( 'Editor bridge does not support setPageCode. Reload the editor and try again.' ) );
							return;
						}
						var pageHead = typeof args.head === 'string' ? args.head : null;
						var pageBody = typeof args.body === 'string' ? args.body : null;
						if ( pageHead === null && pageBody === null ) {
							reject( new Error( 'set_page_code requires at least one of: head, body.' ) );
							return;
						}
						var pageResult = bridge.setPageCode( { head: pageHead, body: pageBody } );
						resolve( JSON.stringify( pageResult || null ) );
						break;
					}

					// ── Site code tools ────────────────────────────────────────
					case 'get_site_code': {
						Promise.resolve(
							typeof bridge.getSiteCode === 'function' ? bridge.getSiteCode() : null
						).then( function ( out ) {
							resolve( JSON.stringify( out || { head: '', body: '' } ) );
						} ).catch( function ( e ) {
							resolve( JSON.stringify( { head: '', body: '', error: e && e.message } ) );
						} );
						return;
					}
					case 'set_site_code': {
						if ( typeof bridge.setSiteCode !== 'function' ) {
							reject( new Error( 'Editor bridge does not support setSiteCode. Reload the editor and try again.' ) );
							return;
						}
						var siteHead = typeof args.head === 'string' ? args.head : null;
						var siteBody = typeof args.body === 'string' ? args.body : null;
						if ( siteHead === null && siteBody === null ) {
							reject( new Error( 'set_site_code requires at least one of: head, body.' ) );
							return;
						}
						// If only one field is supplied, fetch current and merge.
						Promise.resolve( bridge.getSiteCode() ).then( function ( current ) {
							var payload = {
								head: siteHead !== null ? siteHead : ( current && current.head ) || '',
								body: siteBody !== null ? siteBody : ( current && current.body ) || '',
							};
							return bridge.setSiteCode( payload );
						} ).then( function ( out ) {
							resolve( JSON.stringify( out || null ) );
						} ).catch( function ( e ) {
							reject( e instanceof Error ? e : new Error( String( e ) ) );
						} );
						return;
					}

					default:
						reject( new Error( 'Unknown tool: ' + name ) );
				}
			} catch ( e ) {
				reject( e );
			}
		} );
	}

	/**
	 * Check WordPress AI is reachable (models endpoint).
	 *
	 * @param {object} wpAgent
	 * @returns {Promise<boolean>}
	 */
	function checkAvailable( wpAgent ) {
		if ( ! wpAgent || ! wpAgent.aiSupported || ! wpAgent.modelsUrl ) {
			return Promise.resolve( false );
		}
		return fetch( wpAgent.modelsUrl, {
			headers: buildAuthHeaders( wpAgent ),
			credentials: 'same-origin',
		} )
			.then( function ( r ) { return r.ok; } )
			.catch( function () { return false; } );
	}

	/**
	 * Run the full agent loop in the browser.
	 *
	 * @param {object} opts
	 * @returns {Promise<string>}
	 */
	function runAgent( opts ) {
		var wpAgent   = opts.wpAgent || {};
		var bridge    = opts.bridge || window.uiChemyComposerWidget;
		var model     = opts.model || '';
		var onProgress = opts.onProgress || null;
		var signal    = opts.signal || null;
		var turnUrl   = wpAgent.turnUrl || '';

		if ( ! turnUrl ) {
			return Promise.reject( new Error( 'WordPress agent URL is not configured.' ) );
		}
		if ( ! wpAgent.restNonce && ! wpAgent.token ) {
			return Promise.reject( new Error( 'Missing authentication for WordPress AI.' ) );
		}

		var built = buildPrompt( {
			prompt:           opts.prompt,
			selectedSelector: opts.selectedSelector,
			history:          opts.history,
			sessionId:        opts.sessionId,
			imageCount:       opts.imageCount || 0,
			attachments:      opts.attachments || [],
			uploadsBaseUrl:   opts.uploadsBaseUrl || '',
			scope:            opts.scope || 'widget',
		} );

		var systemPrompt = built.system || '';
		var userMessage  = built.user   || '';

		// Diagnostic: surface what's actually being sent so we can verify the
		// fix in the browser console when the user reports issues.
		try {
			console.log( '[WP agent] system prompt length:', systemPrompt.length, 'chars' );
			console.log( '[WP agent] intent:', built.intent || 'unknown' );
			if ( systemPrompt.indexOf( 'insert_widget_after' ) >= 0 ) {
				console.log( '[WP agent] ✓ system prompt mentions insert_widget_after' );
			}
		} catch ( _ ) {}

		// Build image file parts for the user message. PHP resolves the relPath
		// to an absolute disk path and passes it to WP AI Client as inline data.
		var fileParts = [];
		if ( Array.isArray( opts.attachments ) ) {
			opts.attachments.forEach( function ( att ) {
				if ( att && att.relPath ) {
					fileParts.push( { type: 'file', relPath: att.relPath, mimeType: att.mediaType || 'image/png' } );
				}
			} );
		}

		var messages = [
			{ role: 'user', parts: fileParts.concat( [ { type: 'text', text: userMessage } ] ) },
		];
		var filteredTools = filterToolsForScope( EDITOR_TOOLS, opts.scope || 'widget', built.intent || 'unknown' );
		var tools         = toToolDeclarations( filteredTools );
		var lastText     = '';
		var widgetLabels = {}; // populated after list_page_widgets; maps id → display name

		try {
			console.log( '[WP agent] scope:', opts.scope || 'widget', '| intent:', built.intent || 'unknown' );
			console.log( '[WP agent] tools sent (' + tools.length + '): ' + tools.map( function ( t ) { return t.name; } ).join( ', ' ) );
		} catch ( _ ) {}

		/**
		 * Normalize MCP tool names from various providers to short ids.
		 * @param {string} raw
		 * @returns {string}
		 */
		function normalizeToolName( raw ) {
			var s = String( raw || '' ).trim();
			var m = s.match( /^(?:mcp__uichemy-editor__|mcp_uichemy-editor_|uichemy-editor_)?([\w]+)$/ );
			return m ? m[ 1 ] : s;
		}

		/**
		 * Return a human-readable progress label for a tool call.
		 * For widget-specific tools, substitutes the widget's display name.
		 *
		 * @param {string} name     Tool name.
		 * @param {object} args     Normalised tool arguments.
		 * @returns {string}
		 */
		function getDynamicLabel( name, args ) {
			name = normalizeToolName( name );
			var wid = args && args.widgetId;
			if ( wid ) {
				var lbl = widgetLabels[ wid ] || ( 'widget ' + String( wid ).slice( 0, 6 ) );
				if ( name === 'get_widget_code' )   return 'Reading “' + lbl + '” code…';
				if ( name === 'apply_widget_code' ) return 'Updating “' + lbl + '” code…';
			}
			return TOOL_LABELS[ name ] || ( 'Running ' + name + '...' );
		}

		function runLoop( iteration ) {
			if ( iteration >= MAX_ITERATIONS ) {
				return Promise.resolve( lastText || 'Stopped after too many tool steps.' );
			}
			if ( signal && signal.aborted ) {
				return Promise.reject( Object.assign( new Error( 'Aborted' ), { name: 'AbortError' } ) );
			}

			return postTurn( turnUrl, wpAgent, {
				system:   systemPrompt,
				messages: messages,
				tools:    tools,
				model:    model,
			}, signal ).then( function ( body ) {
				var turnText  = typeof body.text === 'string' ? body.text : '';
				var toolCalls = Array.isArray( body.tool_calls ) ? body.tool_calls : [];

				if ( turnText ) {
					lastText = turnText;
				}

				if ( ! toolCalls.length ) {
					return turnText || lastText || '(no response)';
				}

				if ( turnText && onProgress ) {
					onProgress( { eventType: 'text', message: turnText } );
				}

				var modelParts = [];
				if ( turnText ) {
					modelParts.push( { type: 'text', text: turnText } );
				}
				toolCalls.forEach( function ( tc ) {
					modelParts.push( {
						type: 'function_call',
						id:   tc.id || null,
						name: tc.name || '',
						args: tc.args != null ? tc.args : null,
					} );
				} );
				messages.push( { role: 'model', parts: modelParts } );

				var responseParts = [];
				var chain         = Promise.resolve();

				toolCalls.forEach( function ( tc ) {
					chain = chain.then( function () {
						var name     = tc.name || '';
						var callArgs = normaliseArgs( tc.args );

						if ( onProgress ) {
							var label = getDynamicLabel( name, callArgs );
							onProgress( { eventType: 'tool', message: label, tool: name } );
						}

						return callEditorTool( name, callArgs, bridge )
							.then( function ( responseText ) {
								var raw = typeof responseText === 'string' ? responseText : JSON.stringify( responseText );

							// Cache widget ID → label map after list_page_widgets so that
							// subsequent get_widget_code / apply_widget_code progress labels can
							// show the widget's human-readable name instead of a generic string.
								if ( name === 'list_page_widgets' ) {
									try {
										var parsed = JSON.parse( raw );
										if ( Array.isArray( parsed ) ) {
											parsed.forEach( function ( w ) {
												if ( w.id ) {
													widgetLabels[ w.id ] = w.label || w.id;
												}
											} );
										}
									} catch ( _ ) {}
								}

								responseParts.push( {
									type:     'function_response',
									id:       tc.id || null,
									name:     name,
									response: truncateForModel( raw, name ),
								} );
							} )
							.catch( function ( e ) {
								responseParts.push( {
									type:     'function_response',
									id:       tc.id || null,
									name:     name,
									response: 'Error running ' + name + ': ' + e.message,
								} );
							} );
					} );
				} );

				return chain.then( function () {
					messages.push( { role: 'user', parts: responseParts } );
					// Signal that all tool results are in — AI is now generating the
					// next response. This lets the UI flip the last tool step to done
					// and show "Generating code…" instead of leaving it spinning.
					if ( onProgress ) {
						onProgress( { eventType: 'text', message: 'Generating…' } );
					}
					return runLoop( iteration + 1 );
				} );
			} );
		}

		return runLoop( 0 );
	}

	/** Legacy localStorage key (migrated to WordPress DB on first load). */
	var HISTORY_PREFIX = 'uich_wp_chat_';

	function normaliseAttachments( attachments ) {
		if ( Array.isArray( attachments ) ) {
			return attachments;
		}
		if ( typeof attachments === 'string' && attachments ) {
			try {
				var parsed = JSON.parse( attachments );
				return Array.isArray( parsed ) ? parsed : [];
			} catch ( _ ) {
				return [];
			}
		}
		return [];
	}

	function readLocalHistory( widgetId ) {
		try {
			var raw = localStorage.getItem( HISTORY_PREFIX + widgetId );
			if ( raw ) {
				return JSON.parse( raw );
			}
		} catch ( _ ) {}
		return null;
	}

	function clearLocalHistory( widgetId ) {
		try {
			localStorage.removeItem( HISTORY_PREFIX + widgetId );
		} catch ( _ ) {}
	}

	/**
	 * One-time import from localStorage into WordPress DB.
	 *
	 * @param {string} widgetId
	 * @param {object} wpAgent
	 * @returns {Promise<void>}
	 */
	function migrateLocalStorageIfNeeded( widgetId, wpAgent ) {
		if ( ! widgetId || ! wpAgent || ! wpAgent.importUrl ) {
			return Promise.resolve();
		}
		var local = readLocalHistory( widgetId );
		if ( ! local || ! Array.isArray( local.messages ) || ! local.messages.length ) {
			return Promise.resolve();
		}
		return fetch( wpAgent.importUrl, {
			method:      'POST',
			headers:     buildAuthHeaders( wpAgent ),
			body:        JSON.stringify( { widgetId: widgetId, data: local } ),
			credentials: 'same-origin',
		} )
			.then( function ( res ) { return res.json(); } )
			.then( function ( body ) {
				if ( body && body.success && body.imported > 0 ) {
					clearLocalHistory( widgetId );
				}
			} )
			.catch( function () {} );
	}

	/**
	 * Load chat history from WordPress database.
	 *
	 * @param {string} widgetId
	 * @param {object} wpAgent
	 * @returns {Promise<{messages:Array,provider:string,model:string,uploadsBaseUrl:string}>}
	 */
	function loadHistory( widgetId, wpAgent ) {
		wpAgent = wpAgent || {};
		if ( ! widgetId ) {
			return Promise.resolve( { messages: [], provider: 'wp', model: '', uploadsBaseUrl: wpAgent.uploadsBaseUrl || '' } );
		}
		if ( ! wpAgent.historyUrl ) {
			return Promise.resolve( { messages: [], provider: 'wp', model: '', uploadsBaseUrl: wpAgent.uploadsBaseUrl || '' } );
		}

		return migrateLocalStorageIfNeeded( widgetId, wpAgent ).then( function () {
			var url = wpAgent.historyUrl + ( wpAgent.historyUrl.indexOf( '?' ) >= 0 ? '&' : '?' ) + 'widgetId=' + encodeURIComponent( widgetId );
			return fetch( url, {
				headers:     buildAuthHeaders( wpAgent ),
				credentials: 'same-origin',
			} )
				.then( function ( res ) { return res.json(); } )
				.then( function ( data ) {
					if ( data && data.uploadsBaseUrl ) {
						wpAgent.uploadsBaseUrl = data.uploadsBaseUrl;
					}
					return {
						messages:       Array.isArray( data && data.messages ) ? data.messages : [],
						provider:       ( data && data.provider ) || 'wp',
						model:          ( data && data.model ) || '',
						uploadsBaseUrl: ( data && data.uploadsBaseUrl ) || wpAgent.uploadsBaseUrl || '',
					};
				} )
				.catch( function () {
					return { messages: [], provider: 'wp', model: '', uploadsBaseUrl: wpAgent.uploadsBaseUrl || '' };
				} );
		} );
	}

	/**
	 * Upload chat images to wp-content/uploads/protuno/chat/{widgetId}/.
	 *
	 * @param {string} widgetId
	 * @param {Array}  images   { data, mediaType, name }
	 * @param {object} wpAgent
	 * @returns {Promise<Array>}
	 */
	function uploadImages( widgetId, images, wpAgent ) {
		if ( ! images || ! images.length || ! wpAgent || ! wpAgent.uploadUrl ) {
			return Promise.resolve( [] );
		}
		return fetch( wpAgent.uploadUrl, {
			method:      'POST',
			headers:     buildAuthHeaders( wpAgent ),
			body:        JSON.stringify( { widgetId: widgetId, images: images } ),
			credentials: 'same-origin',
		} )
			.then( function ( res ) { return res.json(); } )
			.then( function ( body ) {
				if ( body && body.uploadsBaseUrl ) {
					wpAgent.uploadsBaseUrl = body.uploadsBaseUrl;
				}
				return Array.isArray( body && body.attachments ) ? body.attachments : [];
			} )
			.catch( function () { return []; } );
	}

	/**
	 * Append one message to the WordPress DB thread.
	 *
	 * @param {string} widgetId
	 * @param {object} wpAgent
	 * @param {object} payload  Message fields + meta.
	 * @returns {Promise<void>}
	 */
	function saveMessage( widgetId, wpAgent, payload ) {
		if ( ! widgetId || ! wpAgent || ! wpAgent.messageUrl ) {
			return Promise.resolve();
		}
		var body = Object.assign( { widgetId: widgetId }, payload || {} );
		return fetch( wpAgent.messageUrl, {
			method:      'POST',
			headers:     buildAuthHeaders( wpAgent ),
			body:        JSON.stringify( body ),
			credentials: 'same-origin',
		} )
			.then( function () {} )
			.catch( function () {} );
	}

	/**
	 * @param {string} widgetId
	 * @param {string} provider
	 * @param {string} model
	 * @param {object} message
	 * @param {object} wpAgent
	 * @param {object} meta      { postId, pageTitle }
	 * @returns {Promise<void>}
	 */
	function appendHistoryMessage( widgetId, provider, model, message, wpAgent, meta ) {
		meta = meta || {};
		return saveMessage( widgetId, wpAgent, {
			role:             message.role,
			content:          message.content || '',
			provider:         provider || 'wp',
			model:            model || '',
			selectedSelector: message.selectedSelector || '',
			attachments:      normaliseAttachments( message.attachments ),
			toolCalls:        Array.isArray( message.toolCalls ) ? message.toolCalls : [],
			postId:           meta.postId || 0,
			pageTitle:        meta.pageTitle || '',
		} );
	}

	/**
	 * Save model preference (global + per-thread via next message).
	 *
	 * @param {string} modelId
	 * @param {object} wpAgent
	 * @param {string} [provider]  anthropic | openai | google | opencode | wp
	 * @returns {Promise<void>}
	 */
	function saveModelPreference( modelId, wpAgent, provider ) {
		if ( ! wpAgent || ! wpAgent.modelUrl ) {
			return Promise.resolve();
		}
		provider = provider || 'wp';
		return fetch( wpAgent.modelUrl, {
			method:      'POST',
			headers:     buildAuthHeaders( wpAgent ),
			body:        JSON.stringify( { provider: provider, model: modelId || '' } ),
			credentials: 'same-origin',
		} )
			.then( function () {} )
			.catch( function () {} );
	}

	window.UichWpAgent = {
		EDITOR_TOOLS:         EDITOR_TOOLS,
		TOOL_LABELS:          TOOL_LABELS,
		buildPrompt:          buildPrompt,
		callEditorTool:       callEditorTool,
		checkAvailable:       checkAvailable,
		runAgent:             runAgent,
		loadHistory:          loadHistory,
		uploadImages:         uploadImages,
		saveMessage:          saveMessage,
		appendHistoryMessage: appendHistoryMessage,
		saveModelPreference:  saveModelPreference,
		normaliseAttachments: normaliseAttachments,
	};
} )();
