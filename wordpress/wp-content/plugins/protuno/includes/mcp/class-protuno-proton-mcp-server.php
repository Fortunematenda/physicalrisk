<?php
/**
 * Composer MCP Server for Protuno
 *
 * Exposes the Proton pipeline tools to MCP clients through the
 * official WordPress MCP Adapter (wordpress/mcp-adapter). Registered at
 * /wp-json/protuno/v1/mcp. Tools are callable-backed McpTool
 * instances so the exact client-facing tool names are preserved.
 *
 * @link       https://posimyth.com/
 * @since      1.0.0
 *
 * @package    Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Proton_MCP_Server' ) ) {

	/**
	 * Registers the Proton MCP server on the MCP Adapter and maps
	 * each tool to a handler that runs the Proton pipeline logic.
	 */
	class Protuno_Proton_MCP_Server {

		// ============================================================
		// CONSTANTS
		// ============================================================

		const SERVER_ID          = 'uichemy-composer-mcp';
		const SERVER_NAME        = 'Proton';
		const SERVER_VERSION     = '1.0.0';
		const SERVER_DESCRIPTION = 'Proton MCP — convert Figma designs to HTML/CSS, manage Elementor globals, and build full WordPress sites using the Proton pipeline.';
		const REST_NAMESPACE     = 'protuno/v1';
		const REST_ROUTE         = 'mcp';
		const PIPELINE_DIR       = PROTUNO_PATH . 'includes/mcp/pipeline/';

		// ============================================================
		// INITIALIZATION
		// ============================================================

		public static function init() {
			add_action( 'mcp_adapter_init', array( __CLASS__, 'register_mcp_server' ) );
			// Auto-mint an MCP session for the Figma plugin relay (see ensure_relay_session).
			add_filter( 'rest_pre_dispatch', array( __CLASS__, 'ensure_relay_session' ), 10, 3 );
		}

		/**
		 * Auto-create and inject an MCP session for composer-mcp requests that arrive
		 * without one.
		 *
		 * The MCP HTTP transport (wordpress/mcp-adapter) requires a valid `Mcp-Session-Id`
		 * header on every non-initialize call, and only returns that id in the `initialize`
		 * RESPONSE header. The Protuno Figma plugin relays these calls through Figma's
		 * main-thread fetch, which strips custom response headers — so the plugin can never
		 * read the session id and every tools/call would fail with
		 * "Missing Mcp-Session-Id header" (HTTP 400).
		 *
		 * To bridge that, when an authenticated request hits our composer-mcp route WITHOUT
		 * a session header, we mint a real session for the current user (stored in user_meta,
		 * the same store the adapter's validator reads) and inject it into the request so
		 * validate_session() passes. Standard MCP clients that manage their own sessions send
		 * the header themselves and are left untouched.
		 *
		 * @param mixed            $result  Dispatch short-circuit value (passed through unchanged).
		 * @param \WP_REST_Server  $server  The REST server instance.
		 * @param \WP_REST_Request $request The request object.
		 * @return mixed The unchanged $result.
		 */
		public static function ensure_relay_session( $result, $server, $request ) {
			if ( ! $request instanceof \WP_REST_Request ) {
				return $result;
			}

			// Only our composer-mcp route.
			if ( false === strpos( (string) $request->get_route(), '/' . self::REST_NAMESPACE . '/' . self::REST_ROUTE ) ) {
				return $result;
			}

			// A real MCP client already supplied a session — leave it alone.
			if ( $request->get_header( 'Mcp-Session-Id' ) ) {
				return $result;
			}

			// Need an authenticated user to own the session; if none, let the normal
			// auth/permission flow reject the request.
			$user_id = get_current_user_id();
			if ( ! $user_id ) {
				return $result;
			}

			$session_manager = '\Protuno\Deps\WP\MCP\Transport\Infrastructure\SessionManager';
			if ( ! class_exists( $session_manager ) ) {
				return $result;
			}

			$session_id = $session_manager::create_session( $user_id );
			if ( is_string( $session_id ) && '' !== $session_id ) {
				$request->set_header( 'Mcp-Session-Id', $session_id );
			}

			return $result;
		}

		/**
		 * Register this server and its tools with the MCP Adapter.
		 *
		 * @param \Protuno\Deps\WP\MCP\Core\McpAdapter $adapter The MCP Adapter instance.
		 */
		public static function register_mcp_server( $adapter ) {
			if ( ! $adapter instanceof \Protuno\Deps\WP\MCP\Core\McpAdapter ) {
				return;
			}

			$adapter->create_server(
				self::SERVER_ID,
				self::REST_NAMESPACE,
				self::REST_ROUTE,
				self::SERVER_NAME,
				self::SERVER_DESCRIPTION,
				self::SERVER_VERSION,
				array( \Protuno\Deps\WP\MCP\Transport\HttpTransport::class ),
				\Protuno\Deps\WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler::class,
				\Protuno\Deps\WP\MCP\Infrastructure\Observability\NullMcpObservabilityHandler::class,
				self::build_tools(),
				array(),
				array(),
				array( __CLASS__, 'check_permission' )
			);
		}

		/**
		 * Tool name → handler callable map. Shared by build_tools() (Proton's
		 * own /protuno/v1/mcp endpoint) and get_tool_definitions() (so the same
		 * tools can be exposed through UiChemy's endpoint via the
		 * `uichemy_mcp_tools` filter).
		 *
		 * @return array<string, callable>
		 */
		private static function tool_handlers() {
			return array(
				'uichemy_composer_convert'              => array( __CLASS__, 'execute_uichemy_composer_convert' ),
				'check_config'                          => array( __CLASS__, 'execute_check_config' ),
				'ensure_nav_menu'                       => array( __CLASS__, 'execute_ensure_nav_menu' ),
				'set_site_branding'                     => array( __CLASS__, 'execute_set_site_branding' ),
				'get_globals'                           => array( __CLASS__, 'execute_get_globals' ),
				'sync_globals'                          => array( __CLASS__, 'execute_sync_globals' ),
				'get_atomic_globals'                    => array( __CLASS__, 'execute_get_atomic_globals' ),
				'sync_atomic_globals'                   => array( __CLASS__, 'execute_sync_atomic_globals' ),
				'create_uichemy_composer_page'          => array( __CLASS__, 'execute_create_uichemy_composer_page' ),
				'add_uichemy_composer_section'          => array( __CLASS__, 'execute_add_uichemy_composer_section' ),
				'create_uichemy_composer_header_footer' => array( __CLASS__, 'execute_create_uichemy_composer_header_footer' ),
				'create_single_post_widget'             => array( __CLASS__, 'execute_create_single_post_widget' ),
				'set_page_site_code'                    => array( __CLASS__, 'execute_set_page_site_code' ),
				'list_pages'                            => array( __CLASS__, 'execute_list_pages' ),
				'list_templates'                        => array( __CLASS__, 'execute_list_templates' ),
				'get_post_structure'                    => array( __CLASS__, 'execute_get_post_structure' ),
				'get_set_section_code'                  => array( __CLASS__, 'execute_get_set_section_code' ),
				'insert_section_at_index'               => array( __CLASS__, 'execute_insert_section_at_index' ),
				'request_image_upload'                  => array( __CLASS__, 'execute_request_image_upload' ),
				'start_site_build'                      => array( __CLASS__, 'execute_start_site_build' ),
			);
		}

		/**
		 * Plain tool definitions (spec + handler callable) for cross-plugin
		 * exposure. UiChemy collects these via the `uichemy_mcp_tools` filter
		 * and wraps each in its OWN scoped McpTool — so we only ever hand over
		 * data + callables, never adapter objects (Strauss-safe).
		 *
		 * @return array<int, array{name:string, description:string, inputSchema:array, handler:callable}>
		 */
		public static function get_tool_definitions() {
			$handlers = self::tool_handlers();
			$defs     = array();

			foreach ( self::tool_specs() as $spec ) {
				if ( empty( $spec['name'] ) || ! isset( $handlers[ $spec['name'] ] ) ) {
					continue;
				}
				$defs[] = array(
					'name'        => $spec['name'],
					'description' => isset( $spec['description'] ) ? $spec['description'] : '',
					'inputSchema' => isset( $spec['inputSchema'] ) ? $spec['inputSchema'] : array( 'type' => 'object' ),
					'handler'     => $handlers[ $spec['name'] ],
				);
			}

			return $defs;
		}

		/**
		 * Build the McpTool instances from tool specs + handlers.
		 *
		 * @return array<\Protuno\Deps\WP\MCP\Domain\Tools\McpTool>
		 */
		private static function build_tools() {
			if ( ! method_exists( '\Protuno\Deps\WP\MCP\Domain\Tools\McpTool', 'fromArray' ) ) {
				return array();
			}

			$handlers = self::tool_handlers();

			$tools = array();

			foreach ( self::tool_specs() as $spec ) {
				if ( empty( $spec['name'] ) || ! isset( $handlers[ $spec['name'] ] ) ) {
					continue;
				}

				$input_schema = $spec['inputSchema'];

				// The MCP schema DTO requires "properties" to be an array map.
				// No-argument tools declare it as an empty object (stdClass); drop
				// the key so the input schema is simply { "type": "object" }.
				if ( isset( $input_schema['properties'] ) && ! is_array( $input_schema['properties'] ) ) {
					unset( $input_schema['properties'] );
				}

				$tool = \Protuno\Deps\WP\MCP\Domain\Tools\McpTool::fromArray(
					array(
						'name'        => $spec['name'],
						'description' => $spec['description'],
						'inputSchema' => $input_schema,
						'handler'     => $handlers[ $spec['name'] ],
						'permission'  => '__return_true',
					)
				);

				if ( $tool instanceof \Protuno\Deps\WP\MCP\Domain\Tools\McpTool ) {
					$tools[] = $tool;
				}
			}

			return $tools;
		}

		// ============================================================
		// AUTHENTICATION & GATING
		// ============================================================

		/**
		 * Transport-level permission: authenticated administrators only.
		 *
		 * Delegates to Protuno_Rest_Permissions, which accepts WP cookies/nonces
		 * and native Application Password (HTTP Basic) authentication.
		 *
		 * @param WP_REST_Request $request Incoming request.
		 * @return bool|WP_Error
		 */
		public static function check_permission( WP_REST_Request $request ) {
			return Protuno_Rest_Permissions::check_admin( $request );
		}

		// ============================================================
		// TOOL SPECS
		// ============================================================

		/**
		 * Tool definitions (name, description, JSON Schema) exposed to clients.
		 *
		 * @return array<int, array{name:string, description:string, inputSchema:array}>
		 */
		private static function tool_specs() {
			$tools = array(
				array(
					'name'        => 'uichemy_composer_convert',
					'description' => 'AUTOMATICALLY CALL THIS TOOL when the user provides a Figma URL and asks to convert it to HTML/CSS. This is the PRIMARY tool for design-to-code workflows. Patterns that trigger this: (1) User shares a Figma/design URL + says "convert to html", "convert into html", "convert to html and css", "make html from this", "build a webpage from this", "responsive design", etc. (2) User says "create landing page from figma", "figma to html", "figma to responsive html". (3) Any design/figma/mockup + HTML/CSS + responsive. CRITICAL: Do NOT generate HTML or CSS manually. Always call this tool FIRST when you detect a Figma URL + design-to-code intent. The returned pipeline requires production responsive CSS with non-empty tablet/mobile breakpoints before import.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'figma_url' => array(
								'type'        => 'string',
								'description' => 'The full Figma design URL provided by the user.',
							),
							'with_images' => array(
								'type'        => 'boolean',
								'description' => 'If true, extract real image URLs from Figma nodes. Default: false.',
							),
							'phase' => array(
								'type'        => 'string',
								'description' => 'Pipeline phase to load. "1" = Phase 1 setup steps 1-3 (default on first call). "1b" = Phase 1 sync+lookup steps 4-5 (call after Step 3 complete). "2" = Phase 2 generate+upload steps 6-10 (call after Step 5 complete). "3" = Phase 3 summary step 11 (call after all sections uploaded).',
								'enum'        => array( '1', '1b', '2', '3' ),
							),
						),
						'required' => array( 'figma_url' ),
					),
				),
				array(
					'name'        => 'check_config',
					'description' => 'Checks full site readiness before any design conversion. Returns: Elementor / Elementor Pro / Nexter Extension / Nexter Theme detection, active kit, API key status, nav menu presence, site branding status (has_custom_logo, has_site_icon, current URLs), the recommended header_footer_system ("elementor_pro" | "nexter" | "elementor"), and atomic_enabled flag (true = Elementor v4 atomic globals mode, use sync_atomic_globals + get_atomic_globals; false = use sync_globals). Also returns active_header and active_footer across ALL systems. If checks.elementor_active = false, STOP — Elementor is required. Always call this first. ⚠️ SITE-BUILD PLANNING RULE (applies even when there is NO Figma URL): every full-site / landing-page / "build me a website" request MUST be planned as Header → body sections → Footer. Header and Footer are NEVER optional — include them by default unless the user explicitly says "no header" or "no footer". After check_config returns, your first announcement to the user must list a section plan that starts with "1. Header" and ends with "N. Footer". ⚠️ HEADER/FOOTER ROUTING (read header_footer_system from the response): (A) "elementor_pro" or "nexter" → use create_uichemy_composer_header_footer(type:"header"|"footer") — those systems activate the template across the site automatically. (B) "elementor" (plain Elementor, no Pro, no Nexter) → DO NOT call create_uichemy_composer_header_footer; it would create an INACTIVE elementor_library template that QA has to manually activate. Instead, EMBED the Header as the first section inside create_uichemy_composer_page, and the Footer as the last section appended via add_uichemy_composer_section. This is the inline-fallback path — header/footer live as normal page widgets so they render immediately on the published page without any theme-builder setup.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => new stdClass(),
						'required'   => array(),
					),
				),
				array(
					'name'        => 'ensure_nav_menu',
					'description' => 'Check whether a WordPress navigation menu exists. If none exists, automatically creates a "Main Menu", adds existing published pages to it, and assigns it to all registered theme menu location slots. Call this during PHASE 1 when check_config returns has_nav_menu = false — a header with <uichemy-nav-menu> will render an empty nav without a menu assigned.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'menu_name' => array(
								'type'        => 'string',
								'description' => 'Name for the new menu if creation is needed (default: "Main Menu").',
							),
						),
						'required'   => array(),
					),
				),
				array(
					'name'        => 'set_site_branding',
					'description' => 'Set the WordPress site logo and/or site icon from image URLs extracted from the Figma design. Sideloads the image into the media library (reuses existing if already uploaded), then sets it as the WordPress custom_logo (set_theme_mod) and/or site_icon (wp option). Only applies when the corresponding item is not already set, unless force = true. Call this during PHASE 1 when check_config reports has_custom_logo = false or has_site_icon = false and the design has a logo/icon asset in the header.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'logo_url' => array(
								'type'        => 'string',
								'description' => 'URL of the logo image to set as WordPress custom logo. Sideloaded into the media library. Skipped if a logo is already set unless force = true.',
							),
							'logo_width' => array(
								'type'        => 'integer',
								'description' => 'Intended display width (px) of the logo, from the source design. Optional — when provided with logo_height, stored on the attachment so the logo renders at the design\'s intended size (also required for SVG logos, since WordPress cannot read intrinsic SVG dimensions on its own).',
							),
							'logo_height' => array(
								'type'        => 'integer',
								'description' => 'Intended display height (px) of the logo, from the source design. Optional — see logo_width.',
							),
							'icon_url' => array(
								'type'        => 'string',
								'description' => 'URL of the site icon / favicon image. Square PNG or WebP recommended, at least 192×192px. Skipped if a site icon is already set unless force = true.',
							),
							'force' => array(
								'type'        => 'boolean',
								'description' => 'If true, replace an existing logo/icon even if one is already set. Default false.',
							),
						),
						'required'   => array(),
					),
				),
				array(
					'name'        => 'get_globals',
					'description' => 'Fetch all global design tokens from the active Elementor kit: colors (system + custom), typography (system + custom), container widths, and an atomic_enabled flag. Use ONLY when check_config returns atomic_enabled=false. If atomic_enabled=true, call get_atomic_globals instead — do NOT call get_globals in atomic mode.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => new stdClass(),
						'required'   => array(),
					),
				),
				array(
					'name'        => 'sync_globals',
					'description' => 'Sync colors and typography to WordPress Elementor globals. Use ONLY when get_globals returns atomic_enabled=false. For Elementor v4 atomic mode (atomic_enabled=true), use sync_atomic_globals instead. Applies changes immediately to the active Elementor kit. Use get_globals first to compare existing values, then build the sync payload with actions (ADD for new items, SET for updates, DEL for removals). For ADD actions, generate a random 7-character hex id (e.g. "a1b2c3d"). IMPORTANT for typography: every typography value object MUST include "typography_typography" set to "custom". Every size/unit object (typography_font_size, typography_line_height, typography_letter_spacing) MUST include a "sizes" key set to empty array [].',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'colors' => array(
								'type'        => 'array',
								'description' => 'Array of color sync operations.',
								'items'       => array(
									'type'       => 'object',
									'properties' => array(
										'action' => array(
											'type' => 'string',
											'enum' => array( 'ADD', 'SET', 'DEL' ),
											'description' => 'ADD for new colors, SET to update existing, DEL to remove.',
										),
										'value'  => array(
											'type'       => 'object',
											'properties' => array(
												'id'    => array( 'type' => 'string', 'description' => 'Color id. For ADD: random 7-char hex. For SET/DEL: existing id from get_globals.' ),
												'title' => array( 'type' => 'string', 'description' => 'Human-readable color name.' ),
												'value' => array( 'type' => 'string', 'description' => 'Hex color value e.g. "#FF5733". Required for ADD/SET.' ),
											),
											'required' => array( 'id' ),
										),
									),
									'required' => array( 'action', 'value' ),
								),
							),
							'typography' => array(
								'type'        => 'array',
								'description' => 'Array of typography sync operations.',
								'items'       => array(
									'type'       => 'object',
									'properties' => array(
										'action' => array(
											'type' => 'string',
											'enum' => array( 'ADD', 'SET', 'DEL' ),
										),
										'value'  => array(
											'type'       => 'object',
											'properties' => array(
												'id'    => array( 'type' => 'string' ),
												'title' => array( 'type' => 'string' ),
												'value' => array(
													'type'       => 'object',
													'properties' => array(
														'typography_typography'    => array( 'type' => 'string', 'enum' => array( 'custom' ) ),
														'typography_font_family'   => array( 'type' => 'string' ),
														'typography_font_weight'   => array( 'type' => 'string' ),
														'typography_font_style'    => array( 'type' => 'string' ),
														'typography_font_size'     => array( 'type' => 'object', 'properties' => array( 'size' => array( 'type' => 'number' ), 'unit' => array( 'type' => 'string' ), 'sizes' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ), 'required' => array( 'size', 'unit', 'sizes' ) ),
														'typography_line_height'   => array( 'type' => 'object', 'properties' => array( 'size' => array( 'type' => 'number' ), 'unit' => array( 'type' => 'string' ), 'sizes' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ), 'required' => array( 'size', 'unit', 'sizes' ) ),
														'typography_letter_spacing'=> array( 'type' => 'object', 'properties' => array( 'size' => array( 'type' => 'number' ), 'unit' => array( 'type' => 'string' ), 'sizes' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ), 'required' => array( 'size', 'unit', 'sizes' ) ),
													),
													'required' => array( 'typography_typography', 'typography_font_family', 'typography_font_weight', 'typography_font_size' ),
												),
											),
											'required' => array( 'id' ),
										),
									),
									'required' => array( 'action', 'value' ),
								),
							),
							'container_width' => array(
								'type'       => 'object',
								'properties' => array(
									'desktop' => array( 'type' => 'object', 'properties' => array( 'unit' => array( 'type' => 'string', 'enum' => array( 'px', '%' ) ), 'size' => array( 'type' => 'number' ), 'sizes' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ) ),
								),
							),
						),
						'required' => array( 'colors', 'typography', 'container_width' ),
					),
				),
				array(
					'name'        => 'get_atomic_globals',
					'description' => 'Fetch all Elementor v4 atomic global tokens: color variables (_elementor_global_variables), typography classes, width class, padding, border, gap, and shadow classes. Use ONLY when check_config returns atomic_enabled=true. Returns the full atomic globals snapshot needed to build colorLookup and typoLookup for atomic mode generation.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => new stdClass(),
						'required'   => array(),
					),
				),
				array(
					'name'        => 'sync_atomic_globals',
					'description' => 'Sync design tokens to Elementor v4 atomic globals. Use ONLY when check_config returns atomic_enabled=true. Wraps color variables and global typography classes. container_width uses the same format as sync_globals — server converts internally. Returns updated globals after sync.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'data' => array(
								'type'        => 'object',
								'description' => 'Sync payload for colors and typography.',
								'properties'  => array(
									'color' => array(
										'type'  => 'array',
										'items' => array(
											'type'       => 'object',
											'properties' => array(
												'action' => array( 'type' => 'string', 'enum' => array( 'ADD', 'SET', 'DEL' ) ),
												'type'   => array( 'type' => 'string', 'enum' => array( 'global-color-variable' ) ),
												'id'     => array( 'type' => 'string' ),
												'label'  => array( 'type' => 'string' ),
												'value'  => array( 'type' => 'string' ),
											),
											'required' => array( 'action', 'type', 'id', 'label' ),
										),
									),
									'typography' => array(
										'type'  => 'array',
										'items' => array(
											'type'       => 'object',
											'properties' => array(
												'action' => array( 'type' => 'string', 'enum' => array( 'ADD', 'SET', 'DEL' ) ),
												'id'     => array( 'type' => 'string' ),
												'label'  => array( 'type' => 'string' ),
												'value'  => array( 'type' => 'object', 'properties' => array( 'desktop' => array( 'type' => 'object' ), 'tablet' => array( 'type' => 'object' ), 'mobile' => array( 'type' => 'object' ) ) ),
											),
											'required' => array( 'action', 'id', 'label', 'value' ),
										),
									),
								),
							),
							'container_width' => array(
								'type'       => 'object',
								'properties' => array(
									'desktop' => array( 'type' => 'object', 'properties' => array( 'unit' => array( 'type' => 'string', 'enum' => array( 'px', '%' ) ), 'size' => array( 'type' => 'number' ), 'sizes' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ) ),
									'tablet'  => array( 'type' => 'object', 'properties' => array( 'unit' => array( 'type' => 'string', 'enum' => array( 'px', '%' ) ), 'size' => array( 'type' => 'number' ), 'sizes' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ) ),
									'mobile'  => array( 'type' => 'object', 'properties' => array( 'unit' => array( 'type' => 'string', 'enum' => array( 'px', '%' ) ), 'size' => array( 'type' => 'number' ), 'sizes' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ) ),
								),
							),
						),
						'required' => array( 'data' ),
					),
				),
				array(
					'name'        => 'create_uichemy_composer_page',
					'description' => 'Create a WordPress page with a Proton widget pre-filled with generated HTML/CSS/JS body content. Before save, matches literals to the active Elementor kit (colors → var(--e-global-color-*), typography → .text-{id} classes on HTML). Response may include dynamic_globals_matches. Use as section 1 in incremental multi-section imports or standalone single-widget pages. Build order depends on header_footer_system from check_config. CASE A — header_footer_system="elementor_pro" or "nexter" (theme-builder works): (1) create_uichemy_composer_header_footer(type:"header"), (2) create_uichemy_composer_page for the first body section, (3) add_uichemy_composer_section for each subsequent body section, (4) create_uichemy_composer_header_footer(type:"footer"). In this case do NOT put header/footer markup inside create_uichemy_composer_page — those go to the theme-builder tool. CASE B — header_footer_system="elementor" (plain Elementor only, no Pro, no Nexter — inline-fallback mode): (1) create_uichemy_composer_page for the HEADER section — pass title=<page title>, label="Header", html/css containing the site header markup (nav, logo, CTA). (2) add_uichemy_composer_section for every body section (Hero, Features, etc.). (3) add_uichemy_composer_section for the FOOTER section. Header and Footer become normal page widgets that render immediately when the page publishes — no theme-builder activation required. Choose CASE A vs CASE B strictly by header_footer_system; do not guess.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'title'            => array( 'type' => 'string', 'description' => 'Optional page title. Defaults to "Protuno AI Landing Page".' ),
							'status'           => array( 'type' => 'string', 'enum' => array( 'draft', 'publish', 'private' ), 'description' => 'Optional post status. Defaults to draft.' ),
							'source'           => array( 'type' => 'string', 'description' => 'Optional source label used in code tags (default: mcp).' ),
							'label'            => array( 'type' => 'string', 'description' => 'Optional human-friendly label included in tags.' ),
							'html'             => array( 'type' => 'string', 'description' => 'Generated HTML to seed in the Proton widget.' ),
							'css'              => array( 'type' => 'string', 'description' => 'Generated responsive CSS. Must include real tablet and mobile rules.' ),
							'js'               => array( 'type' => 'string', 'description' => 'Generated JavaScript to seed in the Proton widget.' ),
							'page_before_head' => array( 'type' => 'string', 'description' => 'Code injected inside <head> on this page only.' ),
							'page_before_body' => array( 'type' => 'string', 'description' => 'Code injected before </body> on this page only.' ),
							'site_before_head' => array( 'type' => 'string', 'description' => 'Code injected inside <head> on every page of the site. Duplicate <link href> URLs are not stored twice.' ),
							'site_before_body' => array( 'type' => 'string', 'description' => 'Code injected before </body> on every page of the site. Content is deduplicated.' ),
							'upload_images'    => array( 'type' => 'boolean', 'description' => 'When true, sideload all <img> URLs from the HTML into the WordPress media library. Defaults to true.' ),
						),
						'required' => array(),
					),
				),
				array(
					'name'        => 'add_uichemy_composer_section',
					'description' => 'Append ONE Proton widget to an existing page (sections 2+ after create_uichemy_composer_page). Default multi-section flow: incremental imports on the same post_id. Runs kit matching on the new section before save. If page_before_head/page_before_body are passed, they merge into the first Proton widget on the page (single copy). Duplicate site_before_head <link href> URLs are skipped. Image uploads default to true.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'post_id'          => array( 'type' => 'integer', 'description' => 'Post ID of the existing page returned by create_uichemy_composer_page.' ),
							'label'            => array( 'type' => 'string', 'description' => 'Human-friendly section label shown in the Elementor navigator.' ),
							'html'             => array( 'type' => 'string', 'description' => 'HTML for this section only.' ),
							'css'              => array( 'type' => 'string', 'description' => 'Responsive CSS for this section only. Must include tablet and mobile blocks.' ),
							'js'               => array( 'type' => 'string', 'description' => 'Optional JS for this section only.' ),
							'page_before_head' => array( 'type' => 'string', 'description' => 'Optional page-level code for <head> on this page only. Merges into the first widget.' ),
							'page_before_body' => array( 'type' => 'string', 'description' => 'Optional page-level code before </body> on this page only. Merges into the first widget.' ),
							'site_before_head' => array( 'type' => 'string', 'description' => 'Optional site-wide head markup. Duplicate <link href> URLs are skipped.' ),
							'site_before_body' => array( 'type' => 'string', 'description' => 'Optional code injected before </body> on every page site-wide. Deduplicated.' ),
							'source'           => array( 'type' => 'string', 'description' => 'Optional source label (default: mcp).' ),
							'upload_images'    => array( 'type' => 'boolean', 'description' => 'When true, sideload <img> URLs into the WordPress media library. Defaults to true.' ),
						),
						'required' => array( 'post_id', 'label', 'html' ),
					),
				),
				array(
					'name'        => 'create_uichemy_composer_header_footer',
					'description' => 'Create a Theme Builder header or footer template seeded with a Proton widget. ⚠️ PRECONDITION — only call this when check_config returned header_footer_system = "elementor_pro" OR "nexter". When the value is "elementor" (plain Elementor, no Pro, no Nexter), DO NOT call this tool — it will create an INACTIVE elementor_library template that requires manual Theme Builder activation, which QA / end-users will not do. In that case, fall back to inline sections: embed the Header as the first section of create_uichemy_composer_page, and the Footer as the last section appended via add_uichemy_composer_section. Behaviour when this tool IS called: Elementor Pro → creates an elementor_library template with theme builder conditions ACTIVE on the entire site. Nexter Extension → creates a nxt_builder post ACTIVE on the entire site. Plain Elementor (only if you intentionally bypass this preconcondition) → elementor_library post INACTIVE; user must manually assign an "Entire Site" display condition under Templates → Theme Builder. Response includes "system" ("elementor_pro" | "nexter" | "elementor") and "active" (true | false) so the caller can confirm which path was taken.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'type'          => array( 'type' => 'string', 'enum' => array( 'header', 'footer' ), 'description' => 'Template type: "header" or "footer".' ),
							'title'         => array( 'type' => 'string', 'description' => 'Title of the template shown in Theme Builder.' ),
							'label'         => array( 'type' => 'string', 'description' => 'Human-friendly section label shown in the Elementor navigator.' ),
							'html'          => array( 'type' => 'string', 'description' => 'HTML for this template. Use <uichemy-nav-menu> tag for navigation.' ),
							'css'           => array( 'type' => 'string', 'description' => 'Scoped responsive CSS for this template.' ),
							'js'            => array( 'type' => 'string', 'description' => 'Optional JS for this template.' ),
							'site_css'      => array( 'type' => 'string', 'description' => 'Optional site-wide head markup (Google Fonts <link> tags). Pass on the first upload only.' ),
							'site_js'       => array( 'type' => 'string', 'description' => 'Optional site-wide JS injected before </body>.' ),
							'source'        => array( 'type' => 'string', 'description' => 'Optional source label (default: mcp).' ),
							'upload_images' => array( 'type' => 'boolean', 'description' => 'When true, sideload <img> URLs into the WordPress media library. Defaults to true.' ),
						),
						'required' => array( 'type', 'label', 'html' ),
					),
				),
				array(
					'name'        => 'create_single_post_widget',
					'description' => 'Create a WordPress single post theme-builder template seeded with a Proton widget. USE THIS TOOL only when: (1) AI detects the Figma design looks like a blog/article/single-post layout, AND (2) check_config confirms Elementor Pro OR Nexter Extension is active, AND (3) the user has explicitly confirmed they want a single post template. The tool automatically uses: Elementor Pro → elementor_library "single" template; Nexter → nxt_builder "singular" template; Neither → system=none (fall back to create_uichemy_composer_page). CRITICAL HTML RULES: NO header, NO footer, NO site logo, NO navigation. The body MUST use <uichemy-post-content />.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'title'               => array( 'type' => 'string', 'description' => 'Template title shown in Theme Builder. Defaults to "Single Post — Protuno".' ),
							'post_type'           => array( 'type' => 'string', 'description' => 'WordPress post type slug to target (default: "post").' ),
							'label'               => array( 'type' => 'string', 'description' => 'Human-friendly section label.' ),
							'source'              => array( 'type' => 'string', 'description' => 'Optional source label (default: mcp).' ),
							'html'                => array( 'type' => 'string', 'description' => 'Generated HTML for the article body ONLY. MUST include <uichemy-post-content />.' ),
							'css'                 => array( 'type' => 'string', 'description' => 'Responsive CSS. Must include non-empty tablet and mobile @media blocks.' ),
							'js'                  => array( 'type' => 'string', 'description' => 'Optional JavaScript.' ),
							'site_before_head'    => array( 'type' => 'string', 'description' => 'Code injected inside <head> on every page site-wide. Duplicate <link href> URLs are skipped.' ),
							'site_before_body'    => array( 'type' => 'string', 'description' => 'Code injected before </body> on every page site-wide. Deduplicated.' ),
							'upload_images'       => array( 'type' => 'boolean', 'description' => 'When true, sideload <img> URLs from the HTML into the WordPress media library. Defaults to true.' ),
							'force_deactivate'    => array( 'type' => 'boolean', 'description' => 'Default false. Set to true ONLY after the user has explicitly approved replacing an existing template.' ),
							'create_sample_post'  => array( 'type' => 'boolean', 'description' => 'When true AND sample_post_title is provided, creates a real WordPress post for preview.' ),
							'sample_post_title'   => array( 'type' => 'string', 'description' => 'Title for the sample post. Required when create_sample_post=true.' ),
							'sample_post_content' => array( 'type' => 'string', 'description' => 'Body content for the sample post. Used when create_sample_post=true.' ),
						),
						'required' => array(),
					),
				),
				array(
					'name'        => 'set_page_site_code',
					'description' => 'Set or update site-wide and page-level head/body code for an existing WordPress page. site_before_head and site_before_body apply to every page on the site; page_before_head and page_before_body apply to this page only. Duplicate <link href> URLs in site_before_head are automatically skipped.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'post_id'          => array( 'type' => 'integer', 'description' => 'Post ID of the existing page.' ),
							'site_before_head' => array( 'type' => 'string', 'description' => 'Code injected inside <head> on every page of the site.' ),
							'site_before_body' => array( 'type' => 'string', 'description' => 'Code injected before </body> on every page of the site.' ),
							'page_before_head' => array( 'type' => 'string', 'description' => 'Code injected inside <head> on this page only.' ),
							'page_before_body' => array( 'type' => 'string', 'description' => 'Code injected before </body> on this page only.' ),
						),
						'required' => array( 'post_id' ),
					),
				),
				array(
					'name'        => 'list_pages',
					'description' => 'List WordPress pages (or any post type) with their IDs, titles, statuses, and edit/preview URLs. Useful for finding a post_id before inspecting or editing a page.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'post_type' => array( 'type' => 'string', 'description' => 'Post type to list. Use "page" (default), "post", "elementor_library", or "nxt_builder".' ),
							'status'    => array( 'type' => 'string', 'enum' => array( 'any', 'publish', 'draft', 'private' ), 'description' => 'Filter by post status. Default: "any".' ),
							'per_page'  => array( 'type' => 'integer', 'description' => 'Max results to return (default: 20, max: 100).' ),
						),
						'required' => array(),
					),
				),
				array(
					'name'        => 'list_templates',
					'description' => 'List all Elementor Theme Builder templates (headers, footers, singles, etc.) from both elementor_library and nxt_builder post types. Returns template type, active status, and conditions so you know which templates are live on the site.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'type'     => array( 'type' => 'string', 'description' => 'Filter by template type: "header", "footer", "single", "page", or "all" (default: "all").' ),
							'per_page' => array( 'type' => 'integer', 'description' => 'Max results to return (default: 50).' ),
						),
						'required' => array(),
					),
				),
				array(
					'name'        => 'get_post_structure',
					'description' => 'Get a summary of the Elementor widget tree for a post or page — sections, their elType/id, and the list of contained widgets (widgetType + label). Use this to inspect the layout before editing a section or to find the correct widget_index for get_set_section_code.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'post_id' => array( 'type' => 'integer', 'description' => 'ID of the WordPress post/page to inspect.' ),
						),
						'required' => array( 'post_id' ),
					),
				),
				array(
					'name'        => 'get_set_section_code',
					'description' => 'Get or set the HTML/CSS/JS of a specific Proton widget on a page. Use action="get" to read the current code of a widget (identified by its 0-based widget_index among all Proton widgets). Use action="set" to replace its HTML/CSS/JS — runs globals matching and image upload the same way as add_uichemy_composer_section.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'post_id'      => array( 'type' => 'integer', 'description' => 'Post/page ID.' ),
							'action'       => array( 'type' => 'string', 'enum' => array( 'get', 'set' ), 'description' => '"get" to read current code, "set" to update it.' ),
							'widget_index' => array( 'type' => 'integer', 'description' => '0-based index among all Proton widgets on the page (default: 0).' ),
							'html'         => array( 'type' => 'string', 'description' => 'New HTML content — required for action="set".' ),
							'css'          => array( 'type' => 'string', 'description' => 'New CSS — required for action="set".' ),
							'js'           => array( 'type' => 'string', 'description' => 'New JavaScript — optional for action="set".' ),
							'upload_images'=> array( 'type' => 'boolean', 'description' => 'When true (default), sideload <img> URLs into the media library during action="set".' ),
						),
						'required' => array( 'post_id', 'action' ),
					),
				),
				array(
					'name'        => 'insert_section_at_index',
					'description' => 'Insert a new Proton widget at a specific 0-based position (insert_index) within a page\'s Elementor layout. Use insert_index=0 to prepend before all existing sections, or any positive integer to place it after that position. Unlike add_uichemy_composer_section (always appends), this gives precise control over section order. Runs globals matching and image upload just like add_uichemy_composer_section.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'post_id'       => array( 'type' => 'integer', 'description' => 'Post/page ID to insert the section into.' ),
							'insert_index'  => array( 'type' => 'integer', 'description' => '0-based insert position. 0 = before all existing sections.' ),
							'label'         => array( 'type' => 'string', 'description' => 'Human-friendly section label.' ),
							'html'          => array( 'type' => 'string', 'description' => 'HTML for this section.' ),
							'css'           => array( 'type' => 'string', 'description' => 'Responsive CSS for this section.' ),
							'js'            => array( 'type' => 'string', 'description' => 'Optional JavaScript for this section.' ),
							'source'        => array( 'type' => 'string', 'description' => 'Optional source label (default: mcp).' ),
							'upload_images' => array( 'type' => 'boolean', 'description' => 'When true (default), sideload <img> URLs into the WordPress media library.' ),
						),
						'required' => array( 'post_id', 'insert_index', 'label', 'html' ),
					),
				),
				array(
					'name'        => 'start_site_build',
					'description' => 'AUTOMATICALLY CALL this tool when the user asks for a website / landing page / homepage / template / section WITHOUT sharing a Figma or design URL. Returns the full Protuno direct-prompt pipeline (Header → body → Footer planning, naming, image-upload flow, container rules, build order, verification). Patterns that trigger this — match on the SHAPE of the request, not exact words: (1) "make X site/landing/page/design", "build me a Y website", "create a Z homepage/template", (2) "<noun> + service/product/feature design", e.g. "make docker service design", "saas product landing", "fintech app homepage", (3) "design a A for B", "I need a C page", "redesign my D", "spin up a E section", (4) any topic noun + page/site/landing/design/template keyword, however casual. Examples that MUST trigger: "make docker service design", "build a saas landing for my analytics tool", "create a coffee shop website", "I need a portfolio site", "design a pricing page for my plugin", "homepage for ai company". Examples that do NOT trigger: explicit Figma URLs (use uichemy_composer_convert), pure Q&A about WordPress, edits to existing posts. CRITICAL: do NOT start writing HTML/CSS/JS in chat. Call this tool FIRST — the returned markdown is your blueprint and you MUST follow it for the rest of the conversation (Header is section 1, Footer is the last section, image uploads go through request_image_upload, naming is real, container is already zeroed). Do NOT ask the user clarifying questions before calling — the pipeline itself contains the rules for inferring brand, style, and section plan from a one-line brief.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'brief'    => array(
								'type'        => 'string',
								'description' => 'The user\'s request verbatim or lightly paraphrased, e.g. "make docker service design", "build me a saas landing for analytics". Required.',
							),
							'industry' => array(
								'type'        => 'string',
								'description' => 'Optional industry/topic hint you have already inferred (saas, ecommerce, portfolio, agency, restaurant, etc.).',
							),
							'brand'    => array(
								'type'        => 'string',
								'description' => 'Optional brand name you have already picked. If omitted, the pipeline tells you how to infer one from the brief.',
							),
						),
						'required' => array( 'brief' ),
					),
				),
				array(
					'name'        => 'request_image_upload',
					'description' => 'Issue a one-time, short-lived upload slot so you can inject a LOCALLY-AVAILABLE image (AI-generated, screenshot, file on disk) into the WordPress media library and get back a real public URL. USE THIS whenever you are about to send HTML that references an image you do not already have a public https URL for. The other Composer tools (create_uichemy_composer_page / add_uichemy_composer_section / set_site_branding) sideload from <img src="…"> only — they cannot read data: URIs, blob: URIs, local paths, or any URL you cannot already fetch over HTTPS. Workflow: (1) call this tool with filename + mime → response includes { upload_url, upload_token, curl_example, expires_in }. (2) Use your bash tool to execute the curl_example (or PUT raw bytes yourself with the X-Protuno-Upload-Token header). (3) Read the upload response — it returns { url, attachment_id } — and paste THAT url into your HTML <img src>. Slots are single-use and expire after a few minutes; request a fresh one per image.',
					'inputSchema' => array(
						'type'       => 'object',
						'properties' => array(
							'filename'    => array(
								'type'        => 'string',
								'description' => 'Filename including extension, e.g. "hero-bg.png". Becomes the media library title. Required.',
							),
							'mime'        => array(
								'type'        => 'string',
								'description' => 'Image MIME type. Allowed: image/png, image/jpeg, image/webp, image/gif, image/svg+xml. Optional — inferred from the filename extension if omitted.',
								'enum'        => array( 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml' ),
							),
							'ttl_minutes' => array(
								'type'        => 'integer',
								'description' => 'How long the slot stays valid. Clamped to 1–10. Defaults to 10.',
								'minimum'     => 1,
								'maximum'     => 10,
							),
						),
						'required' => array( 'filename' ),
					),
				),
			);

			return $tools;
		}

		// ============================================================
		// TOOL EXECUTORS
		//
		// Each returns raw data on success, or a WP_Error on failure. The
		// uichemy_composer_convert tool returns an MCP "resource" content block
		// so its markdown pipeline reaches the client unescaped.
		// ============================================================

		public static function execute_uichemy_composer_convert( $arguments ) {
			$arguments   = is_array( $arguments ) ? $arguments : array();
			$figma_url   = isset( $arguments['figma_url'] ) ? (string) $arguments['figma_url'] : '';
			$phase       = isset( $arguments['phase'] ) ? (string) $arguments['phase'] : '1';

			if ( '' === trim( $figma_url ) ) {
				return new WP_Error( 'uich_mcp_error', 'Missing required parameter: figma_url' );
			}

			// Phase 1b loads the sync/lookup doc — that whole step is disabled
			// while globals sync is off, so we map 1b to an empty file list and
			// short-circuit below with a "skip" instruction. Toggle back on by
			// restoring '1b' => array( '04-phase1-sync-lookup.md' ).
			$phase_files = array(
				'1'  => array( '01-overview.md', '02-phase1-structure.md', '03-phase1-tokens.md' ),
				'1b' => array(),
				'2'  => array( '05-phase2-generate.md', '06-phase2-upload.md' ),
				'3'  => array( '07-phase3-appendix.md' ),
			);

			// Phase 1b short-circuit while globals sync is disabled.
			if ( '1b' === $phase ) {
				return array(
					'type'     => 'resource',
					'uri'      => 'uichemy://composer/pipeline/phase-1b',
					'mimeType' => 'text/markdown',
					'text'     => "## ⛔ PHASE 1b — SKIPPED (globals sync disabled)\n\n"
						. "Globals sync is temporarily turned off for this build, so the Phase 1b sync+lookup step is a no-op.\n\n"
						. "Do NOT call `get_globals` / `get_atomic_globals` / `sync_globals` / `sync_atomic_globals`. Treat `colorLookup` and `typoLookup` as empty `{}` and proceed straight to Phase 2.\n\n"
						. "Next step: `uichemy_composer_convert(figma_url, phase=\"2\")`.\n",
				);
			}

			if ( ! isset( $phase_files[ $phase ] ) ) {
				return new WP_Error( 'uich_mcp_error', 'Invalid phase "' . $phase . '". Valid values: 1, 1b, 2, 3' );
			}

			$pipeline_dir = self::PIPELINE_DIR;
			$file_names   = $phase_files[ $phase ];
			$parts        = array();

			foreach ( $file_names as $name ) {
				$path = $pipeline_dir . $name;
				if ( ! is_readable( $path ) ) {
					continue;
				}
				$chunk = file_get_contents( $path );
				if ( is_string( $chunk ) && '' !== trim( $chunk ) ) {
					$parts[] = $chunk;
				}
			}

			if ( empty( $parts ) ) {
				return new WP_Error( 'uich_mcp_error', 'Pipeline phase "' . $phase . '" files not found or empty. Expected: ' . implode( ', ', $file_names ) );
			}

			$pipeline = str_replace( '{{FIGMA_URL}}', $figma_url, implode( "\n\n", $parts ) );

			return array(
				'type'     => 'resource',
				'uri'      => 'uichemy://composer/pipeline/phase-' . $phase,
				'mimeType' => 'text/markdown',
				'text'     => self::get_pipeline_enforce_block( $phase ) . $pipeline,
			);
		}

		/**
		 * Server-injected banner that disables the globals-sync workflow.
		 * Prepended to every phase output so AI overrides any colorLookup /
		 * typoLookup / var()-only / matched-typography rules in the embedded
		 * markdown. Toggle by deleting this method body — the rest of the
		 * pipeline goes back to using globals.
		 */
		private static function get_globals_disabled_banner() {
			return <<<MD
## ⛔ GLOBALS SYNC TEMPORARILY DISABLED — READ FIRST (server-injected)

This build runs with globals sync turned OFF. The following OVERRIDES every rule below that mentions `colorLookup`, `typoLookup`, `var(--e-global-color-*)`, matched `.text-{id}` classes, or `sync_globals` / `sync_atomic_globals`:

- DO NOT call `get_globals`, `get_atomic_globals`, `sync_globals`, or `sync_atomic_globals`. Skip Phase 1 Step 4 (sync decision) and Step 5 (build lookup tables) entirely.
- After Phase 1 Step 3 (token inventory) completes, JUMP DIRECTLY to `uichemy_composer_convert(figma_url, phase="2")`. Do NOT call `phase="1b"` — it is a no-op in this mode.
- Treat `colorLookup` and `typoLookup` as EMPTY (`{}`) for the entire pipeline. Verification rules that say "every hex that EXISTS in `colorLookup` must use `var()`" are vacuously satisfied — nothing exists in the lookup.
- CSS colors: write RAW hex on every property. Never emit `var(--e-global-color-*)`. `rgba()` with alpha<1 stays raw as before.
- CSS typography: write FULL `font-family`, `font-weight`, `font-size`, `line-height`, `letter-spacing` on every text element. Never attach a `.text-{id}` class. No element is "matched".
- Container widths: hardcode the desktop boxed wrapper at `max-width: 1280px` (or whatever the Figma frame's content width is) on the widget's inner `{block}__container`. Do NOT rely on `.elementor-global-boxed-width` / `.elementor-atomic-boxed-width` to supply it — those classes get their value from the kit, which we are not syncing.
- Google Fonts still need to be loaded via `site_before_head` on the first upload — that part of the flow is unchanged.

---

MD;
		}

		private static function get_pipeline_enforce_block( $phase ) {
			$disabled_banner = self::get_globals_disabled_banner();

			if ( '1' === $phase ) {
				return $disabled_banner . <<<MD
## ⚠️ PHASE 1 — READ FIRST (server-injected)

**⛔ TEMP FILE RULE — HARD STOP (read this first)**
When ANY tool result (get_globals, get_atomic_globals, get_variable_defs, get_design_context) is saved to a temp file path instead of returned inline — STOP. Do NOT touch the Bash tool. Note: Step 3 uses per-section parallel calls (not root) — each section with excludeScreenshot:true is typically small (~2,000 tokens) and fits inline.
- ❌ FORBIDDEN: `bash head file.txt`, `bash grep "#" file.txt`, `bash wc -l`, `bash awk`, `bash sed`, `bash python` — any shell command on the file
- ✅ ONLY ALLOWED: Read tool with `file_path`, `offset`, `limit`
- Why: Each bash command = 3,000–5,000 wasted tokens. 14 bash commands (a common failure) = ~50,000 tokens — more than the entire pipeline. Use Read tool only.

**Temp file extraction algorithm (follow exactly):**
1. Read tool: `{ file_path: "<temp path>", offset: 0, limit: 300 }`
2. From that chunk extract all hex colors, font-family+weight+size combos, image URLs, variable names
3. If file has more lines: Read tool again with `offset: 300, limit: 300` — repeat until done
4. Accumulate into `designTokenInventory`. Stop. Do not open a bash terminal.

**A — Token inventory gate (Step 3)**
Before Step 4: print one summary line → `✅ Inventory: N colors · M typography combos · X opacity values`. Stop at Step 3 if inventory not complete. Do NOT print raw JSON blocks or plain-text duplicates of tables — summary line only.

**B — Globals routing**
`check_config` returns `atomic_enabled`:
- `false` → get_globals · sync_globals · build lookup from sync response
- `true`  → get_atomic_globals · sync_atomic_globals · build lookup from sync response
Never call get_globals/get_atomic_globals again after sync. Use sync response directly.

**C — Phase gate (mandatory)**
After Steps 1–3 complete and designTokenInventory is stored → call `uichemy_composer_convert(figma_url, phase="1b")`. Do NOT call phase="2" before phase="1b" is processed and lookup tables are confirmed built.

---

MD;
			}

			if ( '2' === $phase ) {
				return $disabled_banner . <<<MD
## ⚠️ PHASE 2 — READ FIRST (server-injected)

**⛔ TEMP FILE RULE — HARD STOP (read this first)**
When get_screenshot or get_design_context saves result to a temp file — STOP. Do NOT use Bash tool.
- ❌ FORBIDDEN: bash head, grep, wc, awk, sed, python on the temp file — any shell command
- ✅ ONLY ALLOWED: Read tool with `file_path`, `offset`, `limit`
- Why: 14 bash commands (seen in real runs) = ~50,000 wasted tokens per section. With 5 sections that is 250,000 tokens wasted on file parsing alone.

**Temp file extraction algorithm (follow exactly, one pass only):**
1. Read tool: `{ file_path: "<temp path>", offset: 0, limit: 300 }`
2. Extract from that chunk: layout mode, padding/gap, ALL text nodes (content+font+size+weight), ALL hex colors, ALL image URLs, ALL component refs
3. More lines remaining? Read tool: `offset: 300, limit: 300` — continue until EOF
4. Store everything extracted into `currentSectionMemory`. Stop reading. Never re-read for a different extraction.

**Critical reminders from Phase 1 (still enforced):**
- Steps 6→9 are atomic per section — never pre-fetch next section while current is unsent
- Wipe `currentSectionMemory` after each successful Step 9
- Globals sync is OFF (see top banner): every text element gets full font properties; every color is raw hex; no `var(--e-global-color-*)`; no `.text-{id}` matched classes
- `site_before_head` / `site_css` → first upload only, never repeat

**Section flow**
After Step 6 (screenshot + design context): run Steps 7→8→9 in the same turn — generate → verify → upload before starting Step 6 of the next section.

**WordPress upload**
`create_uichemy_composer_page` / `add_uichemy_composer_section` run AI Data Sharing server-side. (Globals sync is off — no class/var() matching needed.)

---

MD;
			}

			// Other phases (1b, 3) get the disabled-globals banner only — no
			// extra phase-specific gates injected.
			return $disabled_banner;
		}

		public static function execute_check_config( $arguments = array() ) {
			$has_globals_class  = class_exists( 'Protuno_Globals' );
			$has_elementor      = class_exists( '\Elementor\Plugin' );
			$has_elementor_pro  = class_exists( '\ElementorPro\Plugin' ) || defined( 'ELEMENTOR_PRO_VERSION' );
			$has_nexter_ext     = post_type_exists( 'nxt_builder' );
			$kit_available      = false;
			$active_kit_id      = null;

			$active_theme     = wp_get_theme();
			$has_nexter_theme = (
				strtolower( (string) $active_theme->get( 'TextDomain' ) ) === 'nexter' ||
				strtolower( (string) $active_theme->get( 'Name' ) ) === 'nexter' ||
				strtolower( get_template() ) === 'nexter'
			);

			if ( $has_elementor ) {
				$kit = \Elementor\Plugin::$instance->kits_manager->get_active_kit_for_frontend();
				if ( $kit ) {
					$kit_available = true;
					$active_kit_id = $kit->get_id();
				}
			}

			$nav_menus      = wp_get_nav_menus();
			$has_nav_menu   = ! empty( $nav_menus );
			$nav_menu_names = array_values(
				array_map( function ( $m ) { return $m->name; }, $nav_menus )
			);

			if ( $has_elementor_pro ) {
				$header_footer_system = 'elementor_pro';
			} elseif ( $has_nexter_ext ) {
				$header_footer_system = 'nexter';
			} else {
				$header_footer_system = 'elementor';
			}

			$active_header = self::detect_active_header_footer_templates( 'header' );
			$active_footer = self::detect_active_header_footer_templates( 'footer' );

			$custom_logo_id  = absint( get_theme_mod( 'custom_logo', 0 ) );
			$has_custom_logo = $custom_logo_id > 0 && (bool) get_post( $custom_logo_id );
			$custom_logo_url = $has_custom_logo ? (string) wp_get_attachment_url( $custom_logo_id ) : null;

			$site_icon_id  = absint( get_option( 'site_icon', 0 ) );
			$has_site_icon = $site_icon_id > 0 && (bool) get_post( $site_icon_id );
			$site_icon_url = $has_site_icon ? get_site_icon_url( 192 ) : null;

			$experiments    = $has_elementor ? \Elementor\Plugin::$instance->experiments : null;
			$atomic_enabled = $has_elementor
				&& $experiments
				&& method_exists( $experiments, 'is_feature_active' )
				&& (bool) $experiments->is_feature_active( 'e_atomic_elements' );

			$is_ready = $has_globals_class && $has_elementor && $kit_available;

			return array(
				'ready'                => $is_ready,
				'header_footer_system' => $header_footer_system,
				'atomic_enabled'       => $atomic_enabled,
				'checks'               => array(
					'uichemy_globals_class' => $has_globals_class,
					'elementor_active'      => $has_elementor,
					'elementor_pro_active'  => $has_elementor_pro,
					'nexter_extension'      => $has_nexter_ext,
					'nexter_theme'          => $has_nexter_theme,
					'active_kit_found'      => $kit_available,
					'has_nav_menu'          => $has_nav_menu,
					'has_custom_logo'       => $has_custom_logo,
					'has_site_icon'         => $has_site_icon,
				),
				'nav_menus'            => $nav_menu_names,
				'active_header'        => $active_header,
				'active_footer'        => $active_footer,
				'branding'             => array(
					'custom_logo_id'  => $has_custom_logo ? $custom_logo_id : null,
					'custom_logo_url' => $custom_logo_url,
					'site_icon_id'    => $has_site_icon ? $site_icon_id : null,
					'site_icon_url'   => $site_icon_url,
				),
				'diagnostics'          => array(
					'active_kit_id'  => $active_kit_id,
					'wp_version'     => get_bloginfo( 'version' ),
					'php_version'    => phpversion(),
					'site_url'       => get_site_url(),
					'server'         => self::SERVER_ID,
					'server_version' => self::SERVER_VERSION,
				),
				'message'              => $is_ready
					? 'Configuration looks good. Sync tools are ready.'
					: 'Configuration issue detected. Check failed flags in "checks" before running sync.',
			);
		}

		private static function detect_active_header_footer_templates( $type ) {
			$active = array();

			// Cap well above any realistic template count so an active header/footer
			// is never missed past a low limit (the result drives the merge-conflict
			// warning — under-counting silently clobbers an existing header/footer).
			$ep_posts = get_posts( array(
				'post_type'      => 'elementor_library',
				'post_status'    => 'publish',
				'posts_per_page' => 50,
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_query'     => array(
					array( 'key' => '_elementor_template_type', 'value' => $type ),
				),
			) );
			foreach ( $ep_posts as $pid ) {
				$conditions = get_post_meta( (int) $pid, '_elementor_conditions', true );
				if ( ! empty( $conditions ) && is_array( $conditions ) ) {
					$active[] = array(
						'system'     => 'elementor_pro',
						'post_id'    => (int) $pid,
						'title'      => get_the_title( (int) $pid ),
						'conditions' => $conditions,
					);
				}
			}

			if ( post_type_exists( 'nxt_builder' ) ) {
				$nxt_posts = get_posts( array(
					'post_type'      => 'nxt_builder',
					'post_status'    => 'publish',
					'posts_per_page' => 50,
					'fields'         => 'ids',
					'no_found_rows'  => true,
					'meta_query'     => array(
						'relation' => 'AND',
						array( 'key' => 'nxt-hooks-layout-sections', 'value' => $type ),
						array( 'key' => 'nxt_build_status', 'value'   => '1' ),
					),
				) );
				foreach ( $nxt_posts as $pid ) {
					$active[] = array(
						'system'  => 'nexter',
						'post_id' => (int) $pid,
						'title'   => get_the_title( (int) $pid ),
					);
				}
			}

			return $active;
		}

		public static function execute_ensure_nav_menu( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$payload   = array(
				'menu_name' => isset( $arguments['menu_name'] ) ? sanitize_text_field( (string) $arguments['menu_name'] ) : 'Main Menu',
			);

			$result = Protuno_Proton_Manager::mcp_ensure_nav_menu( $payload );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return $result;
		}

		public static function execute_set_site_branding( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$payload   = array(
				'logo_url'    => isset( $arguments['logo_url'] ) ? (string) $arguments['logo_url'] : '',
				'logo_width'  => isset( $arguments['logo_width'] ) ? absint( $arguments['logo_width'] ) : 0,
				'logo_height' => isset( $arguments['logo_height'] ) ? absint( $arguments['logo_height'] ) : 0,
				'icon_url'    => isset( $arguments['icon_url'] ) ? (string) $arguments['icon_url'] : '',
				'force'       => isset( $arguments['force'] ) ? (bool) $arguments['force'] : false,
			);

			$result = Protuno_Proton_Manager::mcp_set_site_branding( $payload );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return $result;
		}

		public static function execute_get_globals( $arguments = array() ) {
			if ( ! class_exists( 'Protuno_Globals' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Protuno_Globals class not found. Ensure Protuno plugin is active.' );
			}

			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Elementor is not active. Global design tokens require Elementor.' );
			}

			if ( self::is_atomic_enabled() ) {
				return new WP_Error( 'uich_mcp_error', 'Atomic globals are ENABLED in Elementor. Use get_atomic_globals instead.' );
			}

			return Protuno_Globals::get_globals();
		}

		public static function execute_sync_globals( $arguments ) {
			if ( ! class_exists( 'Protuno_Globals' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Protuno_Globals class not found. Ensure Protuno plugin is active.' );
			}

			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Elementor is not active.' );
			}

			$arguments       = is_array( $arguments ) ? $arguments : array();
			$colors          = isset( $arguments['colors'] ) && is_array( $arguments['colors'] ) ? $arguments['colors'] : array();
			$typography      = isset( $arguments['typography'] ) && is_array( $arguments['typography'] ) ? $arguments['typography'] : array();
			$container_width = isset( $arguments['container_width'] ) ? $arguments['container_width'] : null;

			$sync_data = json_decode( wp_json_encode( $arguments ) );
			Protuno_Globals::sync_globals( $sync_data );

			if ( isset( $arguments['container_width'] ) ) {
				$cw_data = json_decode( wp_json_encode( $arguments['container_width'] ) );
				Protuno_Globals::set_container_breakpoints_width( $cw_data );
			}

			$color_adds = 0; $color_sets = 0; $color_dels = 0;
			foreach ( $colors as $c ) {
				$action = isset( $c['action'] ) ? $c['action'] : '';
				if ( 'ADD' === $action ) { $color_adds++; }
				if ( 'SET' === $action ) { $color_sets++; }
				if ( 'DEL' === $action ) { $color_dels++; }
			}

			$typo_adds = 0; $typo_sets = 0; $typo_dels = 0;
			foreach ( $typography as $t ) {
				$action = isset( $t['action'] ) ? $t['action'] : '';
				if ( 'ADD' === $action ) { $typo_adds++; }
				if ( 'SET' === $action ) { $typo_sets++; }
				if ( 'DEL' === $action ) { $typo_dels++; }
			}

			$container_msg = $container_width ? "\nContainer width: updated" : '';
			$summary       = sprintf(
				"Sync applied successfully.\n\nColors: %d added, %d updated, %d deleted\nTypography: %d added, %d updated, %d deleted%s\n\nThe Elementor kit globals have been updated and CSS cache has been cleared.",
				$color_adds, $color_sets, $color_dels,
				$typo_adds, $typo_sets, $typo_dels,
				$container_msg
			);

			return array(
				'summary' => $summary,
				'globals' => Protuno_Globals::get_globals(),
			);
		}

		public static function execute_get_atomic_globals( $arguments = array() ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Elementor is not active.' );
			}

			if ( ! class_exists( 'Protuno_Atomic_Globals' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Protuno_Atomic_Globals class not found.' );
			}

			if ( ! self::is_atomic_enabled() ) {
				return new WP_Error( 'uich_mcp_error', 'Atomic globals are DISABLED in Elementor.' );
			}

			$globals         = Protuno_Atomic_Globals::get_global_classes_and_variable();
			$container_width = array();

			if ( ! empty( $globals['width'] ) && is_array( $globals['width'] ) ) {
				foreach ( $globals['width'] as $breakpoint => $css_value ) {
					if ( 'id' === $breakpoint || ! is_string( $css_value ) ) {
						continue;
					}
					if ( preg_match( '/^(-?\d+(?:\.\d+)?)([a-z%]+)$/i', trim( $css_value ), $m ) ) {
						$container_width[ $breakpoint ] = array(
							'unit'  => strtolower( $m[2] ),
							'size'  => (float) $m[1],
							'sizes' => array(),
						);
					}
				}
			}
			$globals['container_width'] = $container_width;

			return $globals;
		}

		public static function execute_sync_atomic_globals( $arguments ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Elementor is not active.' );
			}

			if ( ! class_exists( 'Protuno_Atomic_Globals' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Protuno_Atomic_Globals class not found.' );
			}

			if ( ! self::is_atomic_enabled() ) {
				return new WP_Error( 'uich_mcp_error', 'Atomic globals are DISABLED in Elementor.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();

			if ( empty( $arguments['data'] ) ) {
				return new WP_Error( 'uich_mcp_error', 'Missing required parameter: data' );
			}

			if ( isset( $arguments['container_width'] ) && is_array( $arguments['container_width'] ) ) {
				if ( ! is_array( $arguments['data'] ) ) {
					$arguments['data'] = array();
				}
				$converted_width = array();
				foreach ( $arguments['container_width'] as $breakpoint => $val ) {
					if ( is_array( $val ) && isset( $val['size'] ) && isset( $val['unit'] ) ) {
						$converted_width[ $breakpoint ] = $val['size'] . $val['unit'];
					}
				}
				if ( ! empty( $converted_width ) ) {
					$arguments['data']['width'] = $converted_width;
				}
			}

			if ( isset( $arguments['data']['typography'] ) && is_array( $arguments['data']['typography'] ) ) {
				$reshaped = array();
				foreach ( $arguments['data']['typography'] as $item ) {
					if ( is_array( $item ) && isset( $item['id'] ) && isset( $item['action'] )
						&& ( ! isset( $item['value']['id'] ) ) ) {
						$reshaped[] = array(
							'action' => $item['action'],
							'value'  => array(
								'id'    => $item['id'],
								'label' => $item['label'] ?? '',
								'value' => $item['value'] ?? array(),
							),
						);
					} else {
						$reshaped[] = $item;
					}
				}
				$arguments['data']['typography'] = $reshaped;
			}

			if ( isset( $arguments['data']['color'] ) && is_array( $arguments['data']['color'] ) ) {
				foreach ( $arguments['data']['color'] as &$color_item ) {
					if ( is_array( $color_item ) && 'DEL' === ( $color_item['action'] ?? '' )
						&& ! isset( $color_item['value'] ) ) {
						$color_item['value'] = '';
					}
				}
				unset( $color_item );
			}

			$sync_data = json_decode( wp_json_encode( $arguments ) );

			return Protuno_Atomic_Globals::sych_uich_elementor_classes_and_variables_sync( $sync_data );
		}

		private static function is_atomic_enabled() {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return false;
			}
			$experiments = \Elementor\Plugin::$instance->experiments;
			if ( ! $experiments || ! method_exists( $experiments, 'is_feature_active' ) ) {
				return false;
			}
			return (bool) $experiments->is_feature_active( 'e_atomic_elements' );
		}

		public static function execute_create_uichemy_composer_page( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$payload   = array(
				'title'         => isset( $arguments['title'] ) ? sanitize_text_field( (string) $arguments['title'] ) : 'Protuno AI Landing Page',
				'status'        => isset( $arguments['status'] ) ? sanitize_key( (string) $arguments['status'] ) : 'draft',
				'source'        => isset( $arguments['source'] ) ? sanitize_text_field( (string) $arguments['source'] ) : 'mcp',
				'label'         => isset( $arguments['label'] ) ? sanitize_text_field( (string) $arguments['label'] ) : '',
				'html'          => isset( $arguments['html'] ) ? (string) $arguments['html'] : '',
				'css'           => isset( $arguments['css'] ) ? (string) $arguments['css'] : '',
				'js'            => isset( $arguments['js'] ) ? (string) $arguments['js'] : '',
				'page_css'      => isset( $arguments['page_before_head'] ) ? (string) $arguments['page_before_head'] : '',
				'page_js'       => isset( $arguments['page_before_body'] ) ? (string) $arguments['page_before_body'] : '',
				'site_css'      => isset( $arguments['site_before_head'] ) ? (string) $arguments['site_before_head'] : '',
				'site_js'       => isset( $arguments['site_before_body'] ) ? (string) $arguments['site_before_body'] : '',
				'upload_images' => isset( $arguments['upload_images'] ) ? (bool) $arguments['upload_images'] : true,
			);

			$create_result = Protuno_Proton_Manager::mcp_create_page_with_generated_code( $payload );
			if ( is_wp_error( $create_result ) ) {
				return $create_result;
			}

			return $create_result;
		}

		public static function execute_add_uichemy_composer_section( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$post_id   = isset( $arguments['post_id'] ) ? absint( $arguments['post_id'] ) : 0;
			if ( ! $post_id ) {
				return new WP_Error( 'uich_mcp_error', 'Missing required parameter: post_id' );
			}

			$payload = array(
				'post_id'       => $post_id,
				'label'         => isset( $arguments['label'] ) ? sanitize_text_field( (string) $arguments['label'] ) : 'Section',
				'source'        => isset( $arguments['source'] ) ? sanitize_text_field( (string) $arguments['source'] ) : 'mcp',
				'html'          => isset( $arguments['html'] ) ? (string) $arguments['html'] : '',
				'css'           => isset( $arguments['css'] ) ? (string) $arguments['css'] : '',
				'js'            => isset( $arguments['js'] ) ? (string) $arguments['js'] : '',
				'page_css'      => isset( $arguments['page_before_head'] ) ? (string) $arguments['page_before_head'] : '',
				'page_js'       => isset( $arguments['page_before_body'] ) ? (string) $arguments['page_before_body'] : '',
				'site_css'      => isset( $arguments['site_before_head'] ) ? (string) $arguments['site_before_head'] : '',
				'site_js'       => isset( $arguments['site_before_body'] ) ? (string) $arguments['site_before_body'] : '',
				'upload_images' => isset( $arguments['upload_images'] ) ? (bool) $arguments['upload_images'] : true,
			);

			$add_result = Protuno_Proton_Manager::mcp_add_section_to_page( $payload );
			if ( is_wp_error( $add_result ) ) {
				return $add_result;
			}

			return $add_result;
		}

		public static function execute_create_uichemy_composer_header_footer( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$type      = isset( $arguments['type'] ) ? sanitize_key( (string) $arguments['type'] ) : 'header';
			if ( ! in_array( $type, array( 'header', 'footer' ), true ) ) {
				return new WP_Error( 'uich_mcp_error', 'Parameter "type" must be "header" or "footer".' );
			}

			$payload = array(
				'type'          => $type,
				'title'         => isset( $arguments['title'] ) ? sanitize_text_field( (string) $arguments['title'] ) : ( ucfirst( $type ) . ' — Protuno' ),
				'label'         => isset( $arguments['label'] ) ? sanitize_text_field( (string) $arguments['label'] ) : ucfirst( $type ),
				'source'        => isset( $arguments['source'] ) ? sanitize_text_field( (string) $arguments['source'] ) : 'mcp',
				'html'          => isset( $arguments['html'] ) ? (string) $arguments['html'] : '',
				'css'           => isset( $arguments['css'] ) ? (string) $arguments['css'] : '',
				'js'            => isset( $arguments['js'] ) ? (string) $arguments['js'] : '',
				'site_css'      => isset( $arguments['site_css'] ) ? (string) $arguments['site_css'] : '',
				'site_js'       => isset( $arguments['site_js'] ) ? (string) $arguments['site_js'] : '',
				'upload_images' => isset( $arguments['upload_images'] ) ? (bool) $arguments['upload_images'] : true,
			);

			$result = Protuno_Proton_Manager::mcp_create_header_footer_template( $payload );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return $result;
		}

		public static function execute_create_single_post_widget( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$payload   = array(
				'post_type'           => isset( $arguments['post_type'] ) ? sanitize_key( (string) $arguments['post_type'] ) : 'post',
				'title'               => isset( $arguments['title'] ) ? sanitize_text_field( (string) $arguments['title'] ) : 'Single Post — Protuno',
				'label'               => isset( $arguments['label'] ) ? sanitize_text_field( (string) $arguments['label'] ) : 'Single Post',
				'source'              => isset( $arguments['source'] ) ? sanitize_text_field( (string) $arguments['source'] ) : 'mcp',
				'html'                => isset( $arguments['html'] ) ? (string) $arguments['html'] : '',
				'css'                 => isset( $arguments['css'] ) ? (string) $arguments['css'] : '',
				'js'                  => isset( $arguments['js'] ) ? (string) $arguments['js'] : '',
				'site_css'            => isset( $arguments['site_before_head'] ) ? (string) $arguments['site_before_head'] : '',
				'site_js'             => isset( $arguments['site_before_body'] ) ? (string) $arguments['site_before_body'] : '',
				'upload_images'       => isset( $arguments['upload_images'] ) ? (bool) $arguments['upload_images'] : true,
				'force_deactivate'    => isset( $arguments['force_deactivate'] ) ? (bool) $arguments['force_deactivate'] : false,
				'create_sample_post'  => isset( $arguments['create_sample_post'] ) ? (bool) $arguments['create_sample_post'] : false,
				'sample_post_title'   => isset( $arguments['sample_post_title'] ) ? sanitize_text_field( (string) $arguments['sample_post_title'] ) : '',
				'sample_post_content' => isset( $arguments['sample_post_content'] ) ? (string) $arguments['sample_post_content'] : '',
			);

			$result = Protuno_Proton_Manager::mcp_create_single_post_template( $payload );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return $result;
		}

		public static function execute_set_page_site_code( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$post_id   = isset( $arguments['post_id'] ) ? (int) $arguments['post_id'] : 0;
			if ( $post_id <= 0 ) {
				return new WP_Error( 'uich_mcp_error', 'Missing or invalid post_id.' );
			}

			$payload = array(
				'post_id'  => $post_id,
				'site_css' => isset( $arguments['site_before_head'] ) ? (string) $arguments['site_before_head'] : '',
				'site_js'  => isset( $arguments['site_before_body'] ) ? (string) $arguments['site_before_body'] : '',
				'page_css' => isset( $arguments['page_before_head'] ) ? (string) $arguments['page_before_head'] : '',
				'page_js'  => isset( $arguments['page_before_body'] ) ? (string) $arguments['page_before_body'] : '',
			);

			if ( ! method_exists( 'Protuno_Proton_Manager', 'mcp_set_page_site_code' ) ) {
				return new WP_Error( 'uich_mcp_error', 'mcp_set_page_site_code is not yet implemented.' );
			}

			$update_result = Protuno_Proton_Manager::mcp_set_page_site_code( $payload );
			if ( is_wp_error( $update_result ) ) {
				return $update_result;
			}

			return $update_result;
		}

		public static function execute_list_pages( $arguments ) {
			$arguments = is_array( $arguments ) ? $arguments : array();
			$post_type = isset( $arguments['post_type'] ) ? sanitize_key( (string) $arguments['post_type'] ) : 'page';
			$status    = isset( $arguments['status'] ) ? sanitize_key( (string) $arguments['status'] ) : 'any';
			$per_page  = isset( $arguments['per_page'] ) ? min( 100, max( 1, (int) $arguments['per_page'] ) ) : 20;

			$posts = get_posts( array(
				'post_type'      => $post_type,
				'post_status'    => $status,
				'posts_per_page' => $per_page,
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'no_found_rows'  => true,
			) );

			$items = array();
			foreach ( $posts as $post ) {
				$items[] = array(
					'id'             => $post->ID,
					'title'          => $post->post_title,
					'status'         => $post->post_status,
					'type'           => $post->post_type,
					'modified'       => $post->post_modified,
					'url'            => get_permalink( $post->ID ),
					'edit_link'      => get_edit_post_link( $post->ID, 'internal' ),
					'elementor_link' => add_query_arg(
						array( 'post' => $post->ID, 'action' => 'elementor' ),
						admin_url( 'post.php' )
					),
				);
			}

			return array(
				'post_type' => $post_type,
				'status'    => $status,
				'total'     => count( $items ),
				'pages'     => $items,
			);
		}

		public static function execute_list_templates( $arguments ) {
			$arguments   = is_array( $arguments ) ? $arguments : array();
			$type_filter = isset( $arguments['type'] ) ? sanitize_key( (string) $arguments['type'] ) : 'all';
			$per_page    = isset( $arguments['per_page'] ) ? min( 100, max( 1, (int) $arguments['per_page'] ) ) : 50;

			$templates  = array();
			$meta_query = array();
			if ( 'all' !== $type_filter ) {
				$meta_query[] = array( 'key' => '_elementor_template_type', 'value' => $type_filter );
			}

			$el_posts = get_posts( array(
				'post_type'      => 'elementor_library',
				'post_status'    => 'any',
				'posts_per_page' => $per_page,
				'no_found_rows'  => true,
				'meta_query'     => $meta_query,
			) );
			foreach ( $el_posts as $post ) {
				$template_type = get_post_meta( $post->ID, '_elementor_template_type', true );
				$conditions    = get_post_meta( $post->ID, '_elementor_conditions', true );
				$is_active     = ! empty( $conditions ) && is_array( $conditions );
				$templates[]   = array(
					'id'             => $post->ID,
					'title'          => $post->post_title,
					'system'         => 'elementor_library',
					'template_type'  => $template_type ? $template_type : 'unknown',
					'status'         => $post->post_status,
					'active'         => $is_active,
					'conditions'     => $is_active ? $conditions : array(),
					'edit_link'      => get_edit_post_link( $post->ID, 'internal' ),
					'elementor_link' => add_query_arg( array( 'post' => $post->ID, 'action' => 'elementor' ), admin_url( 'post.php' ) ),
				);
			}

			if ( post_type_exists( 'nxt_builder' ) ) {
				$nxt_meta = array();
				if ( 'all' !== $type_filter ) {
					$nxt_meta[] = array( 'key' => 'nxt-hooks-layout-sections', 'value' => $type_filter );
				}
				$nxt_posts = get_posts( array(
					'post_type'      => 'nxt_builder',
					'post_status'    => 'any',
					'posts_per_page' => $per_page,
					'no_found_rows'  => true,
					'meta_query'     => $nxt_meta,
				) );
				foreach ( $nxt_posts as $post ) {
					$nxt_type    = get_post_meta( $post->ID, 'nxt-hooks-layout-sections', true );
					$is_active   = '1' === get_post_meta( $post->ID, 'nxt_build_status', true );
					$templates[] = array(
						'id'             => $post->ID,
						'title'          => $post->post_title,
						'system'         => 'nexter',
						'template_type'  => $nxt_type ? $nxt_type : 'unknown',
						'status'         => $post->post_status,
						'active'         => $is_active,
						'conditions'     => array(),
						'edit_link'      => get_edit_post_link( $post->ID, 'internal' ),
						'elementor_link' => add_query_arg( array( 'post' => $post->ID, 'action' => 'elementor' ), admin_url( 'post.php' ) ),
					);
				}
			}

			return array(
				'type_filter' => $type_filter,
				'total'       => count( $templates ),
				'templates'   => $templates,
			);
		}

		public static function execute_get_post_structure( $arguments ) {
			$arguments = is_array( $arguments ) ? $arguments : array();
			$post_id   = isset( $arguments['post_id'] ) ? absint( $arguments['post_id'] ) : 0;
			if ( ! $post_id ) {
				return new WP_Error( 'uich_mcp_error', 'Missing required parameter: post_id' );
			}

			$post = get_post( $post_id );
			if ( ! $post ) {
				return new WP_Error( 'uich_mcp_error', "Post ID {$post_id} not found." );
			}

			$raw       = get_post_meta( $post_id, '_elementor_data', true );
			$edit_mode = get_post_meta( $post_id, '_elementor_edit_mode', true );

			if ( ! is_string( $raw ) || '' === $raw ) {
				return array(
					'post_id'           => $post_id,
					'post_title'        => $post->post_title,
					'post_type'         => $post->post_type,
					'elementor_enabled' => false,
					'message'           => 'This post has no Elementor data (_elementor_data is empty).',
				);
			}

			$elements = json_decode( $raw, true );
			if ( ! is_array( $elements ) ) {
				return new WP_Error( 'uich_mcp_error', 'Elementor data for this post is not valid JSON.' );
			}

			$uichemy_widget_counter = 0;
			$sections_summary       = self::summarize_elementor_tree( $elements, $uichemy_widget_counter );

			return array(
				'post_id'               => $post_id,
				'post_title'            => $post->post_title,
				'post_type'             => $post->post_type,
				'post_status'           => $post->post_status,
				'elementor_edit_mode'   => $edit_mode ?: 'builder',
				'top_level_count'       => count( $elements ),
				'total_uichemy_widgets' => $uichemy_widget_counter,
				'structure'             => $sections_summary,
				'edit_link'             => get_edit_post_link( $post_id, 'internal' ),
				'elementor_link'        => add_query_arg( array( 'post' => $post_id, 'action' => 'elementor' ), admin_url( 'post.php' ) ),
				'preview_link'          => get_permalink( $post_id ),
			);
		}

		private static function summarize_elementor_tree( array $elements, &$uichemy_widget_counter ) {
			$summary = array();
			foreach ( $elements as $index => $el ) {
				if ( ! is_array( $el ) ) {
					continue;
				}
				$el_type    = isset( $el['elType'] ) ? $el['elType'] : 'unknown';
				$widget_type = isset( $el['widgetType'] ) ? $el['widgetType'] : null;
				$el_id      = isset( $el['id'] ) ? $el['id'] : '';
				$settings   = isset( $el['settings'] ) && is_array( $el['settings'] ) ? $el['settings'] : array();

				$node = array( 'index' => $index, 'id' => $el_id, 'elType' => $el_type );

				if ( $widget_type ) {
					$node['widgetType'] = $widget_type;
				}
				if ( 'proton' === $widget_type ) {
					$node['uichemy_widget_index'] = $uichemy_widget_counter++;
					$node['label']    = isset( $settings['_title'] ) ? $settings['_title'] : '';
					$node['has_html'] = isset( $settings['raw_html'] ) && '' !== trim( $settings['raw_html'] );
					$node['has_css']  = isset( $settings['raw_css'] ) && '' !== trim( $settings['raw_css'] );
					$node['has_js']   = isset( $settings['raw_js'] ) && '' !== trim( $settings['raw_js'] );
				} elseif ( isset( $settings['_title'] ) && '' !== $settings['_title'] ) {
					$node['label'] = $settings['_title'];
				}

				if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
					$node['children'] = self::summarize_elementor_tree( $el['elements'], $uichemy_widget_counter );
				}

				$summary[] = $node;
			}
			return $summary;
		}

		public static function execute_get_set_section_code( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments    = is_array( $arguments ) ? $arguments : array();
			$post_id      = isset( $arguments['post_id'] ) ? absint( $arguments['post_id'] ) : 0;
			$action       = isset( $arguments['action'] ) ? sanitize_key( (string) $arguments['action'] ) : 'get';
			$widget_index = isset( $arguments['widget_index'] ) ? (int) $arguments['widget_index'] : 0;

			if ( ! $post_id ) {
				return new WP_Error( 'uich_mcp_error', 'Missing required parameter: post_id' );
			}
			if ( ! in_array( $action, array( 'get', 'set' ), true ) ) {
				return new WP_Error( 'uich_mcp_error', 'Parameter "action" must be "get" or "set".' );
			}

			$get_result = Protuno_Proton_Manager::mcp_get_section_code( $post_id, $widget_index );
			if ( is_wp_error( $get_result ) ) {
				return $get_result;
			}

			if ( 'get' === $action ) {
				return $get_result;
			}

			$html          = isset( $arguments['html'] ) ? (string) $arguments['html'] : '';
			$css           = isset( $arguments['css'] ) ? (string) $arguments['css'] : '';
			$js            = isset( $arguments['js'] ) ? (string) $arguments['js'] : '';
			$upload_images = isset( $arguments['upload_images'] ) ? (bool) $arguments['upload_images'] : true;

			if ( '' === trim( $html ) && '' === trim( $css ) && '' === trim( $js ) ) {
				return new WP_Error( 'uich_mcp_error', 'For action="set" at least one of html, css, or js must be provided.' );
			}

			$widget_id  = $get_result['widget_id'];
			$set_result = Protuno_Proton_Manager::mcp_sync_generated_code_to_widget(
				$post_id,
				array(
					'mode'          => 'replace',
					'widget_id'     => $widget_id,
					'html'          => $html,
					'css'           => $css,
					'js'            => $js,
					'upload_images' => $upload_images,
					'source'        => 'mcp',
					'label'         => $get_result['label'],
				)
			);
			if ( is_wp_error( $set_result ) ) {
				return $set_result;
			}

			return $set_result;
		}

		public static function execute_insert_section_at_index( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {
				return new WP_Error( 'uich_mcp_error', 'Proton manager class not found.' );
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$post_id   = isset( $arguments['post_id'] ) ? absint( $arguments['post_id'] ) : 0;
			if ( ! $post_id ) {
				return new WP_Error( 'uich_mcp_error', 'Missing required parameter: post_id' );
			}

			$payload = array(
				'post_id'       => $post_id,
				'insert_index'  => isset( $arguments['insert_index'] ) ? (int) $arguments['insert_index'] : 0,
				'label'         => isset( $arguments['label'] ) ? sanitize_text_field( (string) $arguments['label'] ) : 'Section',
				'source'        => isset( $arguments['source'] ) ? sanitize_text_field( (string) $arguments['source'] ) : 'mcp',
				'html'          => isset( $arguments['html'] ) ? (string) $arguments['html'] : '',
				'css'           => isset( $arguments['css'] ) ? (string) $arguments['css'] : '',
				'js'            => isset( $arguments['js'] ) ? (string) $arguments['js'] : '',
				'upload_images' => isset( $arguments['upload_images'] ) ? (bool) $arguments['upload_images'] : true,
			);

			$result = Protuno_Proton_Manager::mcp_insert_section_at_index( $payload );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return $result;
		}

		/**
		 * Direct-prompt entry tool — returns the no-Figma site-build
		 * pipeline as a resource so it lands in the AI context verbatim.
		 *
		 * Aggressively-triggered (see tool description) so casual prompts
		 * like "make docker service design" land here BEFORE the AI
		 * starts hand-writing HTML and skipping Header / Footer.
		 */
		public static function execute_start_site_build( $arguments ) {
			$arguments = is_array( $arguments ) ? $arguments : array();
			$brief     = isset( $arguments['brief'] ) ? trim( (string) $arguments['brief'] ) : '';

			if ( '' === $brief ) {
				return new WP_Error( 'uich_mcp_error', 'Missing required parameter: brief (the user\'s request, e.g. "make docker service design").' );
			}

			$path = self::PIPELINE_DIR . '08-direct-prompt.md';
			if ( ! is_readable( $path ) ) {
				return new WP_Error( 'uich_mcp_error', 'Direct-prompt pipeline file is missing: 08-direct-prompt.md.' );
			}

			$body = file_get_contents( $path );
			if ( ! is_string( $body ) || '' === trim( $body ) ) {
				return new WP_Error( 'uich_mcp_error', 'Direct-prompt pipeline file is empty.' );
			}

			$industry = isset( $arguments['industry'] ) ? trim( (string) $arguments['industry'] ) : '';
			$brand    = isset( $arguments['brand'] ) ? trim( (string) $arguments['brand'] ) : '';

			$header = "## User brief (received)\n\n> " . $brief . "\n\n";
			if ( '' !== $industry ) {
				$header .= "**Industry hint:** " . $industry . "  \n";
			}
			if ( '' !== $brand ) {
				$header .= "**Brand hint:** " . $brand . "  \n";
			}
			$header .= "\n---\n\n";

			return array(
				'type'     => 'resource',
				'uri'      => 'uichemy://composer/pipeline/direct-prompt',
				'mimeType' => 'text/markdown',
				'text'     => self::get_globals_disabled_banner() . $header . $body,
			);
		}

		/**
		 * Issue a temporary upload slot for an AI-generated image.
		 *
		 * Thin wrapper around Protuno_Proton_Upload::issue_slot — the heavy
		 * lifting (token mint, transient store, curl example) lives in
		 * class-protuno-proton-upload.php. We just sanitize the MCP-side
		 * inputs and forward.
		 */
		public static function execute_request_image_upload( $arguments ) {
			if ( ! class_exists( 'Protuno_Proton_Upload' ) ) {
				require_once PROTUNO_PATH . 'includes/mcp/class-protuno-proton-upload.php';
			}

			$arguments = is_array( $arguments ) ? $arguments : array();
			$payload   = array(
				'filename'    => isset( $arguments['filename'] ) ? (string) $arguments['filename'] : '',
				'mime'        => isset( $arguments['mime'] ) ? (string) $arguments['mime'] : '',
				'ttl_minutes' => isset( $arguments['ttl_minutes'] ) ? (int) $arguments['ttl_minutes'] : 10,
			);

			return Protuno_Proton_Upload::issue_slot( $payload );
		}
	}
}
