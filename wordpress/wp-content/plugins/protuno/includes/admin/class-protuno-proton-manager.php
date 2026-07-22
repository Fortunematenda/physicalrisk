<?php
/**
 * Proton widget integration.
 *
 * @package Protuno
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'Protuno_Proton_Manager' ) ) {

	/**
	 * Registers and handles Proton widget functionality.
	 */
	class Protuno_Proton_Manager {

		/**
		 * Shared site-level custom code option key.
		 */
		const SITE_CUSTOM_CODE_OPTION = 'protuno_proton_site_custom_code';

		/**
		 * Shared site-level 3rd-party deps option key.
		 */
		const SITE_DEPS_OPTION = 'protuno_proton_site_deps';

		/**
		 * AJAX nonce action/key for editor sync.
		 */
		const EDITOR_AJAX_NONCE_ACTION = 'protuno_proton_editor_custom_code';

		/**
		 * Constructor.
		 */
		public function __construct() {
			if ( did_action( 'elementor/loaded' ) ) {
				$this->init();
				return;
			}

			add_action( 'elementor/loaded', array( $this, 'init' ) );
		}

		/**
		 * Initialize integrations when Elementor is available.
		 *
		 * @return void
		 */
		public function init() {
			if ( ! did_action( 'elementor/loaded' ) ) {
				return;
			}

			add_action( 'elementor/elements/categories_registered', array( $this, 'register_widget_category' ) );
			add_action( 'elementor/widgets/register', array( $this, 'register_widget' ) );
			add_action( 'wp_ajax_uichemy_composer_get_site_custom_code', array( $this, 'ajax_get_site_custom_code' ) );
			add_action( 'wp_ajax_uichemy_composer_save_site_custom_code', array( $this, 'ajax_save_site_custom_code' ) );
			add_action( 'wp_ajax_uichemy_composer_get_site_deps', array( $this, 'ajax_get_site_deps' ) );
			add_action( 'wp_ajax_uichemy_composer_save_site_deps', array( $this, 'ajax_save_site_deps' ) );
			add_filter( 'get_post_metadata', array( $this, 'normalize_elementor_page_settings_meta' ), 10, 4 );

			// Without this filter, Elementor's save pipeline runs wp_kses() on
			// HIDDEN widget settings for users without `unfiltered_html`, which
			// strips <link>/<style>/<script>/<meta> — exactly the tags that
			// make page-level Google Fonts work. Admins are trusted to author
			// them; we widen the allowed-tag list only inside our own save
			// AJAX and Elementor's editor-save AJAX, and only for admins.
			add_filter( 'wp_kses_allowed_html', array( $this, 'maybe_allow_code_tags_for_admin_saves' ), 10, 2 );

			// Frontend output locations equivalent to Elementor custom code placement.
			add_action( 'wp_head', array( $this, 'print_head_custom_code' ), 100 );
			add_action( 'wp_footer', array( $this, 'print_body_end_custom_code' ), 21 );

			// Admin bar edit shortcuts for Protuno-created Nexter header/footer templates.
			add_action( 'admin_bar_menu', array( $this, 'add_header_footer_edit_links' ), 100 );
		}

		/**
		 * Register Elementor widget.
		 *
		 * @param \Elementor\Widgets_Manager $widgets_manager Elementor widgets manager.
		 * @return void
		 */
		public function register_widget_category( $elements_manager ) {
			$elements_manager->add_category(
				'protuno',
				array(
					'title' => esc_html__( 'Protuno', 'protuno' ),
					'icon'  => 'fa fa-plug',
				)
			);
		}

		public function register_widget( $widgets_manager ) {
			require_once PROTUNO_PATH . 'includes/admin/widgets/class-protuno-proton-widget.php';
			$widgets_manager->register( new \Protuno_Proton_Widget() );
		}

		/**
		 * Normalize broken Elementor page settings meta from "{}" string to array.
		 *
		 * Some previously created pages stored `_elementor_page_settings` as a JSON string,
		 * but Elementor expects an array and can fatal on strict type checks.
		 *
		 * @param mixed       $value     The value to return, or null to continue normal retrieval.
		 * @param int         $object_id Post ID.
		 * @param string      $meta_key  Meta key.
		 * @param bool|string $single    Whether a single value was requested.
		 * @return mixed
		 */
		public function normalize_elementor_page_settings_meta( $value, $object_id, $meta_key, $single ) {
			if ( '_elementor_page_settings' !== $meta_key ) {
				return $value;
			}

			global $wpdb;
			$raw_value = $wpdb->get_var(
				$wpdb->prepare(
					"SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s LIMIT 1",
					$object_id,
					$meta_key
				)
			);

			if ( '{}' === $raw_value ) {
				update_post_meta( $object_id, '_elementor_page_settings', array() );
				return $single ? array() : array( array() );
			}

			return $value;
		}

		/**
		 * Get shared site-level custom code option.
		 *
		 * @return array<string, string>
		 */
		public static function get_site_custom_code_option() {
			$option = get_option( self::SITE_CUSTOM_CODE_OPTION, array() );

			if ( ! is_array( $option ) ) {
				$option = array();
			}

			return array(
				'head'   => isset( $option['head'] ) ? (string) $option['head'] : '',
				'footer' => isset( $option['footer'] ) ? (string) $option['footer'] : '',
			);
		}

		/**
		 * Update shared site-level custom code option.
		 *
		 * @param string $head   Site head code.
		 * @param string $footer  Site footer code.
		 * @param bool   $trusted Whether code comes from a trusted internal MCP import path.
		 * @return array<string, string>
		 */
		public static function update_site_custom_code_option( $head, $footer, $trusted = false ) {
			$data = array(
				'head'   => self::sanitize_custom_code( $head, $trusted ),
				'footer' => self::sanitize_custom_code( $footer, $trusted ),
			);

			update_option( self::SITE_CUSTOM_CODE_OPTION, $data, false );

			return $data;
		}

		/**
		 * Wrap raw CSS in a <style> tag if it is not already wrapped.
		 *
		 * @param string $css Raw CSS or already-wrapped block.
		 * @return string
		 */
		private static function mcp_ensure_style_tag( $css ) {
			$css = trim( (string) $css );
			if ( '' === $css ) {
				return '';
			}

			// Head code can be markup, such as Google Fonts <link> tags. Preserve it
			// instead of placing markup inside <style>, which browsers ignore.
			if ( preg_match( '/<(style|link|meta)\b/i', $css ) ) {
				return $css;
			}

			return "<style>\n" . $css . "\n</style>";
		}

		/**
		 * Wrap raw JS in a <script> tag if it is not already wrapped.
		 *
		 * @param string $js Raw JavaScript or already-wrapped block.
		 * @return string
		 */
		private static function mcp_ensure_script_tag( $js ) {
			$js = trim( (string) $js );
			if ( '' === $js ) {
				return '';
			}
			if ( 0 === stripos( $js, '<script' ) ) {
				return $js;
			}
			return "<script>\n" . $js . "\n</script>";
		}

		/**
		 * Append CSS and/or JS to the site-level custom code option.
		 * Deduplicates by exact string — if the same block is already present it is not added twice.
		 *
		 * @param string $site_css Optional CSS to append to site head (wrapped in <style> if needed).
		 * @param string $site_js  Optional JS to append to site footer (wrapped in <script> if needed).
		 * @return void
		 */
		private static function mcp_append_site_custom_code( $site_css, $site_js ) {
			$site_css = trim( (string) $site_css );
			$site_js  = trim( (string) $site_js );

			if ( '' === $site_css && '' === $site_js ) {
				return;
			}

			$current = self::get_site_custom_code_option();
			$head    = $current['head'];
			$footer  = $current['footer'];
			$changed = false;

			if ( '' !== $site_css ) {
				$site_css_candidate = $site_css;
				if ( preg_match( '/<link\b/i', $site_css_candidate ) ) {
					$site_css_candidate = self::mcp_filter_duplicate_link_tags_from_markup( $head, $site_css_candidate );
				}
				if ( '' !== trim( $site_css_candidate ) ) {
					$wrapped = self::mcp_ensure_style_tag( $site_css_candidate );
					if ( false === strpos( $head, $wrapped ) ) {
						$head    = '' === $head ? $wrapped : $head . "\n" . $wrapped;
						$changed = true;
					}
				}
			}

			if ( '' !== $site_js ) {
				$wrapped = self::mcp_ensure_script_tag( $site_js );
				if ( false === strpos( $footer, $wrapped ) ) {
					$footer  = '' === $footer ? $wrapped : $footer . "\n" . $wrapped;
					$changed = true;
				}
			}

			if ( $changed ) {
				self::update_site_custom_code_option( $head, $footer, true );
			}
		}

		/**
		 * Remove <link> lines whose href is already present in site head markup (avoids duplicate font preconnect/CSS URLs).
		 *
		 * @param string $existing_head Current aggregated head HTML.
		 * @param string $markup        New markup (may contain multiple lines of <link> tags).
		 * @return string
		 */
		private static function mcp_filter_duplicate_link_tags_from_markup( $existing_head, $markup ) {
			$existing_head = (string) $existing_head;
			$markup        = (string) $markup;
			$lines         = preg_split( '/\r\n|\r|\n/', $markup );
			if ( ! is_array( $lines ) ) {
				return $markup;
			}
			$keep = array();
			foreach ( $lines as $line ) {
				$line = trim( (string) $line );
				if ( '' === $line ) {
					continue;
				}
				if ( preg_match( '/<link\b[^>]*\bhref\s*=\s*(["\'])([^"\']*)\1/i', $line, $m ) ) {
					$href = isset( $m[2] ) ? trim( (string) $m[2] ) : '';
					if ( '' !== $href && self::mcp_site_head_contains_link_href( $existing_head, $href ) ) {
						continue;
					}
				}
				$keep[] = $line;
			}
			return implode( "\n", $keep );
		}

		/**
		 * Whether site head markup already includes a <link> with the same href (case-insensitive).
		 *
		 * @param string $head Site head HTML.
		 * @param string $href URL from a candidate <link href="...">.
		 * @return bool
		 */
		private static function mcp_site_head_contains_link_href( $head, $href ) {
			$head = (string) $head;
			$href = strtolower( trim( (string) $href ) );
			if ( '' === $href ) {
				return false;
			}
			if ( ! preg_match_all( '/<link\b[^>]*\bhref\s*=\s*(["\'])([^"\']*)\1/i', $head, $matches ) ) {
				return false;
			}
			foreach ( $matches[2] as $existing ) {
				if ( strtolower( trim( (string) $existing ) ) === $href ) {
					return true;
				}
			}
			return false;
		}

		/**
		 * Collect first non-empty page head/footer custom code from Proton widgets (document order).
		 *
		 * @param array  $elements Elementor elements tree.
		 * @param string $head     Output canonical head markup.
		 * @param string $footer   Output canonical footer markup.
		 * @return void
		 */
		private static function mcp_collect_first_page_custom_code_from_elements( $elements, &$head, &$footer ) {
			foreach ( $elements as $element ) {
				if ( ! is_array( $element ) ) {
					continue;
				}
				$el_type     = isset( $element['elType'] ) ? $element['elType'] : '';
				$widget_type = isset( $element['widgetType'] ) ? $element['widgetType'] : '';
				if ( 'widget' === $el_type && 'proton' === $widget_type ) {
					$settings = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();
					if ( '' === $head ) {
						$h = isset( $settings['page_custom_code_head'] ) ? trim( (string) $settings['page_custom_code_head'] ) : '';
						if ( '' !== $h ) {
							$head = $h;
						}
					}
					if ( '' === $footer ) {
						$f = isset( $settings['page_custom_code_footer'] ) ? trim( (string) $settings['page_custom_code_footer'] ) : '';
						if ( '' !== $f ) {
							$footer = $f;
						}
					}
				}
				if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
					self::mcp_collect_first_page_custom_code_from_elements( $element['elements'], $head, $footer );
				}
				if ( '' !== $head && '' !== $footer ) {
					break;
				}
			}
		}

		/**
		 * Copy canonical page head/footer onto every Proton widget so Elementor shows the same page-level fields for each section.
		 *
		 * @param array  $elements         Elementor elements tree (by reference).
		 * @param string $canonical_head   Head markup.
		 * @param string $canonical_footer Footer markup.
		 * @return void
		 */
		private static function mcp_apply_canonical_page_custom_code_to_all_widgets( array &$elements, $canonical_head, $canonical_footer ) {
			foreach ( $elements as &$element ) {
				if ( ! is_array( $element ) ) {
					continue;
				}
				$el_type     = isset( $element['elType'] ) ? $element['elType'] : '';
				$widget_type = isset( $element['widgetType'] ) ? $element['widgetType'] : '';
				if ( 'widget' === $el_type && 'proton' === $widget_type ) {
					if ( ! isset( $element['settings'] ) || ! is_array( $element['settings'] ) ) {
						$element['settings'] = array();
					}
					if ( '' !== $canonical_head ) {
						$element['settings']['page_custom_code_head'] = $canonical_head;
					}
					if ( '' !== $canonical_footer ) {
						$element['settings']['page_custom_code_footer'] = $canonical_footer;
					}
				}
				if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
					self::mcp_apply_canonical_page_custom_code_to_all_widgets( $element['elements'], $canonical_head, $canonical_footer );
				}
			}
			unset( $element );
		}

		/**
		 * After MCP builds/updates a multi-widget page, mirror page custom code to every Proton widget (editor UX + consistent JSON).
		 *
		 * @param array $elements Elementor elements tree (by reference).
		 * @return void
		 */
		private static function mcp_sync_page_custom_code_across_widgets( array &$elements ) {
			$head   = '';
			$footer = '';
			self::mcp_collect_first_page_custom_code_from_elements( $elements, $head, $footer );
			if ( '' === $head && '' === $footer ) {
				return;
			}
			self::mcp_apply_canonical_page_custom_code_to_all_widgets( $elements, $head, $footer );
		}

		/**
		 * Merge page-level head/footer custom code into the first Proton widget on the page (single copy per page).
		 *
		 * @param array  $elements Elementor elements tree (by reference).
		 * @param string $page_css Raw page CSS (wrapped if needed).
		 * @param string $page_js  Raw page JS (wrapped if needed).
		 * @return bool True if an existing Proton widget was updated.
		 */
		private static function mcp_merge_page_custom_code_into_first_widget( array &$elements, $page_css, $page_js ) {
			$page_css = trim( (string) $page_css );
			$page_js  = trim( (string) $page_js );
			if ( '' === $page_css && '' === $page_js ) {
				return false;
			}
			foreach ( $elements as &$el ) {
				if ( ! is_array( $el ) ) {
					continue;
				}
				$el_type     = isset( $el['elType'] ) ? $el['elType'] : '';
				$widget_type = isset( $el['widgetType'] ) ? $el['widgetType'] : '';
				if ( 'widget' === $el_type && 'proton' === $widget_type ) {
					if ( ! isset( $el['settings'] ) || ! is_array( $el['settings'] ) ) {
						$el['settings'] = array();
					}
					if ( '' !== $page_css ) {
						$block    = self::mcp_ensure_style_tag( $page_css );
						$existing = isset( $el['settings']['page_custom_code_head'] ) ? (string) $el['settings']['page_custom_code_head'] : '';
						if ( false === strpos( $existing, $block ) ) {
							$el['settings']['page_custom_code_head'] = '' === $existing ? $block : $existing . "\n" . $block;
						}
					}
					if ( '' !== $page_js ) {
						$block    = self::mcp_ensure_script_tag( $page_js );
						$existing = isset( $el['settings']['page_custom_code_footer'] ) ? (string) $el['settings']['page_custom_code_footer'] : '';
						if ( false === strpos( $existing, $block ) ) {
							$el['settings']['page_custom_code_footer'] = '' === $existing ? $block : $existing . "\n" . $block;
						}
					}
					unset( $el );
					return true;
				}
				if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
					if ( self::mcp_merge_page_custom_code_into_first_widget( $el['elements'], $page_css, $page_js ) ) {
						unset( $el );
						return true;
					}
				}
			}
			unset( $el );
			return false;
		}

		/**
		 * Match generated section HTML/CSS to Elementor globals (colors → vars, typography → .text-{id} classes).
		 * Called automatically on MCP import so existing kit typography applies without a separate tool call.
		 *
		 * @param string $html Section HTML.
		 * @param string $css  Section CSS.
		 * @return array{ html: string, css: string, dynamic_globals: ?array }
		 */
		private static function mcp_prepare_import_html_css_with_globals( $html, $css ) {
			$html = (string) $html;
			$css  = (string) $css;
			if ( '' === trim( $css ) && '' === trim( $html ) ) {
				return array(
					'html'            => $html,
					'css'             => $css,
					'dynamic_globals' => null,
				);
			}
			if ( ! class_exists( 'Protuno_Globals' ) || ! method_exists( 'Protuno_Globals', 'get_ai_data_snapshot' ) ) {
				return array(
					'html'            => $html,
					'css'             => $css,
					'dynamic_globals' => null,
				);
			}
			$snapshot = (string) Protuno_Globals::get_ai_data_snapshot();
			if ( '' === trim( $snapshot ) ) {
				return array(
					'html'            => $html,
					'css'             => $css,
					'dynamic_globals' => null,
				);
			}
			$result = self::mcp_apply_global_matches_dynamic(
				array(
					'html'                    => $html,
					'css'                     => $css,
					'globals_ai_data'         => $snapshot,
					'prefer_typography_class' => true,
				)
			);
			if ( is_wp_error( $result ) ) {
				return array(
					'html'            => $html,
					'css'             => $css,
					'dynamic_globals' => null,
				);
			}
			return array(
				'html'            => isset( $result['html'] ) ? (string) $result['html'] : $html,
				'css'             => isset( $result['css'] ) ? (string) $result['css'] : $css,
				'dynamic_globals' => isset( $result['matches'] ) ? $result['matches'] : array(),
			);
		}

		/**
		 * Sync MCP-generated HTML/CSS/JS into a Proton widget on a post.
		 *
		 * @param int   $post_id  Target post ID containing Elementor data.
		 * @param array $payload  Sync payload.
		 * @return array|\WP_Error
		 */
		public static function mcp_sync_generated_code_to_widget( $post_id, $payload ) {
			$post_id = absint( $post_id );
			if ( ! $post_id ) {
				return new \WP_Error( 'uich_invalid_post_id', 'Invalid post_id provided.' );
			}

			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$mode      = isset( $payload['mode'] ) ? strtolower( (string) $payload['mode'] ) : 'replace';
			$mode      = in_array( $mode, array( 'replace', 'append' ), true ) ? $mode : 'replace';
			$widget_id = isset( $payload['widget_id'] ) ? (string) $payload['widget_id'] : '';
			$source    = isset( $payload['source'] ) ? sanitize_text_field( (string) $payload['source'] ) : 'mcp';
			$label     = isset( $payload['label'] ) ? sanitize_text_field( (string) $payload['label'] ) : '';

			$raw_html      = isset( $payload['html'] ) ? (string) $payload['html'] : '';
			$raw_css       = isset( $payload['css'] ) ? (string) $payload['css'] : '';
			$raw_js        = isset( $payload['js'] ) ? (string) $payload['js'] : '';
			$upload_images = isset( $payload['upload_images'] ) ? (bool) $payload['upload_images'] : true;

			if ( $upload_images ) {
				$html_media_result = self::mcp_upload_html_images_to_media_library( $raw_html, $raw_css );
				$raw_html          = $html_media_result['html'];
				if ( isset( $html_media_result['css'] ) ) {
					$raw_css = (string) $html_media_result['css'];
				}
			} else {
				$html_media_result = array( 'html' => $raw_html, 'uploaded' => array(), 'failed' => array() );
			}

			if ( '' === trim( $raw_html ) && '' === trim( $raw_css ) && '' === trim( $raw_js ) ) {
				return new \WP_Error( 'uich_empty_generated_code', 'At least one of html, css, or js must be provided.' );
			}

			$globals_prepared = self::mcp_prepare_import_html_css_with_globals( $raw_html, $raw_css );
			$raw_html         = $globals_prepared['html'];
			$raw_css          = $globals_prepared['css'];

			$elementor_data_raw = get_post_meta( $post_id, '_elementor_data', true );
			if ( ! is_string( $elementor_data_raw ) || '' === $elementor_data_raw ) {
				return new \WP_Error( 'uich_missing_elementor_data', 'No Elementor data found on the provided post.' );
			}

			$elements = json_decode( $elementor_data_raw, true );
			if ( ! is_array( $elements ) ) {
				return new \WP_Error( 'uich_invalid_elementor_data', 'Elementor data is not valid JSON.' );
			}

			$tagged_html = self::build_mcp_tagged_code_block( 'html', $raw_html, $source, $label );
			$tagged_css  = self::build_mcp_tagged_code_block( 'css', $raw_css, $source, $label );
			$tagged_js   = self::build_mcp_tagged_code_block( 'js', $raw_js, $source, $label );

			$sync_result = self::apply_mcp_generated_code_to_elements(
				$elements,
				array(
					'mode'      => $mode,
					'widget_id' => $widget_id,
					'html'      => $tagged_html,
					'css'       => $tagged_css,
					'js'        => $tagged_js,
				)
			);

			if ( empty( $sync_result['updated'] ) ) {
				$error_message = ! empty( $sync_result['message'] ) ? $sync_result['message'] : 'No matching Proton widget found.';
				return new \WP_Error( 'uich_widget_not_found', $error_message );
			}

			update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );

			if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			return array(
				'post_id'          => $post_id,
				'widget_id'        => $sync_result['widget_id'],
				'mode'             => $mode,
				'updated_fields'   => $sync_result['updated_fields'],
				'matched_by'       => $sync_result['matched_by'],
				'image_uploads'    => $html_media_result['uploaded'],
				'image_failures'   => $html_media_result['failed'],
				'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
				'message'          => 'Generated code synced to Proton widget successfully.',
			);
		}

		/**
		 * Default settings for the outer Elementor container that wraps a
		 * Proton widget.
		 *
		 * Elementor's default container ships with non-zero padding and a
		 * flex gap inherited from the active kit — those values fight the
		 * Composer widget's own `padding-inline: clamp(...)` and gap rules
		 * and shift the layout one extra time on every page. We zero out
		 * padding / margin / flex_gap on the outer wrapper so the widget's
		 * CSS is the single source of truth for spacing.
		 *
		 * Callers pass any extras (e.g. `html_tag` for header/footer) via
		 * $extra; those are merged on top.
		 *
		 * @param array $extra Additional settings to merge in.
		 * @return array
		 */
		private static function mcp_widget_container_default_settings( array $extra = array() ) {
			$zero_box = array(
				'unit'     => 'px',
				'top'      => '0',
				'right'    => '0',
				'bottom'   => '0',
				'left'     => '0',
				'isLinked' => true,
			);
			$defaults = array(
				'content_width' => 'full',
				'padding'       => $zero_box,
				'margin'        => $zero_box,
				'flex_gap'      => array(
					'unit'     => 'px',
					'size'     => 0,
					'sizes'    => array(),
					'column'   => '0',
					'row'      => '0',
					'isLinked' => true,
				),
			);
			return array_merge( $defaults, $extra );
		}

		/**
		 * Create a new Elementor page with one Proton widget seeded by generated code.
		 *
		 * @param array $payload Page + code payload.
		 * @return array|\WP_Error
		 */
		public static function mcp_create_page_with_generated_code( $payload ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new \WP_Error( 'uich_elementor_missing', 'Elementor is not active.' );
			}

			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$title  = isset( $payload['title'] ) ? sanitize_text_field( (string) $payload['title'] ) : 'Protuno AI Landing Page';
			$status = isset( $payload['status'] ) ? sanitize_key( (string) $payload['status'] ) : 'draft';
			$status = in_array( $status, array( 'draft', 'publish', 'private' ), true ) ? $status : 'draft';
			$source = isset( $payload['source'] ) ? sanitize_text_field( (string) $payload['source'] ) : 'mcp';
			$label  = isset( $payload['label'] ) ? sanitize_text_field( (string) $payload['label'] ) : '';

			$raw_html      = isset( $payload['html'] ) ? (string) $payload['html'] : '';
			$raw_css       = isset( $payload['css'] ) ? (string) $payload['css'] : '';
			$raw_js        = isset( $payload['js'] ) ? (string) $payload['js'] : '';
			$page_css      = isset( $payload['page_css'] ) ? (string) $payload['page_css'] : '';
			$page_js       = isset( $payload['page_js'] ) ? (string) $payload['page_js'] : '';
			$site_css      = isset( $payload['site_css'] ) ? (string) $payload['site_css'] : '';
			$site_js       = isset( $payload['site_js'] ) ? (string) $payload['site_js'] : '';
			$upload_images = isset( $payload['upload_images'] ) ? (bool) $payload['upload_images'] : true;

			if ( $upload_images ) {
				$html_media_result = self::mcp_upload_html_images_to_media_library( $raw_html, $raw_css );
				$raw_html          = $html_media_result['html'];
				if ( isset( $html_media_result['css'] ) ) {
					$raw_css = (string) $html_media_result['css'];
				}
			} else {
				$html_media_result = array( 'html' => $raw_html, 'uploaded' => array(), 'failed' => array() );
			}

			if ( '' === trim( $raw_html ) && '' === trim( $raw_css ) && '' === trim( $raw_js ) ) {
				return new \WP_Error( 'uich_empty_generated_code', 'At least one of html, css, or js must be provided.' );
			}

			$globals_prepared = self::mcp_prepare_import_html_css_with_globals( $raw_html, $raw_css );
			$raw_html         = $globals_prepared['html'];
			$raw_css          = $globals_prepared['css'];

			$post_attributes = array(
				'post_title'  => $title,
				'post_type'   => 'page',
				'post_status' => $status,
			);

			$document = \Elementor\Plugin::$instance->documents->create( 'page', $post_attributes );
			if ( is_wp_error( $document ) ) {
				return new \WP_Error( 'uich_page_create_failed', $document->get_error_message() );
			}

			$post_id = $document->get_main_id();
			if ( ! $post_id ) {
				return new \WP_Error( 'uich_page_create_failed', 'Failed to create Elementor page document.' );
			}

			// Persist site-level CSS/JS to the global site option before saving the page.
			self::mcp_append_site_custom_code( $site_css, $site_js );

			$widget_id    = strtolower( wp_generate_password( 7, false, false ) );
			$container_id = strtolower( wp_generate_password( 7, false, false ) );

			$widget_settings = array(
				'raw_html'             => self::build_mcp_tagged_code_block( 'html', $raw_html, $source, $label ),
				'raw_css'              => self::build_mcp_tagged_code_block( 'css', $raw_css, $source, $label ),
				'raw_js'              => self::build_mcp_tagged_code_block( 'js', $raw_js, $source, $label ),
			);
			if ( '' !== trim( $page_css ) ) {
				$widget_settings['page_custom_code_head'] = self::mcp_ensure_style_tag( $page_css );
			}
			if ( '' !== trim( $page_js ) ) {
				$widget_settings['page_custom_code_footer'] = self::mcp_ensure_script_tag( $page_js );
			}

			// Keep widget directly under a container (no section/column wrappers).
			$elements = array(
				array(
					'id'       => $container_id,
					'elType'   => 'container',
					'isInner'  => false,
					'settings' => self::mcp_widget_container_default_settings(),
					'elements' => array(
						array(
							'id'         => $widget_id,
							'elType'     => 'widget',
							'widgetType' => 'proton',
							'settings'   => $widget_settings,
							'elements'   => array(),
						),
					),
				),
			);

			$save_payload = array(
				'elements' => $elements,
				'settings' => array(),
			);

			try {
				$document->save( $save_payload );
			} catch ( \Throwable $e ) {
				// Continue to explicit meta writes below.
			}

			// Ensure the newly created page always has persisted Elementor structure.
			update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
			// Elementor expects this meta as an array. A JSON string (e.g. "{}") can trigger a type error.
			update_post_meta( $post_id, '_elementor_page_settings', array() );
			update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );

			if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			return array(
				'post_id'       => $post_id,
				'widget_id'     => $widget_id,
				'title'         => get_the_title( $post_id ),
				'status'        => get_post_status( $post_id ),
				'edit_link'     => get_edit_post_link( $post_id, 'internal' ),
				'elementor_link'=> add_query_arg(
					array(
						'post'   => $post_id,
						'action' => 'elementor',
					),
					admin_url( 'post.php' )
				),
				'preview_link'  => get_permalink( $post_id ),
				'image_uploads' => $html_media_result['uploaded'],
				'image_failures'=> $html_media_result['failed'],
				'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
				'message'       => 'New page created with Proton widget content.',
			);
		}

		/**
		 * MCP — create an Elementor Theme Builder header or footer template (inactive by default).
		 * Uses elementor_library post type with _elementor_template_type set to header|footer.
		 * No display conditions are set — user must activate from Theme Builder.
		 *
		 * @param array $payload Template + code payload.
		 * @return array|\WP_Error
		 */
		public static function mcp_create_header_footer_template( $payload ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new \WP_Error( 'uich_elementor_missing', 'Elementor is not active.' );
			}

			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$type = isset( $payload['type'] ) ? sanitize_key( (string) $payload['type'] ) : 'header';
			if ( ! in_array( $type, array( 'header', 'footer' ), true ) ) {
				$type = 'header';
			}

			$title         = isset( $payload['title'] ) ? sanitize_text_field( (string) $payload['title'] ) : ( ucfirst( $type ) . ' — Protuno' );
			$label         = isset( $payload['label'] ) ? sanitize_text_field( (string) $payload['label'] ) : ucfirst( $type );
			$source        = isset( $payload['source'] ) ? sanitize_text_field( (string) $payload['source'] ) : 'mcp';
			$raw_html      = isset( $payload['html'] ) ? (string) $payload['html'] : '';
			$raw_css       = isset( $payload['css'] ) ? (string) $payload['css'] : '';
			$raw_js        = isset( $payload['js'] ) ? (string) $payload['js'] : '';
			$site_css      = isset( $payload['site_css'] ) ? (string) $payload['site_css'] : '';
			$site_js       = isset( $payload['site_js'] ) ? (string) $payload['site_js'] : '';
			$upload_images = isset( $payload['upload_images'] ) ? (bool) $payload['upload_images'] : true;

			if ( '' === trim( $raw_html ) && '' === trim( $raw_css ) ) {
				return new \WP_Error( 'uich_empty_generated_code', 'At least html or css must be provided.' );
			}

			if ( $upload_images ) {
				$html_media_result = self::mcp_upload_html_images_to_media_library( $raw_html, $raw_css );
				$raw_html          = $html_media_result['html'];
				if ( isset( $html_media_result['css'] ) ) {
					$raw_css = (string) $html_media_result['css'];
				}
			} else {
				$html_media_result = array( 'html' => $raw_html, 'uploaded' => array(), 'failed' => array() );
			}

			$globals_prepared = self::mcp_prepare_import_html_css_with_globals( $raw_html, $raw_css );
			$raw_html         = $globals_prepared['html'];
			$raw_css          = $globals_prepared['css'];

			// Persist site-level CSS/JS before creating template.
			self::mcp_append_site_custom_code( $site_css, $site_js );

			$widget_id    = strtolower( wp_generate_password( 7, false, false ) );
			$container_id = strtolower( wp_generate_password( 7, false, false ) );

			$widget_settings = array(
				'raw_html' => self::build_mcp_tagged_code_block( 'html', $raw_html, $source, $label ),
				'raw_css'  => self::build_mcp_tagged_code_block( 'css', $raw_css, $source, $label ),
				'raw_js'   => self::build_mcp_tagged_code_block( 'js', $raw_js, $source, $label ),
			);

			// header → <header>, footer → <footer> on the Elementor container.
			$container_html_tag = ( 'footer' === $type ) ? 'footer' : 'header';

			$elements = array(
				array(
					'id'       => $container_id,
					'elType'   => 'container',
					'isInner'  => false,
					'settings' => self::mcp_widget_container_default_settings( array( 'html_tag' => $container_html_tag ) ),
					'elements' => array(
						array(
							'id'         => $widget_id,
							'elType'     => 'widget',
							'widgetType' => 'proton',
							'settings'   => $widget_settings,
							'elements'   => array(),
						),
					),
				),
			);

			// Deactivate all currently active same-type templates across both systems
			// before creating the new one. This prevents duplicate headers/footers.
			$deactivated = self::mcp_deactivate_existing_header_footer_templates( $type );

			// ── Priority 1: Elementor Pro ──────────────────────────────────────
			if ( class_exists( '\ElementorPro\Plugin' ) || defined( 'ELEMENTOR_PRO_VERSION' ) ) {

				$post_id  = 0;
				$document = null;

				// Strategy A: use Elementor's own documents API so that
				// _elementor_document_type is set correctly by the Document class
				// itself — this is what the Theme Builder UI does internally.
				if ( isset( \Elementor\Plugin::$instance->documents )
					&& method_exists( \Elementor\Plugin::$instance->documents, 'create' )
				) {
					try {
						$document = \Elementor\Plugin::$instance->documents->create(
							$type,  // 'header' or 'footer' — registered by Elementor Pro
							array(
								'post_title'  => $title,
								'post_status' => 'publish',
							)
						);
						if ( is_wp_error( $document ) || ! $document ) {
							$document = null;
						} else {
							$post_id = $document->get_main_id();
						}
					} catch ( \Throwable $e ) {
						$document = null;
					}
				}

				// Strategy B fallback: plain wp_insert_post + manual document type meta.
				if ( ! $post_id ) {
					$post_id = wp_insert_post(
						array(
							'post_title'  => $title,
							'post_type'   => 'elementor_library',
							'post_status' => 'publish',
						)
					);
					if ( is_wp_error( $post_id ) || ! $post_id ) {
						return new \WP_Error( 'uich_template_create_failed', 'Failed to create elementor_library post for Elementor Pro.' );
					}
					// _elementor_document_type tells Elementor Pro which Document class
					// to use when loading this post. Without it the ThemeBuilder
					// renderer skips the template entirely, so it never shows on the
					// front-end until re-saved from the editor.
					update_post_meta( $post_id, '_elementor_document_type', $type );
				}

				// Always write our Elementor data + required meta.
				update_post_meta( $post_id, '_elementor_template_type', $type );
				update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
				update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
				update_post_meta( $post_id, '_elementor_page_settings', array() );

				// Taxonomy term — makes template appear in the correct Theme Builder tab.
				wp_set_object_terms( $post_id, $type, 'elementor_library_type' );

				// Ensure published status.
				if ( 'publish' !== get_post_status( $post_id ) ) {
					wp_update_post( array( 'ID' => $post_id, 'post_status' => 'publish' ) );
				}

				// Set display conditions: 'include/general' = entire website.
				// Use Elementor Pro's own save_conditions() API — this updates the
				// post meta AND atomically rebuilds the compiled conditions cache
				// in the same call, exactly as the Theme Builder UI does.
				// Raw update_post_meta alone is NOT enough: the compiled cache
				// (stored in wp_options) will not include the new template until
				// save_conditions() or regenerate() runs successfully.
				$conditions_set = false;
				if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
					try {
						$cm = \ElementorPro\Modules\ThemeBuilder\Module::instance()
							->get_conditions_manager();
						if ( $cm && method_exists( $cm, 'save_conditions' ) ) {
							$cm->save_conditions( $post_id, array( 'include/general' ) );
							$conditions_set = true;
						}
					} catch ( \Throwable $e ) {
						// Fall through to raw fallback below.
					}
				}

				if ( ! $conditions_set ) {
					// Raw fallback — also hard-delete every known conditions cache
					// option so Elementor Pro is forced to rebuild it from meta on
					// the next frontend request.
					update_post_meta( $post_id, '_elementor_conditions', array( 'include/general' ) );
					foreach ( array( 'elementor_pro_theme_builder_conditions', '_elementor_pro_conditions_index' ) as $_k ) {
						delete_option( $_k );
						wp_cache_delete( $_k, 'options' );
					}
					// Also try regenerate() as a last attempt.
					if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
						try {
							\ElementorPro\Modules\ThemeBuilder\Module::instance()
								->get_conditions_manager()
								->get_cache()
								->regenerate();
						} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
						}
					}
				}

				// Flush Elementor CSS/JS file cache.
				if ( isset( \Elementor\Plugin::$instance->files_manager ) ) {
					\Elementor\Plugin::$instance->files_manager->clear_cache();
				}

				return array(
					'post_id'                 => $post_id,
					'system'                  => 'elementor_pro',
					'type'                    => $type,
					'active'                  => true,
					'conditions_api_used'     => $conditions_set,
					'title'                   => get_the_title( $post_id ),
					'elementor_link'          => add_query_arg(
						array( 'post' => $post_id, 'action' => 'elementor' ),
						admin_url( 'post.php' )
					),
					'theme_builder_link'      => admin_url( 'edit.php?post_type=elementor_library&tabs_group=theme' ),
					'deactivated_templates'   => $deactivated,
					'image_uploads'           => $html_media_result['uploaded'],
					'image_failures'          => $html_media_result['failed'],
					'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
					'message'                 => ucfirst( $type ) . ' template created via Elementor Pro Theme Builder and is ACTIVE on the entire site.',
				);
			}

			// ── Priority 2: Nexter Extension ──────────────────────────────────
			// nxt_builder post — activated immediately via nxt_build_status = 1.
			if ( post_type_exists( 'nxt_builder' ) ) {
				$post_id = wp_insert_post(
					array(
						'post_title'  => $title,
						'post_type'   => 'nxt_builder',
						'post_status' => 'publish',
					)
				);

				if ( is_wp_error( $post_id ) || ! $post_id ) {
					return new \WP_Error( 'uich_template_create_failed', 'Failed to create nxt_builder post.' );
				}

				update_post_meta( $post_id, 'nxt-hooks-layout-sections', $type );
				// 'standard-universal' = display on entire website.
				update_post_meta( $post_id, 'nxt-add-display-rule', array( 'standard-universal' ) );
				update_post_meta( $post_id, 'nxt_build_status', '1' );
				update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
				update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );

				// Ensure published status — a Nexter hook could have changed it.
				if ( 'publish' !== get_post_status( $post_id ) ) {
					wp_update_post( array( 'ID' => $post_id, 'post_status' => 'publish' ) );
				}

				if ( isset( \Elementor\Plugin::$instance->files_manager ) ) {
					\Elementor\Plugin::$instance->files_manager->clear_cache();
				}

				return array(
					'post_id'                 => $post_id,
					'system'                  => 'nexter',
					'type'                    => $type,
					'active'                  => true,
					'title'                   => get_the_title( $post_id ),
					'elementor_link'          => add_query_arg(
						array( 'post' => $post_id, 'action' => 'elementor' ),
						admin_url( 'post.php' )
					),
					'builder_link'            => admin_url( 'edit.php?post_type=nxt_builder' ),
					'deactivated_templates'   => $deactivated,
					'image_uploads'           => $html_media_result['uploaded'],
					'image_failures'          => $html_media_result['failed'],
					'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
					'message'                 => ucfirst( $type ) . ' template created via Nexter Theme Builder and is ACTIVE on the entire site.',
				);
			}

			// ── Priority 3: Plain Elementor (no Pro, no Nexter) ───────────────
			// Template is created inactive — user must activate from Theme Builder.
			$post_id = wp_insert_post(
				array(
					'post_title'  => $title,
					'post_type'   => 'elementor_library',
					'post_status' => 'publish',
				)
			);

			if ( is_wp_error( $post_id ) || ! $post_id ) {
				return new \WP_Error( 'uich_template_create_failed', 'Failed to create elementor_library post.' );
			}

			update_post_meta( $post_id, '_elementor_template_type', $type );
			update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
			update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
			update_post_meta( $post_id, '_elementor_conditions', array() );

			wp_set_object_terms( $post_id, $type, 'elementor_library_type' );

			if ( isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			return array(
				'post_id'                 => $post_id,
				'system'                  => 'elementor',
				'type'                    => $type,
				'active'                  => false,
				'title'                   => get_the_title( $post_id ),
				'elementor_link'          => add_query_arg(
					array( 'post' => $post_id, 'action' => 'elementor' ),
					admin_url( 'post.php' )
				),
				'theme_builder_link'      => admin_url( 'edit.php?post_type=elementor_library&tabs_group=theme' ),
				'deactivated_templates'   => $deactivated,
				'image_uploads'           => $html_media_result['uploaded'],
				'image_failures'          => $html_media_result['failed'],
				'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
				'message'                 => ucfirst( $type ) . ' template created (inactive). Open Theme Builder and add an "Entire Site" display condition to activate it.',
			);
		}

		/**
		 * MCP — create a single WordPress page populated with MULTIPLE Proton widgets,
		 * one per detected design section (header, hero, features, footer, etc.).
		 *
		 * All section widgets are placed inside ONE outer Elementor container, stacked
		 * top-to-bottom in the order they were given.
		 *
		 * Expected payload:
		 *   - title    string
		 *   - status   string  draft|publish|private
		 *   - source   string  source label written into code tags
		 *   - sections array<array{ label:string, html:string, css:string, js?:string }>
		 *
		 * @param array $payload Page + sections payload.
		 * @return array|\WP_Error
		 */
		public static function mcp_create_page_with_sections( $payload ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new \WP_Error( 'uich_elementor_missing', 'Elementor is not active.' );
			}

			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$title  = isset( $payload['title'] ) ? sanitize_text_field( (string) $payload['title'] ) : 'Protuno AI Landing Page';
			$status = isset( $payload['status'] ) ? sanitize_key( (string) $payload['status'] ) : 'draft';
			$status = in_array( $status, array( 'draft', 'publish', 'private' ), true ) ? $status : 'draft';
			$source = isset( $payload['source'] ) ? sanitize_text_field( (string) $payload['source'] ) : 'mcp';

			$sections      = isset( $payload['sections'] ) && is_array( $payload['sections'] ) ? $payload['sections'] : array();
			$upload_images = isset( $payload['upload_images'] ) ? (bool) $payload['upload_images'] : true;
			$page_css      = isset( $payload['page_css'] ) ? (string) $payload['page_css'] : '';
			$page_js       = isset( $payload['page_js'] ) ? (string) $payload['page_js'] : '';
			$site_css      = isset( $payload['site_css'] ) ? (string) $payload['site_css'] : '';
			$site_js       = isset( $payload['site_js'] ) ? (string) $payload['site_js'] : '';

			if ( empty( $sections ) ) {
				return new \WP_Error( 'uich_no_sections', 'At least one section is required.' );
			}

			$post_attributes = array(
				'post_title'  => $title,
				'post_type'   => 'page',
				'post_status' => $status,
			);

			$document = \Elementor\Plugin::$instance->documents->create( 'page', $post_attributes );
			if ( is_wp_error( $document ) ) {
				return new \WP_Error( 'uich_page_create_failed', $document->get_error_message() );
			}

			$post_id = $document->get_main_id();
			if ( ! $post_id ) {
				return new \WP_Error( 'uich_page_create_failed', 'Failed to create Elementor page document.' );
			}

			// Persist site-level CSS/JS before creating page widgets.
			self::mcp_append_site_custom_code( $site_css, $site_js );

			$widget_elements  = array();
			$widgets_meta     = array();
			$image_uploads    = array();
			$image_failures   = array();
			$outer_container_id = strtolower( wp_generate_password( 7, false, false ) );
			$first_widget_index = null;

			foreach ( $sections as $index => $section ) {
				if ( ! is_array( $section ) ) {
					continue;
				}

				$section_label = isset( $section['label'] ) ? sanitize_text_field( (string) $section['label'] ) : ( 'Section ' . ( $index + 1 ) );
				$section_html  = isset( $section['html'] ) ? (string) $section['html'] : '';
				$section_css   = isset( $section['css'] ) ? (string) $section['css'] : '';
				$section_js    = isset( $section['js'] ) ? (string) $section['js'] : '';

				if ( '' === trim( $section_html ) && '' === trim( $section_css ) && '' === trim( $section_js ) ) {
					// Skip empty section, but record so caller knows.
					$widgets_meta[] = array(
						'index'   => $index,
						'label'   => $section_label,
						'skipped' => true,
						'reason'  => 'empty section payload',
					);
					continue;
				}

				if ( $upload_images ) {
					$media_result   = self::mcp_upload_html_images_to_media_library( $section_html, $section_css );
					$section_html   = $media_result['html'];
					if ( isset( $media_result['css'] ) ) {
						$section_css = (string) $media_result['css'];
					}
					$image_uploads  = array_merge( $image_uploads, $media_result['uploaded'] );
					$image_failures = array_merge( $image_failures, $media_result['failed'] );
				}

				$globals_prepared = self::mcp_prepare_import_html_css_with_globals( $section_html, $section_css );
				$section_html     = $globals_prepared['html'];
				$section_css      = $globals_prepared['css'];

				$widget_id       = strtolower( wp_generate_password( 7, false, false ) );
				$widget_settings = array(
					'_title'   => $section_label,
					'raw_html' => self::build_mcp_tagged_code_block( 'html', $section_html, $source, $section_label ),
					'raw_css'  => self::build_mcp_tagged_code_block( 'css', $section_css, $source, $section_label ),
					'raw_js'   => self::build_mcp_tagged_code_block( 'js', $section_js, $source, $section_label ),
				);

				// Attach page-level CSS/JS to the first real widget only.
				if ( null === $first_widget_index ) {
					$first_widget_index = count( $widget_elements );
					if ( '' !== trim( $page_css ) ) {
						$widget_settings['page_custom_code_head'] = self::mcp_ensure_style_tag( $page_css );
					}
					if ( '' !== trim( $page_js ) ) {
						$widget_settings['page_custom_code_footer'] = self::mcp_ensure_script_tag( $page_js );
					}
				}

				$widget_elements[] = array(
					'id'         => $widget_id,
					'elType'     => 'widget',
					'widgetType' => 'proton',
					'settings'   => $widget_settings,
					'elements'   => array(),
				);

				$widgets_meta[] = array(
					'index'                   => $index,
					'label'                   => $section_label,
					'widget_id'               => $widget_id,
					'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
				);
			}

			if ( empty( $widget_elements ) ) {
				wp_delete_post( $post_id, true );
				return new \WP_Error( 'uich_all_sections_empty', 'All sections were empty — page not created.' );
			}

			// Wrap all section widgets inside a single outer container.
			$elements = array(
				array(
					'id'       => $outer_container_id,
					'elType'   => 'container',
					'isInner'  => false,
					'settings' => self::mcp_widget_container_default_settings( array( '_title' => $title ) ),
					'elements' => $widget_elements,
				),
			);

			self::mcp_sync_page_custom_code_across_widgets( $elements );

			$save_payload = array(
				'elements' => $elements,
				'settings' => array(),
			);

			try {
				$document->save( $save_payload );
			} catch ( \Throwable $e ) {
				// Continue to explicit meta writes below.
			}

			update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
			update_post_meta( $post_id, '_elementor_page_settings', array() );
			update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );

			if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			return array(
				'post_id'        => $post_id,
				'title'          => get_the_title( $post_id ),
				'status'         => get_post_status( $post_id ),
				'container_id'   => $outer_container_id,
				'sections_count' => count( $widget_elements ),
				'widgets'        => $widgets_meta,
				'edit_link'      => get_edit_post_link( $post_id, 'internal' ),
				'elementor_link' => add_query_arg(
					array(
						'post'   => $post_id,
						'action' => 'elementor',
					),
					admin_url( 'post.php' )
				),
				'preview_link'   => get_permalink( $post_id ),
				'image_uploads'  => $image_uploads,
				'image_failures' => $image_failures,
				'message'        => sprintf( 'New page created with 1 container holding %d Proton widget section(s).', count( $widget_elements ) ),
			);
		}

		/**
		 * Find a container that already has (or is ready for) Proton widgets and append the widget.
		 *
		 * @param array  $elements     Elementor elements tree (by reference).
		 * @param array  $new_widget   New proton element.
		 * @param string $container_id Output: container element id when appended.
		 * @return bool True if appended into an existing container branch.
		 */
		private static function mcp_append_widget_to_section_container( array &$elements, array $new_widget, &$container_id ) {
			foreach ( $elements as &$el ) {
				if ( ! is_array( $el ) || ! isset( $el['elType'] ) ) {
					continue;
				}

				if ( 'container' === $el['elType'] ) {
					$children = isset( $el['elements'] ) && is_array( $el['elements'] ) ? $el['elements'] : array();
					$has_widget = false;
					foreach ( $children as $child ) {
						if ( is_array( $child ) && isset( $child['widgetType'] ) && 'proton' === $child['widgetType'] ) {
							$has_widget = true;
							break;
						}
					}
					if ( $has_widget || empty( $children ) ) {
						if ( ! isset( $el['elements'] ) || ! is_array( $el['elements'] ) ) {
							$el['elements'] = array();
						}
						$el['elements'][] = $new_widget;
						$container_id     = isset( $el['id'] ) ? (string) $el['id'] : '';
						unset( $el );
						return true;
					}
				}

				if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
					if ( self::mcp_append_widget_to_section_container( $el['elements'], $new_widget, $container_id ) ) {
						unset( $el );
						return true;
					}
				}
			}
			unset( $el );
			return false;
		}

		/**
		 * MCP — append ONE new Proton widget to an existing page that already has a container.
		 *
		 * Used in the sequential multi-widget flow: after the first section creates the page
		 * via mcp_create_page_with_generated_code, every subsequent section calls this method
		 * to append a new widget inside the same outer container — no new containers are created.
		 *
		 * Expected payload:
		 *   - post_id  int     Existing page post ID
		 *   - label    string  Section label shown in Elementor navigator
		 *   - html     string  Section HTML
		 *   - css      string  Section CSS
		 *   - js       string  Section JS (optional)
		 *   - source   string  Source tag label (optional)
		 *
		 * @param array $payload Section payload.
		 * @return array|\WP_Error
		 */
		public static function mcp_add_section_to_page( $payload ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new \WP_Error( 'uich_elementor_missing', 'Elementor is not active.' );
			}

			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$post_id = isset( $payload['post_id'] ) ? absint( $payload['post_id'] ) : 0;
			if ( ! $post_id ) {
				return new \WP_Error( 'uich_invalid_post_id', 'A valid post_id is required.' );
			}

			$label    = isset( $payload['label'] ) ? sanitize_text_field( (string) $payload['label'] ) : 'Section';
			$source   = isset( $payload['source'] ) ? sanitize_text_field( (string) $payload['source'] ) : 'mcp';
			$html     = isset( $payload['html'] ) ? (string) $payload['html'] : '';
			$css      = isset( $payload['css'] ) ? (string) $payload['css'] : '';
			$js       = isset( $payload['js'] ) ? (string) $payload['js'] : '';
			$page_css = isset( $payload['page_css'] ) ? (string) $payload['page_css'] : '';
			$page_js  = isset( $payload['page_js'] ) ? (string) $payload['page_js'] : '';
			$site_css = isset( $payload['site_css'] ) ? (string) $payload['site_css'] : '';
			$site_js  = isset( $payload['site_js'] ) ? (string) $payload['site_js'] : '';

			if ( '' === trim( $html ) && '' === trim( $css ) && '' === trim( $js ) ) {
				return new \WP_Error( 'uich_empty_section', 'At least one of html, css, or js must be provided.' );
			}

			// Upload any external images embedded in the HTML (only when explicitly requested).
			$upload_images = isset( $payload['upload_images'] ) ? (bool) $payload['upload_images'] : true;
			if ( $upload_images ) {
				$media_result = self::mcp_upload_html_images_to_media_library( $html, $css );
				$html         = $media_result['html'];
				if ( isset( $media_result['css'] ) ) {
					$css = (string) $media_result['css'];
				}
			} else {
				$media_result = array( 'html' => $html, 'uploaded' => array(), 'failed' => array() );
			}

			$globals_prepared = self::mcp_prepare_import_html_css_with_globals( $html, $css );
			$html             = $globals_prepared['html'];
			$css              = $globals_prepared['css'];

			// Persist site-level CSS/JS to global option.
			self::mcp_append_site_custom_code( $site_css, $site_js );

			// Read the existing Elementor data.
			$elementor_data_raw = get_post_meta( $post_id, '_elementor_data', true );
			if ( ! is_string( $elementor_data_raw ) || '' === $elementor_data_raw ) {
				return new \WP_Error( 'uich_missing_elementor_data', 'No Elementor data found on the provided post.' );
			}

			$elements = json_decode( $elementor_data_raw, true );
			if ( ! is_array( $elements ) ) {
				return new \WP_Error( 'uich_invalid_elementor_data', 'Elementor data is not valid JSON.' );
			}

			// Build the new widget element.
			$widget_id       = strtolower( wp_generate_password( 7, false, false ) );
			$widget_settings = array(
				'_title'   => $label,
				'raw_html' => self::build_mcp_tagged_code_block( 'html', $html, $source, $label ),
				'raw_css'  => self::build_mcp_tagged_code_block( 'css', $css, $source, $label ),
				'raw_js'   => self::build_mcp_tagged_code_block( 'js', $js, $source, $label ),
			);
			$page_css_trim = trim( (string) $page_css );
			$page_js_trim  = trim( (string) $page_js );
			if ( '' !== $page_css_trim || '' !== $page_js_trim ) {
				$merged_into_first = self::mcp_merge_page_custom_code_into_first_widget( $elements, $page_css_trim, $page_js_trim );
				if ( ! $merged_into_first ) {
					if ( '' !== $page_css_trim ) {
						$widget_settings['page_custom_code_head'] = self::mcp_ensure_style_tag( $page_css_trim );
					}
					if ( '' !== $page_js_trim ) {
						$widget_settings['page_custom_code_footer'] = self::mcp_ensure_script_tag( $page_js_trim );
					}
				}
			}
			$new_widget = array(
				'id'         => $widget_id,
				'elType'     => 'widget',
				'widgetType' => 'proton',
				'settings'   => $widget_settings,
				'elements'   => array(),
			);

			// Append into the same outer container that already holds Proton sections
			// (depth-first: supports section/column wrappers from other Elementor layouts).
			$container_id = '';
			$appended     = self::mcp_append_widget_to_section_container( $elements, $new_widget, $container_id );

			if ( ! $appended ) {
				$container_id = strtolower( wp_generate_password( 7, false, false ) );
				$elements[]   = array(
					'id'       => $container_id,
					'elType'   => 'container',
					'isInner'  => false,
					'settings' => self::mcp_widget_container_default_settings(),
					'elements' => array( $new_widget ),
				);
			}

			self::mcp_sync_page_custom_code_across_widgets( $elements );

			$document = \Elementor\Plugin::$instance->documents->get_doc_or_auto_save( $post_id );
			if ( $document ) {
				try {
					$document->save(
						array(
							'elements' => $elements,
						)
					);
				} catch ( \Throwable $e ) {
					// Meta write below still applies structure.
				}
			}

			// Persist and clear cache.
			update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );

			if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			return array(
				'post_id'        => $post_id,
				'widget_id'      => $widget_id,
				'container_id'   => $container_id,
				'label'          => $label,
				'appended'       => $appended,
				'edit_link'      => get_edit_post_link( $post_id, 'internal' ),
				'elementor_link' => add_query_arg(
					array(
						'post'   => $post_id,
						'action' => 'elementor',
					),
					admin_url( 'post.php' )
				),
				'preview_link'   => get_permalink( $post_id ),
				'image_uploads'  => $media_result['uploaded'],
				'image_failures' => $media_result['failed'],
				'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
				'message'        => "Section \"{$label}\" appended to page {$post_id}.",
			);
		}

		// ============================================================
		// MCP — SECTION READ / WRITE / INSERT BY INDEX
		// ============================================================

		/**
		 * Recursively collect all proton widgets from an Elementor element tree.
		 *
		 * @param array  $elements Elementor elements (top-level array from _elementor_data).
		 * @param array &$widgets  Accumulated widget elements (passed by reference).
		 */
		private static function collect_uichemy_composer_widgets( array $elements, array &$widgets ) {
			foreach ( $elements as $el ) {
				if ( ! is_array( $el ) ) {
					continue;
				}
				if ( isset( $el['elType'] ) && 'widget' === $el['elType']
					&& isset( $el['widgetType'] ) && 'proton' === $el['widgetType'] ) {
					$widgets[] = $el;
				}
				if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
					self::collect_uichemy_composer_widgets( $el['elements'], $widgets );
				}
			}
		}

		/**
		 * MCP — get the HTML/CSS/JS from a specific Proton widget by 0-based index.
		 *
		 * @param int $post_id      Post ID.
		 * @param int $widget_index 0-based index among all proton widgets on the page.
		 * @return array|\WP_Error
		 */
		public static function mcp_get_section_code( $post_id, $widget_index = 0 ) {
			$post_id      = absint( $post_id );
			$widget_index = (int) $widget_index;
			if ( ! $post_id ) {
				return new \WP_Error( 'uich_invalid_post_id', 'Invalid post_id.' );
			}

			$raw = get_post_meta( $post_id, '_elementor_data', true );
			if ( ! is_string( $raw ) || '' === $raw ) {
				return new \WP_Error( 'uich_missing_elementor_data', 'No Elementor data found for this post.' );
			}

			$elements = json_decode( $raw, true );
			if ( ! is_array( $elements ) ) {
				return new \WP_Error( 'uich_invalid_elementor_data', 'Elementor data is not valid JSON.' );
			}

			$widgets = array();
			self::collect_uichemy_composer_widgets( $elements, $widgets );

			if ( empty( $widgets ) ) {
				return new \WP_Error( 'uich_no_widgets', 'No Proton widgets found on this post.' );
			}

			$total = count( $widgets );
			if ( $widget_index < 0 || $widget_index >= $total ) {
				return new \WP_Error(
					'uich_invalid_widget_index',
					"widget_index {$widget_index} is out of range — found {$total} widget(s) (indices 0–" . ( $total - 1 ) . ').'
				);
			}

			$widget   = $widgets[ $widget_index ];
			$settings = isset( $widget['settings'] ) && is_array( $widget['settings'] ) ? $widget['settings'] : array();

			return array(
				'post_id'       => $post_id,
				'widget_id'     => isset( $widget['id'] ) ? (string) $widget['id'] : '',
				'widget_index'  => $widget_index,
				'total_widgets' => $total,
				'label'         => isset( $settings['_title'] ) ? (string) $settings['_title'] : '',
				'html'          => isset( $settings['raw_html'] ) ? (string) $settings['raw_html'] : '',
				'css'           => isset( $settings['raw_css'] ) ? (string) $settings['raw_css'] : '',
				'js'            => isset( $settings['raw_js'] ) ? (string) $settings['raw_js'] : '',
			);
		}

		/**
		 * Recursively find the first container that holds proton widgets (or is empty)
		 * and insert a new widget element at the given 0-based index within it.
		 *
		 * @param array  &$elements    Elementor elements (by reference).
		 * @param array   $new_widget  Widget element to insert.
		 * @param int     $index       Target 0-based position (clamped to valid range).
		 * @param bool   &$inserted    Set to true once inserted.
		 * @param string &$container_id Set to the container id when found.
		 */
		private static function insert_widget_at_index_in_container( array &$elements, array $new_widget, $index, &$inserted, &$container_id ) {
			foreach ( $elements as &$el ) {
				if ( ! is_array( $el ) || ! isset( $el['elType'] ) ) {
					continue;
				}
				if ( 'container' === $el['elType'] ) {
					$children    = isset( $el['elements'] ) && is_array( $el['elements'] ) ? $el['elements'] : array();
					$has_uichemy = false;
					foreach ( $children as $child ) {
						if ( is_array( $child ) && isset( $child['widgetType'] ) && 'proton' === $child['widgetType'] ) {
							$has_uichemy = true;
							break;
						}
					}
					if ( $has_uichemy || empty( $children ) ) {
						if ( ! isset( $el['elements'] ) || ! is_array( $el['elements'] ) ) {
							$el['elements'] = array();
						}
						$clamped      = max( 0, min( $index, count( $el['elements'] ) ) );
						array_splice( $el['elements'], $clamped, 0, array( $new_widget ) );
						$container_id = isset( $el['id'] ) ? (string) $el['id'] : '';
						$inserted     = true;
						unset( $el );
						return;
					}
				}
				if ( ! $inserted && ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
					self::insert_widget_at_index_in_container( $el['elements'], $new_widget, $index, $inserted, $container_id );
					if ( $inserted ) {
						unset( $el );
						return;
					}
				}
			}
			unset( $el );
		}

		/**
		 * MCP — insert a new Proton widget at a specific 0-based index within the page
		 * layout. Unlike mcp_add_section_to_page (always appends), this allows precise positioning.
		 *
		 * Payload keys: post_id, insert_index, label, html, css, js, source, upload_images.
		 *
		 * @param array $payload
		 * @return array|\WP_Error
		 */
		public static function mcp_insert_section_at_index( $payload ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new \WP_Error( 'uich_elementor_missing', 'Elementor is not active.' );
			}

			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$post_id       = isset( $payload['post_id'] ) ? absint( $payload['post_id'] ) : 0;
			$insert_index  = isset( $payload['insert_index'] ) ? (int) $payload['insert_index'] : 0;
			$label         = isset( $payload['label'] ) ? sanitize_text_field( (string) $payload['label'] ) : 'Section';
			$source        = isset( $payload['source'] ) ? sanitize_text_field( (string) $payload['source'] ) : 'mcp';
			$html          = isset( $payload['html'] ) ? (string) $payload['html'] : '';
			$css           = isset( $payload['css'] ) ? (string) $payload['css'] : '';
			$js            = isset( $payload['js'] ) ? (string) $payload['js'] : '';
			$upload_images = isset( $payload['upload_images'] ) ? (bool) $payload['upload_images'] : true;

			if ( ! $post_id ) {
				return new \WP_Error( 'uich_invalid_post_id', 'Invalid post_id.' );
			}
			if ( '' === trim( $html ) && '' === trim( $css ) ) {
				return new \WP_Error( 'uich_empty_generated_code', 'At least html or css must be provided.' );
			}

			// Upload images
			if ( $upload_images && '' !== trim( $html ) ) {
				$media_result = self::mcp_upload_html_images_to_media_library( $html, $css );
				$html         = $media_result['html'];
				if ( isset( $media_result['css'] ) ) {
					$css = (string) $media_result['css'];
				}
			} else {
				$media_result = array( 'uploaded' => array(), 'failed' => array() );
			}

			// Apply globals matching
			$globals_prepared = self::mcp_prepare_import_html_css_with_globals( $html, $css );
			$html = $globals_prepared['html'];
			$css  = $globals_prepared['css'];

			// Read existing Elementor data
			$raw = get_post_meta( $post_id, '_elementor_data', true );
			if ( ! is_string( $raw ) || '' === $raw ) {
				return new \WP_Error( 'uich_missing_elementor_data', 'No Elementor data found for this post.' );
			}
			$elements = json_decode( $raw, true );
			if ( ! is_array( $elements ) ) {
				return new \WP_Error( 'uich_invalid_elementor_data', 'Elementor data is not valid JSON.' );
			}

			// Build new widget element
			$widget_id  = strtolower( wp_generate_password( 7, false, false ) );
			$new_widget = array(
				'id'         => $widget_id,
				'elType'     => 'widget',
				'widgetType' => 'proton',
				'settings'   => array(
					'_title'   => $label,
					'raw_html' => self::build_mcp_tagged_code_block( 'html', $html, $source, $label ),
					'raw_css'  => self::build_mcp_tagged_code_block( 'css', $css, $source, $label ),
					'raw_js'   => self::build_mcp_tagged_code_block( 'js', $js, $source, $label ),
				),
				'elements'   => array(),
			);

			// Insert into the existing proton container at the requested index
			$inserted     = false;
			$container_id = '';
			self::insert_widget_at_index_in_container( $elements, $new_widget, $insert_index, $inserted, $container_id );

			if ( ! $inserted ) {
				// No suitable container found — create a new top-level container with the widget
				$container_id  = strtolower( wp_generate_password( 7, false, false ) );
				$new_container = array(
					'id'       => $container_id,
					'elType'   => 'container',
					'isInner'  => false,
					'settings' => self::mcp_widget_container_default_settings(),
					'elements' => array( $new_widget ),
				);
				$clamped = max( 0, min( $insert_index, count( $elements ) ) );
				array_splice( $elements, $clamped, 0, array( $new_container ) );
			}

			// Save via Elementor document API (with direct meta fallback)
			$document = \Elementor\Plugin::$instance->documents->get_doc_or_auto_save( $post_id );
			if ( $document ) {
				try {
					$document->save( array( 'elements' => $elements ) );
				} catch ( \Throwable $e ) {
					// Meta write below still applies structure.
				}
			}

			update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );

			if ( isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			return array(
				'post_id'                 => $post_id,
				'widget_id'               => $widget_id,
				'container_id'            => $container_id,
				'insert_index'            => $insert_index,
				'label'                   => $label,
				'edit_link'               => get_edit_post_link( $post_id, 'internal' ),
				'elementor_link'          => add_query_arg(
					array(
						'post'   => $post_id,
						'action' => 'elementor',
					),
					admin_url( 'post.php' )
				),
				'preview_link'            => get_permalink( $post_id ),
				'image_uploads'           => $media_result['uploaded'],
				'image_failures'          => $media_result['failed'],
				'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
				'message'                 => "Section \"{$label}\" inserted at index {$insert_index} on page {$post_id}.",
			);
		}

		/**
		 * Resolve a single external image URL via the media library, with de-dupe cache + logs.
		 *
		 * @param string              $original_url Original URL.
		 * @param array<string,string> $url_cache    Map original → resolved (by ref).
		 * @param array<int,array<string,string>> $uploaded Successful uploads (by ref).
		 * @param array<int,array<string,string>> $failed   Failures (by ref).
		 * @return string Resolved URL (may equal original on failure).
		 */
		private static function mcp_resolve_external_image_url_for_mcp_import( $original_url, array &$url_cache, array &$uploaded, array &$failed ) {
			$original_url = html_entity_decode( trim( (string) $original_url ), ENT_QUOTES, 'UTF-8' );
			if ( '' === $original_url ) {
				return '';
			}

			if ( isset( $url_cache[ $original_url ] ) ) {
				return $url_cache[ $original_url ];
			}

			$uploaded_url = self::mcp_sideload_image_from_url( $original_url );
			if ( is_wp_error( $uploaded_url ) ) {
				$url_cache[ $original_url ] = $original_url;
				$failed[]                   = array(
					'from'  => $original_url,
					'error' => $uploaded_url->get_error_message(),
				);
				return $original_url;
			}

			$url_cache[ $original_url ] = $uploaded_url;
			if ( $uploaded_url !== $original_url ) {
				$uploaded[] = array(
					'from' => $original_url,
					'to'   => $uploaded_url,
				);
			}

			return $uploaded_url;
		}

		/**
		 * Rewrite url(...) references inside arbitrary CSS text (widget CSS, inline styles).
		 *
		 * @param string   $css          CSS fragment.
		 * @param array    $url_cache    URL cache (by ref).
		 * @param array    $uploaded     Upload log (by ref).
		 * @param array    $failed       Failure log (by ref).
		 * @return string Rewritten CSS.
		 */
		private static function mcp_rewrite_css_url_functions_with_sideload( $css, array &$url_cache, array &$uploaded, array &$failed ) {
			$css = (string) $css;
			if ( '' === trim( $css ) || ! preg_match( '/\burl\s*\(/i', $css ) ) {
				return $css;
			}

			return (string) preg_replace_callback(
				'/\burl\s*\(\s*([\'"]?)([^\'"()]+)\1\s*\)/i',
				function ( $m ) use ( &$url_cache, &$uploaded, &$failed ) {
					$raw = isset( $m[2] ) ? trim( (string) $m[2] ) : '';
					if ( '' === $raw || 0 === preg_match( '#^https?://#i', $raw ) ) {
						return $m[0];
					}
					$next = self::mcp_resolve_external_image_url_for_mcp_import( $raw, $url_cache, $uploaded, $failed );
					$q    = isset( $m[1] ) ? (string) $m[1] : '';
					return 'url(' . $q . $next . $q . ')';
				},
				$css
			);
		}

		/**
		 * Upload externally referenced images to the media library and rewrite URLs in HTML and optional CSS.
		 *
		 * Supports: `<img src>`, `srcset` on `<img>` / `<source>`, `style="... url(https://...) ..."`,
		 * and `url(...)` inside widget CSS (covers Figma `background-image` exports).
		 *
		 * @param string      $html Raw HTML.
		 * @param string|null $css  Optional widget CSS to rewrite; pass null to skip CSS (legacy callers).
		 * @return array<string,mixed> Keys: html, uploaded, failed, and `css` when $css was a string.
		 */
		private static function mcp_upload_html_images_to_media_library( $html, $css = null ) {
			$html = (string) $html;
			$process_css = null !== $css && is_string( $css );
			$css_in      = $process_css ? (string) $css : '';

			$result = array(
				'html'     => $html,
				'uploaded' => array(),
				'failed'   => array(),
			);
			if ( $process_css ) {
				$result['css'] = $css_in;
			}

			if ( '' === trim( $html ) && '' === trim( $css_in ) ) {
				return $result;
			}

			$needs_dom = ( '' !== trim( $html ) ) && (
				false !== stripos( $html, '<img' )
				|| false !== stripos( $html, 'srcset=' )
				|| false !== stripos( $html, 'style=' )
			);
			if ( ! $needs_dom && ( ! $process_css || ! preg_match( '/\burl\s*\(/i', $css_in ) ) ) {
				return $result;
			}

			if ( $needs_dom && ( ! class_exists( '\DOMDocument' ) || ! class_exists( '\DOMXPath' ) ) ) {
				if ( $process_css && preg_match( '/\burl\s*\(/i', $css_in ) ) {
					$url_cache  = array();
					$uploaded   = array();
					$failed     = array();
					$result['css'] = self::mcp_rewrite_css_url_functions_with_sideload( $css_in, $url_cache, $uploaded, $failed );
					$result['uploaded'] = array_values( array_unique( $uploaded, SORT_REGULAR ) );
					$result['failed']   = array_values( array_unique( $failed, SORT_REGULAR ) );
				}
				return $result;
			}

			$url_cache = array();
			$uploaded  = array();
			$failed    = array();

			$resolve_url = function ( $original_url ) use ( &$url_cache, &$uploaded, &$failed ) {
				return self::mcp_resolve_external_image_url_for_mcp_import( $original_url, $url_cache, $uploaded, $failed );
			};

			if ( '' !== trim( $html ) && $needs_dom ) {
				$doc = new \DOMDocument();
				$libxml_previous = libxml_use_internal_errors( true );
				$loaded = $doc->loadHTML(
					'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' . $html . '</body></html>',
					LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
				);
				libxml_clear_errors();
				libxml_use_internal_errors( $libxml_previous );

				if ( $loaded ) {
					$img_nodes = $doc->getElementsByTagName( 'img' );
					foreach ( $img_nodes as $img_node ) {
						if ( ! $img_node->hasAttribute( 'src' ) ) {
							continue;
						}
						$src_url  = $img_node->getAttribute( 'src' );
						$next_src = $resolve_url( $src_url );
						if ( '' !== $next_src ) {
							$img_node->setAttribute( 'src', $next_src );
						}
					}

					$xpath = new \DOMXPath( $doc );
					$srcset_nodes = $xpath->query( '//*[@srcset]' );
					if ( $srcset_nodes instanceof \DOMNodeList ) {
						foreach ( $srcset_nodes as $node ) {
							if ( ! ( $node instanceof \DOMElement ) ) {
								continue;
							}
							$srcset      = $node->getAttribute( 'srcset' );
							$next_srcset = self::mcp_rewrite_srcset_with_uploaded_images( $srcset, $resolve_url );
							$node->setAttribute( 'srcset', $next_srcset );
						}
					}

					$styled = $xpath->query( '//*[@style]' );
					if ( $styled instanceof \DOMNodeList ) {
						foreach ( $styled as $node ) {
							if ( ! ( $node instanceof \DOMElement ) ) {
								continue;
							}
							$style_val = (string) $node->getAttribute( 'style' );
							if ( '' === $style_val || false === stripos( $style_val, 'url(' ) ) {
								continue;
							}
							$next_style = self::mcp_rewrite_css_url_functions_with_sideload( $style_val, $url_cache, $uploaded, $failed );
							$node->setAttribute( 'style', $next_style );
						}
					}

					$body = $doc->getElementsByTagName( 'body' )->item( 0 );
					if ( $body ) {
						$rewritten_html = '';
						foreach ( $body->childNodes as $child ) {
							$rewritten_html .= $doc->saveHTML( $child );
						}
						$result['html'] = $rewritten_html;
					}
				}
			}

			if ( $process_css && '' !== trim( $css_in ) ) {
				$result['css'] = self::mcp_rewrite_css_url_functions_with_sideload( $css_in, $url_cache, $uploaded, $failed );
			}

			$result['uploaded'] = array_values( array_unique( $uploaded, SORT_REGULAR ) );
			$result['failed']   = array_values( array_unique( $failed, SORT_REGULAR ) );

			return $result;
		}

		/**
		 * Rewrite each URL candidate in an srcset string.
		 *
		 * @param string   $srcset      Raw srcset value.
		 * @param callable $resolve_url URL resolver callback.
		 * @return string
		 */
		private static function mcp_rewrite_srcset_with_uploaded_images( $srcset, $resolve_url ) {
			$srcset = (string) $srcset;
			if ( '' === trim( $srcset ) ) {
				return $srcset;
			}

			$parts = preg_split( '/\s*,\s*/', $srcset );
			if ( ! is_array( $parts ) ) {
				return $srcset;
			}

			$rewritten = array();
			foreach ( $parts as $part ) {
				$part = trim( (string) $part );
				if ( '' === $part ) {
					continue;
				}

				$candidate = preg_split( '/\s+/', $part, 2 );
				$url = isset( $candidate[0] ) ? (string) $candidate[0] : '';
				$descriptor = isset( $candidate[1] ) ? (string) $candidate[1] : '';
				$next_url = call_user_func( $resolve_url, $url );

				$rewritten[] = '' !== $descriptor ? $next_url . ' ' . $descriptor : $next_url;
			}

			return implode( ', ', $rewritten );
		}

		/**
		 * Sideload a single image URL into WordPress media library.
		 *
		 * @param string $url Image URL.
		 * @return string|\WP_Error Uploaded URL or error.
		 */
		private static function mcp_sideload_image_from_url( $url ) {
			$url = html_entity_decode( trim( (string) $url ), ENT_QUOTES, 'UTF-8' );
			self::mcp_image_import_debug_log( 'sideload:start', array( 'url' => $url ) );
			if ( '' === $url ) {
				self::mcp_image_import_debug_log( 'sideload:skip_empty_url' );
				return new \WP_Error( 'uich_empty_image_url', 'Image URL is empty.' );
			}

			if ( 0 === strpos( $url, 'data:' ) || 0 === strpos( $url, 'blob:' ) || 0 === strpos( $url, 'javascript:' ) ) {
				self::mcp_image_import_debug_log( 'sideload:skip_scheme', array( 'url' => $url ) );
				return new \WP_Error( 'uich_unsupported_image_url', 'Image URL scheme is not supported for upload.' );
			}

			if ( 0 === strpos( $url, '//' ) ) {
				$url = ( is_ssl() ? 'https:' : 'http:' ) . $url;
			}

			if ( 0 === strpos( $url, '/' ) ) {
				$url = home_url( $url );
			}

			if ( ! wp_http_validate_url( $url ) ) {
				self::mcp_image_import_debug_log( 'sideload:invalid_url', array( 'url' => $url ) );
				return new \WP_Error( 'uich_invalid_image_url', 'Image URL is invalid.' );
			}

			$existing_by_source = self::mcp_find_existing_attachment_by_source_url( $url );
			if ( $existing_by_source ) {
				$existing_by_source_url = wp_get_attachment_url( $existing_by_source );
				if ( $existing_by_source_url ) {
					self::mcp_image_import_debug_log( 'sideload:reuse_source_map', array(
						'url' => $url,
						'attachment_id' => (int) $existing_by_source,
						'attachment_url' => $existing_by_source_url,
					) );
					return esc_url_raw( $existing_by_source_url );
				}
			}

			$existing_attachment_id = attachment_url_to_postid( $url );
			if ( $existing_attachment_id ) {
				$existing_url = wp_get_attachment_url( $existing_attachment_id );
				if ( $existing_url ) {
					self::mcp_image_import_debug_log( 'sideload:reuse_existing_attachment_url', array(
						'url' => $url,
						'attachment_id' => (int) $existing_attachment_id,
						'attachment_url' => $existing_url,
					) );
					return $existing_url;
				}
			}

			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';

			$uploaded_url = media_sideload_image( $url, 0, null, 'src' );
			if ( is_wp_error( $uploaded_url ) ) {
				self::mcp_image_import_debug_log( 'sideload:media_sideload_failed', array(
					'url' => $url,
					'error' => $uploaded_url->get_error_message(),
				) );
				$fallback_uploaded_url = self::mcp_sideload_image_from_url_fallback( $url );
				if ( ! is_wp_error( $fallback_uploaded_url ) ) {
					self::mcp_image_import_debug_log( 'sideload:fallback_success', array(
						'url' => $url,
						'uploaded_url' => $fallback_uploaded_url,
					) );
					return esc_url_raw( $fallback_uploaded_url );
				}
				self::mcp_image_import_debug_log( 'sideload:fallback_failed', array(
					'url' => $url,
					'error' => $fallback_uploaded_url->get_error_message(),
				) );
				return $fallback_uploaded_url;
			}
			$uploaded_attachment_id = self::mcp_find_existing_attachment_by_meta_value( '_source_url', self::mcp_normalize_source_image_url( $url ) );
			if ( ! $uploaded_attachment_id ) {
				$uploaded_attachment_id = attachment_url_to_postid( $uploaded_url );
			}
			if ( $uploaded_attachment_id ) {
				self::mcp_mark_attachment_source_url( $uploaded_attachment_id, $url );
			}
			self::mcp_image_import_debug_log( 'sideload:success', array(
				'url' => $url,
				'uploaded_url' => $uploaded_url,
				'attachment_id' => (int) $uploaded_attachment_id,
			) );

			return esc_url_raw( $uploaded_url );
		}

		/**
		 * Fallback sideload for extension-less image URLs (e.g. Figma MCP assets).
		 *
		 * @param string $url Source image URL.
		 * @return string|\WP_Error Uploaded attachment URL or error.
		 */
		private static function mcp_sideload_image_from_url_fallback( $url ) {
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';

			$temp_file = download_url( $url, 60 );
			if ( is_wp_error( $temp_file ) ) {
				self::mcp_image_import_debug_log( 'fallback:download_failed', array(
					'url' => $url,
					'error' => $temp_file->get_error_message(),
				) );
				return $temp_file;
			}

			$path_name = (string) wp_parse_url( $url, PHP_URL_PATH );
			$base_name = sanitize_file_name( wp_basename( $path_name ) );
			if ( '' === $base_name || '.' === $base_name || '..' === $base_name ) {
				$base_name = 'uichemy-mcp-image';
			}

			$image_mime = self::mcp_detect_downloaded_image_mime( $temp_file, $base_name );
			$mime_to_ext = array(
				'image/jpeg'    => 'jpg',
				'image/jpg'     => 'jpg',
				'image/png'     => 'png',
				'image/gif'     => 'gif',
				'image/webp'    => 'webp',
				'image/svg+xml' => 'svg',
				'image/bmp'     => 'bmp',
				'image/x-icon'  => 'ico',
				'image/vnd.microsoft.icon' => 'ico',
			);

			$current_ext = strtolower( (string) pathinfo( $base_name, PATHINFO_EXTENSION ) );
			if ( '' === $current_ext && isset( $mime_to_ext[ $image_mime ] ) ) {
				$base_name .= '.' . $mime_to_ext[ $image_mime ];
			}

			if ( '' === strtolower( (string) pathinfo( $base_name, PATHINFO_EXTENSION ) ) ) {
				$base_name .= '.jpg';
			}
			self::mcp_image_import_debug_log( 'fallback:prepared_file', array(
				'url' => $url,
				'mime' => $image_mime,
				'name' => $base_name,
			) );

			$file_array = array(
				'name'     => $base_name,
				'tmp_name' => $temp_file,
			);
			if ( $image_mime ) {
				$file_array['type'] = $image_mime;
			}

			$svg_mime_filter = null;
			if ( 'image/svg+xml' === $image_mime ) {
				$svg_mime_filter = array( __CLASS__, 'mcp_allow_svg_upload_mimes' );
				add_filter( 'upload_mimes', $svg_mime_filter, 99 );
			}

			try {
				$attachment_id = media_handle_sideload( $file_array, 0 );
			} finally {
				if ( $svg_mime_filter ) {
					remove_filter( 'upload_mimes', $svg_mime_filter, 99 );
				}
			}

			if ( is_wp_error( $attachment_id ) ) {
				@unlink( $temp_file );
				self::mcp_image_import_debug_log( 'fallback:media_handle_failed', array(
					'url' => $url,
					'mime' => $image_mime,
					'name' => $base_name,
					'allowed_svg' => (bool) self::mcp_is_svg_upload_allowed(),
					'error' => $attachment_id->get_error_message(),
				) );
				return $attachment_id;
			}

			$attachment_url = wp_get_attachment_url( $attachment_id );
			if ( ! $attachment_url ) {
				self::mcp_image_import_debug_log( 'fallback:no_attachment_url', array(
					'url' => $url,
					'attachment_id' => (int) $attachment_id,
				) );
				return new \WP_Error( 'uich_sideload_fallback_no_url', 'Image uploaded but attachment URL could not be resolved.' );
			}

			self::mcp_mark_attachment_source_url( (int) $attachment_id, $url );
			self::mcp_image_import_debug_log( 'fallback:success', array(
				'url' => $url,
				'attachment_id' => (int) $attachment_id,
				'attachment_url' => $attachment_url,
				'mime' => $image_mime,
			) );

			return esc_url_raw( $attachment_url );
		}

		/**
		 * Detect MIME for downloaded images including SVG.
		 *
		 * @param string $temp_file Downloaded temp file path.
		 * @param string $base_name Candidate filename.
		 * @return string
		 */
		private static function mcp_detect_downloaded_image_mime( $temp_file, $base_name = '' ) {
			$temp_file = (string) $temp_file;
			$base_name = strtolower( (string) $base_name );
			if ( '' === $temp_file ) {
				return '';
			}

			// getimagesize handles raster formats, but often misses SVG.
			$image_meta = @getimagesize( $temp_file );
			if ( is_array( $image_meta ) && ! empty( $image_meta['mime'] ) ) {
				return strtolower( (string) $image_meta['mime'] );
			}

			// finfo fallback.
			if ( function_exists( 'finfo_open' ) ) {
				$finfo = @finfo_open( FILEINFO_MIME_TYPE );
				if ( $finfo ) {
					$mime = @finfo_file( $finfo, $temp_file );
					@finfo_close( $finfo );
					if ( is_string( $mime ) && '' !== trim( $mime ) ) {
						$mime = strtolower( trim( $mime ) );
						// Some systems report SVG as text/plain or text/xml.
						if ( 'text/plain' !== $mime && 'text/xml' !== $mime ) {
							return $mime;
						}
					}
				}
			}

			// SVG sniff fallback by content and filename hint.
			$snippet = @file_get_contents( $temp_file, false, null, 0, 1024 );
			$snippet = is_string( $snippet ) ? strtolower( $snippet ) : '';
			if ( false !== strpos( $base_name, '.svg' ) || false !== strpos( $snippet, '<svg' ) ) {
				return 'image/svg+xml';
			}

			return '';
		}

		/**
		 * Check whether SVG uploads are allowed on this site.
		 *
		 * @return bool
		 */
		private static function mcp_is_svg_upload_allowed() {
			$allowed = get_allowed_mime_types();
			foreach ( $allowed as $ext => $mime ) {
				if ( 'image/svg+xml' === $mime && false !== strpos( (string) $ext, 'svg' ) ) {
					return true;
				}
			}
			return false;
		}

		/**
		 * Temporarily allow SVG uploads for trusted MCP sideloads.
		 *
		 * @param array<string, string> $mimes Allowed mime types.
		 * @return array<string, string>
		 */
		public static function mcp_allow_svg_upload_mimes( $mimes ) {
			if ( is_array( $mimes ) ) {
				$mimes['svg'] = 'image/svg+xml';
			}

			return $mimes;
		}

		/**
		 * Find an existing attachment ID by previously recorded source URL hash.
		 *
		 * @param string $url Source URL.
		 * @return int Attachment ID or 0.
		 */
		private static function mcp_find_existing_attachment_by_source_url( $url ) {
			$normalized_url = self::mcp_normalize_source_image_url( $url );
			if ( '' === $normalized_url ) {
				return 0;
			}

			$existing_by_wp_source = self::mcp_find_existing_attachment_by_meta_value( '_source_url', $normalized_url );
			if ( $existing_by_wp_source ) {
				return $existing_by_wp_source;
			}

			$existing_by_custom_url = self::mcp_find_existing_attachment_by_meta_value( '_uich_mcp_source_image_url', $normalized_url );
			if ( $existing_by_custom_url ) {
				return $existing_by_custom_url;
			}

			$source_hash = md5( $normalized_url );
			return self::mcp_find_existing_attachment_by_meta_value( '_uich_mcp_source_image_hash', $source_hash );
		}

		/**
		 * Persist source URL mapping metadata on uploaded attachment.
		 *
		 * @param int    $attachment_id  Attachment ID.
		 * @param string $source_url     Original source URL.
		 * @return void
		 */
		private static function mcp_mark_attachment_source_url( $attachment_id, $source_url ) {
			$attachment_id = absint( $attachment_id );
			$source_url    = self::mcp_normalize_source_image_url( $source_url );
			if ( ! $attachment_id || '' === $source_url ) {
				return;
			}

			update_post_meta( $attachment_id, '_source_url', $source_url );
			update_post_meta( $attachment_id, '_uich_mcp_source_image_url', $source_url );
			update_post_meta( $attachment_id, '_uich_mcp_source_image_hash', md5( $source_url ) );
		}

		/**
		 * Find one attachment ID by exact post meta key/value.
		 *
		 * @param string $meta_key   Meta key.
		 * @param string $meta_value Meta value.
		 * @return int
		 */
		private static function mcp_find_existing_attachment_by_meta_value( $meta_key, $meta_value ) {
			$meta_key   = (string) $meta_key;
			$meta_value = (string) $meta_value;
			if ( '' === $meta_key || '' === $meta_value ) {
				return 0;
			}

			$attachment_posts = get_posts(
				array(
					'post_type'      => 'attachment',
					'post_status'    => 'inherit',
					'posts_per_page' => 1,
					'fields'         => 'ids',
					'meta_key'       => $meta_key,
					'meta_value'     => $meta_value,
					'orderby'        => 'ID',
					'order'          => 'DESC',
					'no_found_rows'  => true,
				)
			);

			if ( empty( $attachment_posts ) || ! isset( $attachment_posts[0] ) ) {
				return 0;
			}

			return absint( $attachment_posts[0] );
		}

		/**
		 * Normalize source image URL to keep dedupe keys consistent.
		 *
		 * @param string $url Raw URL.
		 * @return string
		 */
		private static function mcp_normalize_source_image_url( $url ) {
			$url = html_entity_decode( trim( (string) $url ), ENT_QUOTES, 'UTF-8' );
			if ( '' === $url ) {
				return '';
			}

			if ( 0 === strpos( $url, '//' ) ) {
				$url = ( is_ssl() ? 'https:' : 'http:' ) . $url;
			}

			if ( 0 === strpos( $url, '/' ) ) {
				$url = home_url( $url );
			}

			return esc_url_raw( $url );
		}

		/**
		 * Debug logger for MCP image import.
		 *
		 * @param string $event   Event key.
		 * @param array  $context Optional context.
		 * @return void
		 */
		private static function mcp_image_import_debug_log( $event, $context = array() ) {
			$event = (string) $event;
			$context = is_array( $context ) ? $context : array();
			$line = '[Protuno MCP Image] ' . $event;
			if ( ! empty( $context ) ) {
				$line .= ' ' . wp_json_encode( $context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
			}
			error_log( $line );
		}

		/**
		 * Apply tagged generated code to the first matching Proton widget.
		 *
		 * @param array $elements Elementor elements tree.
		 * @param array $payload  Tagged payload.
		 * @return array<string, mixed>
		 */
		private static function apply_mcp_generated_code_to_elements( &$elements, $payload ) {
			$result = array(
				'updated'        => false,
				'widget_id'      => '',
				'matched_by'     => '',
				'updated_fields' => array(),
				'message'        => 'No Proton widget found on this post.',
			);

			if ( ! is_array( $elements ) ) {
				$result['message'] = 'Elementor elements are invalid.';
				return $result;
			}

			$target_widget_id = isset( $payload['widget_id'] ) ? (string) $payload['widget_id'] : '';
			$mode             = isset( $payload['mode'] ) ? (string) $payload['mode'] : 'replace';
			$mode             = in_array( $mode, array( 'replace', 'append' ), true ) ? $mode : 'replace';

			foreach ( $elements as &$element ) {
				if ( ! is_array( $element ) ) {
					continue;
				}

				$el_type     = isset( $element['elType'] ) ? (string) $element['elType'] : '';
				$widget_type = isset( $element['widgetType'] ) ? (string) $element['widgetType'] : '';
				$element_id  = isset( $element['id'] ) ? (string) $element['id'] : '';

				if ( 'widget' === $el_type && 'proton' === $widget_type ) {
					$id_matches = '' !== $target_widget_id && $target_widget_id === $element_id;
					$first_hit  = '' === $target_widget_id;

					if ( $id_matches || $first_hit ) {
						if ( ! isset( $element['settings'] ) || ! is_array( $element['settings'] ) ) {
							$element['settings'] = array();
						}

						$fields = array(
							'raw_html' => isset( $payload['html'] ) ? (string) $payload['html'] : '',
							'raw_css'  => isset( $payload['css'] ) ? (string) $payload['css'] : '',
							'raw_js'   => isset( $payload['js'] ) ? (string) $payload['js'] : '',
						);

						foreach ( $fields as $field_key => $next_value ) {
							if ( '' === trim( $next_value ) ) {
								continue;
							}

							$current_value = isset( $element['settings'][ $field_key ] ) ? (string) $element['settings'][ $field_key ] : '';
							$merged_value  = 'append' === $mode && '' !== trim( $current_value )
								? rtrim( $current_value ) . "\n\n" . $next_value
								: $next_value;

							$element['settings'][ $field_key ] = $merged_value;
							$result['updated_fields'][]        = $field_key;
						}

						$result['updated']        = true;
						$result['widget_id']      = $element_id;
						$result['matched_by']     = $id_matches ? 'widget_id' : 'first_widget';
						$result['updated_fields'] = array_values( array_unique( $result['updated_fields'] ) );
						$result['message']        = 'Proton widget updated.';
						return $result;
					}
				}

				if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
					$nested_result = self::apply_mcp_generated_code_to_elements( $element['elements'], $payload );
					if ( ! empty( $nested_result['updated'] ) ) {
						return $nested_result;
					}
				}
			}
			unset( $element );

			if ( '' !== $target_widget_id ) {
				$result['message'] = 'Proton widget with provided widget_id was not found.';
			}

			return $result;
		}

		/**
		 * Build tagged code block for generated markup/styles/scripts.
		 *
		 * @param string $type   html|css|js.
		 * @param string $code   Raw code.
		 * @param string $source Source label.
		 * @param string $label  Optional label.
		 * @return string
		 */
		private static function build_mcp_tagged_code_block( $type, $code, $source, $label ) {
			$code = (string) $code;
			if ( '' === trim( $code ) ) {
				return '';
			}

			// Keep MCP output clean: do not inject wrapper comments around generated code.
			return trim( $code );
		}

		/**
		 * Sanitize custom code while preserving trusted script markup.
		 *
		 * @param mixed $value   Raw code value.
		 * @param bool  $trusted Whether code comes from a trusted internal MCP import path.
		 * @return string
		 */
		/**
		 * Detect whether the current request is a save we own — either our
		 * own site-code AJAX or an Elementor editor save (which carries our
		 * widget settings). Used to scope the kses-widening filter so we
		 * never alter the allowed-tag list on unrelated requests.
		 *
		 * @return bool
		 */
		private static function is_uichemy_widget_save_request() {
			if ( ! ( defined( 'DOING_AJAX' ) && DOING_AJAX ) ) {
				return false;
			}
			$action = isset( $_REQUEST['action'] ) ? sanitize_key( wp_unslash( $_REQUEST['action'] ) ) : '';
			if ( '' === $action ) {
				return false;
			}
			return in_array(
				$action,
				array(
					'uichemy_composer_save_site_custom_code',
					'elementor_ajax',
				),
				true
			);
		}

		/**
		 * Widen the kses allowed-tag list for admins during our own and
		 * Elementor's save AJAX requests so <link>/<style>/<script>/<meta>
		 * tags survive the save. Without this, page-level Google Fonts the
		 * user types into a Proton widget's custom-code panels get
		 * silently stripped before being written to `_elementor_data`.
		 *
		 * @param array  $allowed Allowed tags map.
		 * @param string $context Context name ('post', 'pre_user_description', etc.).
		 * @return array
		 */
		public function maybe_allow_code_tags_for_admin_saves( $allowed, $context ) {
			if ( 'post' !== $context ) {
				return $allowed;
			}
			if ( ! current_user_can( 'manage_options' ) ) {
				return $allowed;
			}
			if ( ! self::is_uichemy_widget_save_request() ) {
				return $allowed;
			}

			$allowed['link']   = array(
				'rel'         => true,
				'href'        => true,
				'crossorigin' => true,
				'as'          => true,
				'type'        => true,
				'media'       => true,
				'integrity'   => true,
				'referrerpolicy' => true,
			);
			$allowed['style']  = array(
				'type'  => true,
				'media' => true,
			);
			$allowed['script'] = array(
				'src'         => true,
				'type'        => true,
				'async'       => true,
				'defer'       => true,
				'crossorigin' => true,
				'integrity'   => true,
				'nomodule'    => true,
			);
			$allowed['meta']   = array(
				'name'       => true,
				'content'    => true,
				'http-equiv' => true,
				'charset'    => true,
				'property'   => true,
			);

			return $allowed;
		}

		private static function sanitize_custom_code( $value, $trusted = false ) {
			$value = is_string( $value ) ? $value : '';

			if ( $trusted ) {
				return $value;
			}

			if ( ! current_user_can( 'unfiltered_html' ) ) {
				return wp_kses_post( $value );
			}

			return $value;
		}

		/**
		 * AJAX: return shared site-level custom code.
		 *
		 * @return void
		 */
		public function ajax_get_site_custom_code() {
			check_ajax_referer( self::EDITOR_AJAX_NONCE_ACTION, 'nonce' );

			if ( ! current_user_can( 'edit_posts' ) ) {
				wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
			}

			wp_send_json_success( self::get_site_custom_code_option() );
		}

		/**
		 * AJAX: save shared site-level custom code.
		 *
		 * @return void
		 */
		public function ajax_save_site_custom_code() {
			check_ajax_referer( self::EDITOR_AJAX_NONCE_ACTION, 'nonce' );

			if ( ! current_user_can( 'edit_posts' ) ) {
				wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
			}

			$head   = isset( $_POST['head'] ) ? wp_unslash( $_POST['head'] ) : '';
			$footer = isset( $_POST['footer'] ) ? wp_unslash( $_POST['footer'] ) : '';

			// Admins are trusted to author <link>/<style>/<script>/<meta> tags
			// here — these are the only tags that make Google Fonts and CDN
			// libraries work, and wp_kses_post() would silently strip them.
			$trusted = current_user_can( 'manage_options' );

			wp_send_json_success( self::update_site_custom_code_option( $head, $footer, $trusted ) );
		}

		// ── Site-level 3rd-party deps ──────────────────────────────────────────

		/**
		 * Get shared site-level deps option.
		 *
		 * @return array
		 */
		public static function get_site_deps_option() {
			$option = get_option( self::SITE_DEPS_OPTION, array() );
			return is_array( $option ) ? $option : array();
		}

		/**
		 * Update shared site-level deps option.
		 *
		 * @param array $deps Array of dep entries.
		 * @return array
		 */
		public static function update_site_deps_option( $deps ) {
			if ( ! is_array( $deps ) ) {
				$deps = array();
			}
			update_option( self::SITE_DEPS_OPTION, $deps, false );
			return $deps;
		}

		/**
		 * AJAX: return shared site-level deps.
		 *
		 * @return void
		 */
		public function ajax_get_site_deps() {
			check_ajax_referer( self::EDITOR_AJAX_NONCE_ACTION, 'nonce' );

			if ( ! current_user_can( 'edit_posts' ) ) {
				wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
			}

			wp_send_json_success( self::get_site_deps_option() );
		}

		/**
		 * AJAX: save shared site-level deps.
		 *
		 * @return void
		 */
		public function ajax_save_site_deps() {
			check_ajax_referer( self::EDITOR_AJAX_NONCE_ACTION, 'nonce' );

			if ( ! current_user_can( 'edit_posts' ) ) {
				wp_send_json_error( array( 'message' => 'Unauthorized' ), 403 );
			}

			$raw  = isset( $_POST['deps'] ) ? wp_unslash( $_POST['deps'] ) : '[]';
			$deps = json_decode( $raw, true );
			if ( ! is_array( $deps ) ) {
				$deps = array();
			}

			wp_send_json_success( self::update_site_deps_option( $deps ) );
		}

		/**
		 * Build an HTML asset tag from a dep config array (same logic as the widget).
		 *
		 * @param array $dep Dep config.
		 * @return string HTML tag or empty string.
		 */
		private static function build_dep_asset_tag( $dep ) {
			$url   = isset( $dep['url'] ) ? trim( (string) $dep['url'] ) : '';
			$ver   = isset( $dep['v'] ) ? trim( (string) $dep['v'] ) : '';
			$kind  = isset( $dep['kind'] ) ? (string) $dep['kind'] : 'script';
			$attrs = isset( $dep['attrs'] ) && is_array( $dep['attrs'] ) ? $dep['attrs'] : array();

			if ( '' === $url ) {
				return '';
			}

			if ( '' !== $ver && '—' !== $ver ) {
				$url = str_replace( '{v}', $ver, $url );
			} else {
				$url = str_replace( '{v}', '', $url );
			}

			$url = esc_url( $url );

			if ( 'style' === $kind ) {
				$media = '';
				if ( in_array( 'print', $attrs, true ) ) {
					$media = ' media="print"';
				} elseif ( in_array( 'all', $attrs, true ) ) {
					$media = ' media="all"';
				}
				return '<link rel="stylesheet" href="' . $url . '"' . $media . ' />';
			} else {
				$extra = '';
				if ( in_array( 'defer', $attrs, true ) ) {
					$extra .= ' defer';
				} elseif ( in_array( 'async', $attrs, true ) ) {
					$extra .= ' async';
				}
				if ( in_array( 'module', $attrs, true ) ) {
					$extra .= ' type="module"';
				}
				return '<script src="' . $url . '"' . $extra . '></script>';
			}
		}

		/**
		 * Print custom code in <head>.
		 *
		 * @return void
		 */
		public function print_head_custom_code() {
			if ( is_admin() ) {
				return;
			}

			$this->print_location_custom_code( 'head' );
		}

		/**
		 * Print custom code before </body>.
		 *
		 * @return void
		 */
		public function print_body_end_custom_code() {
			if ( is_admin() ) {
				return;
			}

			$this->print_location_custom_code( 'body_end' );
		}

		/**
		 * Print merged site-level and page-level code for a location.
		 *
		 * @param string $location Location key.
		 * @return void
		 */
		private function print_location_custom_code( $location ) {
			$site_codes = $this->get_site_level_custom_code( $location );
			$page_codes = $this->get_page_level_widget_custom_code( $location );

			// NOTE: 3rd-party asset deps for the page/site scopes are NOT emitted
			// here from the raw_deps_* JSON lists. The composer panel writes the
			// resulting <script>/<link> tag directly into the page_custom_code_*
			// and site_custom_code_* code-editor settings — which we emit below —
			// so the code editor is the single source of truth. Emitting the
			// JSON-derived tags too would produce duplicate <script> tags on the
			// published page (and worse, the dup could load AFTER inline widget
			// scripts that depend on the library).

			foreach ( $site_codes as $site_code ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo "\n<!-- Proton: Site Custom Code ({$location}) -->\n" . $site_code . "\n";
			}

			foreach ( $page_codes as $page_code ) {
				// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				echo "\n<!-- Proton: Page Custom Code ({$location}) -->\n" . $page_code . "\n";
			}
		}

		/**
		 * Get asset tags for page-level deps at a specific position.
		 *
		 * @param string $position 'before' (head) or 'after' (footer).
		 * @return array<int, string> HTML tag strings.
		 */
		private function get_page_level_widget_deps( $position ) {
			if ( ! is_singular() ) {
				return array();
			}

			$post_id = get_queried_object_id();
			if ( ! $post_id ) {
				return array();
			}

			$elements = $this->get_elementor_data_from_post( $post_id );
			if ( empty( $elements ) ) {
				return array();
			}

			// Collect deps JSON from the first Proton widget that has it set.
			$raw_deps_json = $this->extract_first_widget_setting_from_elements( $elements, 'raw_deps_page' );
			if ( empty( $raw_deps_json ) ) {
				return array();
			}

			$deps = json_decode( $raw_deps_json, true );
			if ( ! is_array( $deps ) ) {
				return array();
			}

			$tags        = array();
			$seen_urls   = array();
			foreach ( $deps as $dep ) {
				if ( empty( $dep['enabled'] ) ) {
					continue;
				}
				$pos = isset( $dep['position'] ) ? (string) $dep['position'] : 'before';
				if ( $pos !== $position ) {
					continue;
				}
				$url_key = isset( $dep['url'] ) ? trim( (string) $dep['url'] ) : '';
				if ( '' === $url_key || isset( $seen_urls[ $url_key ] ) ) {
					continue;
				}
				$seen_urls[ $url_key ] = true;
				$tag = self::build_dep_asset_tag( $dep );
				if ( '' !== $tag ) {
					$tags[] = $tag;
				}
			}

			return $tags;
		}

		/**
		 * Recursively find the first Proton widget and return a setting value from it.
		 *
		 * @param array  $elements Elementor elements tree.
		 * @param string $setting_key Setting key to extract.
		 * @return string
		 */
		private function extract_first_widget_setting_from_elements( $elements, $setting_key ) {
			foreach ( $elements as $element ) {
				if ( ! is_array( $element ) ) {
					continue;
				}
				$el_type     = isset( $element['elType'] ) ? $element['elType'] : '';
				$widget_type = isset( $element['widgetType'] ) ? $element['widgetType'] : '';
				$settings    = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();

				if ( 'widget' === $el_type && 'proton' === $widget_type ) {
					$value = isset( $settings[ $setting_key ] ) ? trim( (string) $settings[ $setting_key ] ) : '';
					if ( '' !== $value ) {
						return $value;
					}
				}

				if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
					$found = $this->extract_first_widget_setting_from_elements( $element['elements'], $setting_key );
					if ( '' !== $found ) {
						return $found;
					}
				}
			}
			return '';
		}

		/**
		 * Get current page custom code from widget instances.
		 *
		 * @param string $location Location key.
		 * @return array<int, string>
		 */
		private function get_page_level_widget_custom_code( $location ) {
			if ( ! is_singular() ) {
				return array();
			}

			$post_id = get_queried_object_id();
			if ( ! $post_id ) {
				return array();
			}

			$elements = $this->get_elementor_data_from_post( $post_id );
			if ( empty( $elements ) ) {
				return array();
			}

			return $this->extract_widget_custom_code_from_elements( $elements, $location, 'page' );
		}

		/**
		 * Get site-wide custom code from shared option.
		 *
		 * @param string $location Location key.
		 * @return array<int, string>
		 */
		private function get_site_level_custom_code( $location ) {
			$site_code = self::get_site_custom_code_option();
			$field     = 'head' === $location ? 'head' : 'footer';
			$value     = trim( $site_code[ $field ] );

			if ( '' === $value ) {
				return array();
			}

			return array( $value );
		}

		/**
		 * Read Elementor data array from post meta.
		 *
		 * @param int $post_id Post ID.
		 * @return array
		 */
		private function get_elementor_data_from_post( $post_id ) {
			$raw_data = get_post_meta( $post_id, '_elementor_data', true );

			if ( empty( $raw_data ) || ! is_string( $raw_data ) ) {
				return array();
			}

			$elements = json_decode( $raw_data, true );

			return is_array( $elements ) ? $elements : array();
		}

		/**
		 * Recursively extract custom code from Proton widget elements.
		 *
		 * @param array  $elements Elements tree.
		 * @param string $location head|body_end.
		 * @param string $scope    page|site.
		 * @return array<int, string>
		 */
		private function extract_widget_custom_code_from_elements( $elements, $location, $scope, &$seen_signatures = null ) {
			if ( null === $seen_signatures ) {
				$seen_signatures = array();
			}

			$codes     = array();
			$field_map = array(
				'page' => array(
					'head'     => 'page_custom_code_head',
					'body_end' => 'page_custom_code_footer',
				),
				'site' => array(
					'head'     => 'site_custom_code_head',
					'body_end' => 'site_custom_code_footer',
				),
			);

			if ( ! isset( $field_map[ $scope ][ $location ] ) ) {
				return $codes;
			}

			$field = $field_map[ $scope ][ $location ];

			foreach ( $elements as $element ) {
				if ( ! is_array( $element ) ) {
					continue;
				}

				$el_type     = isset( $element['elType'] ) ? $element['elType'] : '';
				$widget_type = isset( $element['widgetType'] ) ? $element['widgetType'] : '';
				$settings    = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();

				if ( 'widget' === $el_type && 'proton' === $widget_type ) {
					$code = isset( $settings[ $field ] ) ? trim( (string) $settings[ $field ] ) : '';

					if ( '' !== $code ) {
						$sig = md5( $code );
						if ( ! isset( $seen_signatures[ $sig ] ) ) {
							$seen_signatures[ $sig ] = true;
							$codes[]                 = $code;
						}
					}
				}

				if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
					$codes = array_merge( $codes, $this->extract_widget_custom_code_from_elements( $element['elements'], $location, $scope, $seen_signatures ) );
				}
			}

			return $codes;
		}

		/**
		 * Collect class tokens that appear on the same element as an Elementor global `text-*` preset class.
		 * Used to strip redundant typography declarations from scoped CSS when globals already apply.
		 *
		 * @param string $html                 HTML fragment.
		 * @param array  $typography_presets Presets from mcp_parse_globals_ai_css_snapshot().
		 * @return array<string,bool> Map of class token => true.
		 */
		private static function mcp_build_strippable_typography_classes_from_html( $html, $typography_presets ) {
			$html = (string) $html;
			if ( '' === trim( $html ) || empty( $typography_presets ) || ! class_exists( '\DOMDocument' ) || ! class_exists( '\DOMXPath' ) ) {
				return array();
			}

			$preset_lookup = array();
			foreach ( (array) $typography_presets as $preset ) {
				$cn = isset( $preset['class_name'] ) ? sanitize_html_class( (string) $preset['class_name'] ) : '';
				if ( '' !== $cn ) {
					$preset_lookup[ $cn ] = true;
				}
			}
			if ( empty( $preset_lookup ) ) {
				return array();
			}

			$dom = new \DOMDocument();
			$libxml_previous = libxml_use_internal_errors( true );
			$loaded = $dom->loadHTML(
				'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' . $html . '</body></html>',
				LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
			);
			libxml_clear_errors();
			libxml_use_internal_errors( $libxml_previous );

			if ( ! $loaded ) {
				return array();
			}

			$xpath      = new \DOMXPath( $dom );
			$strippable = array();
			$nodes      = $xpath->query( '//*[@class]' );
			if ( ! ( $nodes instanceof \DOMNodeList ) ) {
				return array();
			}

			foreach ( $nodes as $node ) {
				if ( ! ( $node instanceof \DOMElement ) ) {
					continue;
				}
				$parts = preg_split( '/\s+/', trim( (string) $node->getAttribute( 'class' ) ) );
				if ( ! is_array( $parts ) ) {
					continue;
				}
				$has_preset = false;
				foreach ( $parts as $p ) {
					if ( isset( $preset_lookup[ $p ] ) ) {
						$has_preset = true;
						break;
					}
				}
				if ( ! $has_preset ) {
					continue;
				}
				foreach ( $parts as $p ) {
					if ( '' === $p || isset( $preset_lookup[ $p ] ) ) {
						continue;
					}
					$strippable[ $p ] = true;
				}
			}

			return $strippable;
		}

		/**
		 * Whether a selector's last compound contains a class that shares a node with a global typography class.
		 *
		 * @param string $selector       One comma-free selector fragment.
		 * @param array  $strippable_map Map from mcp_build_strippable_typography_classes_from_html().
		 * @return bool
		 */
		private static function mcp_css_selector_targets_strippable_typography_class( $selector, array $strippable_map ) {
			if ( empty( $strippable_map ) ) {
				return false;
			}
			$selector = trim( (string) preg_replace( '/\s+/', ' ', (string) $selector ) );
			if ( '' === $selector || false !== strpos( $selector, '@' ) ) {
				return false;
			}

			$toks = preg_split( '/\s+/', $selector );
			if ( ! is_array( $toks ) || empty( $toks ) ) {
				return false;
			}
			$last = (string) end( $toks );
			if ( preg_match_all( '/\.([a-zA-Z_][a-zA-Z0-9_-]*)/', $last, $mm ) ) {
				foreach ( $mm[1] as $cn ) {
					if ( isset( $strippable_map[ $cn ] ) ) {
						return true;
					}
				}
			}

			return false;
		}

		/**
		 * Remove font-* / text-* declarations from rules targeting BEM classes that already use Elementor `text-*` on the same element.
		 *
		 * @param string $html                 HTML after global class application.
		 * @param string $css                  Scoped widget CSS.
		 * @param array  $typography_presets Presets from snapshot parse.
		 * @return string
		 */
		private static function mcp_strip_typography_decls_for_preset_global_classes_on_html( $html, $css, $typography_presets ) {
			$html = (string) $html;
			$css  = (string) $css;
			if ( '' === trim( $css ) || '' === trim( $html ) || empty( $typography_presets ) ) {
				return $css;
			}

			$strippable = self::mcp_build_strippable_typography_classes_from_html( $html, $typography_presets );
			if ( empty( $strippable ) ) {
				return $css;
			}

			$typography_props = array(
				'font-family'     => true,
				'font-size'       => true,
				'font-weight'     => true,
				'line-height'     => true,
				'letter-spacing'  => true,
				'text-transform'  => true,
				'text-decoration' => true,
				'font-style'      => true,
			);

			$next = preg_replace_callback(
				'/([^{]+)\{([^}]*)\}/s',
				function ( $m ) use ( $strippable, $typography_props ) {
					$selector = isset( $m[1] ) ? trim( (string) $m[1] ) : '';
					$body     = isset( $m[2] ) ? (string) $m[2] : '';
					if ( '' === $selector || '' === trim( $body ) ) {
						return $m[0];
					}
					if ( false !== strpos( $selector, '@' ) ) {
						return $m[0];
					}

					$sel_parts = array_map( 'trim', explode( ',', $selector ) );
					$strip_sel = array();
					$keep_sel  = array();
					foreach ( $sel_parts as $p ) {
						if ( '' === $p ) {
							continue;
						}
						if ( self::mcp_css_selector_targets_strippable_typography_class( $p, $strippable ) ) {
							$strip_sel[] = $p;
						} else {
							$keep_sel[] = $p;
						}
					}

					$decls = self::mcp_parse_css_declarations( $body, true );
					if ( empty( $decls ) ) {
						return $m[0];
					}

					$out = array();
					if ( ! empty( $strip_sel ) ) {
						$filtered = array_values(
							array_filter(
								$decls,
								function ( $row ) use ( $typography_props ) {
									$prop = isset( $row['property'] ) ? self::mcp_normalize_css_property( (string) $row['property'] ) : '';
									return '' === $prop || ! isset( $typography_props[ $prop ] );
								}
							)
						);
						if ( ! empty( $filtered ) ) {
							$nb = self::mcp_build_css_declarations( $filtered );
							if ( '' !== trim( $nb ) ) {
								$out[] = implode( ', ', $strip_sel ) . " {\n" . $nb . "\n}";
							}
						}
					}
					if ( ! empty( $keep_sel ) ) {
						$out[] = implode( ', ', $keep_sel ) . " {\n" . trim( $body ) . "\n}";
					}

					if ( empty( $out ) ) {
						return '';
					}

					return implode( "\n", $out );
				},
				$css
			);

			return is_string( $next ) ? $next : $css;
		}

		/**
		 * Match CSS/HTML against AI globals snapshot and apply dynamic globals mapping.
		 *
		 * - Converts matched color values to var(--e-global-color-*)
		 * - Converts matched typography values to var(--e-global-typography-*-*)
		 * - Adds matched typography class to HTML elements for safe selector types
		 *
		 * @param array $payload Input payload.
		 * @return array|\WP_Error
		 */
		public static function mcp_apply_global_matches_dynamic( $payload ) {
			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$html = isset( $payload['html'] ) ? (string) $payload['html'] : '';
			$css = isset( $payload['css'] ) ? (string) $payload['css'] : '';
			$globals_ai_data = isset( $payload['globals_ai_data'] ) ? (string) $payload['globals_ai_data'] : '';
			$prefer_typography_class = ! isset( $payload['prefer_typography_class'] ) || (bool) $payload['prefer_typography_class'];

			// If snapshot not provided, fetch it automatically from the active Elementor kit
			// using the same mechanism as the Proton widget's "AI Data Sending" panel.
			if ( '' === trim( $globals_ai_data ) ) {
				if ( class_exists( 'Protuno_Globals' ) && method_exists( 'Protuno_Globals', 'get_ai_data_snapshot' ) ) {
					$globals_ai_data = (string) Protuno_Globals::get_ai_data_snapshot();
				}
			}

			// If still no snapshot available, skip matching — page will use raw CSS values.
			if ( '' === trim( $globals_ai_data ) ) {
				return array(
					'html' => $html,
					'css' => $css,
					'matches' => array(
						'color_replacements' => 0,
						'typography_rules_matched' => 0,
						'html_elements_class_applied' => 0,
					),
					'unmatched' => array(),
					'message' => 'AI Data Sharing snapshot not available — Elementor globals could not be read. Proceeding with raw CSS values.',
				);
			}

			$globals = self::mcp_parse_globals_ai_css_snapshot( $globals_ai_data );
			$color_value_to_id = isset( $globals['color_value_to_id'] ) ? $globals['color_value_to_id'] : array();
			$typography_presets = isset( $globals['typography_presets'] ) ? $globals['typography_presets'] : array();

			if ( '' === trim( $css ) ) {
				return array(
					'html' => $html,
					'css' => $css,
					'matches' => array(
						'color_replacements' => 0,
						'typography_rules_matched' => 0,
						'html_elements_class_applied' => 0,
					),
					'unmatched' => array(),
					'message' => 'No CSS provided. Nothing to match.',
				);
			}

			$result = self::mcp_apply_dynamic_globals_to_css( $css, $color_value_to_id, $typography_presets );
			$next_css = isset( $result['css'] ) ? (string) $result['css'] : $css;
			$typography_class_targets = isset( $result['typography_class_targets'] ) ? $result['typography_class_targets'] : array();

			$html_apply_count = 0;
			$next_html = $html;
			if ( $prefer_typography_class && ! empty( $typography_class_targets ) && '' !== trim( $html ) ) {
				$apply_html = self::mcp_apply_typography_classes_to_html( $html, $typography_class_targets );
				$next_html = isset( $apply_html['html'] ) ? (string) $apply_html['html'] : $html;
				$html_apply_count = isset( $apply_html['applied'] ) ? (int) $apply_html['applied'] : 0;
			}

			if ( '' !== trim( $next_css ) && '' !== trim( $next_html ) && ! empty( $typography_presets ) ) {
				$next_css = self::mcp_strip_typography_decls_for_preset_global_classes_on_html( $next_html, $next_css, $typography_presets );
			}

			return array(
				'html' => $next_html,
				'css' => $next_css,
				'matches' => array(
					'color_replacements' => isset( $result['color_replacements'] ) ? (int) $result['color_replacements'] : 0,
					'color_matches' => isset( $result['color_matches_detail'] ) ? $result['color_matches_detail'] : array(),
					'typography_rules_matched' => isset( $result['typography_rules_matched'] ) ? (int) $result['typography_rules_matched'] : 0,
					'html_elements_class_applied' => $html_apply_count,
				),
				'unmatched' => isset( $result['unmatched'] ) ? $result['unmatched'] : array(),
				'message' => 'Dynamic global matching applied.',
			);
		}

		/**
		 * Parse AI globals CSS snapshot into color and typography maps.
		 *
		 * @param string $globals_ai_data AI globals CSS snapshot.
		 * @return array<string, mixed>
		 */
		private static function mcp_parse_globals_ai_css_snapshot( $globals_ai_data ) {
			$globals_ai_data = (string) $globals_ai_data;
			$color_value_to_id = array();
			$typography_presets = array();

			if ( preg_match_all( '/--e-global-color-([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/i', $globals_ai_data, $color_matches, PREG_SET_ORDER ) ) {
				foreach ( $color_matches as $match ) {
					$color_id = isset( $match[1] ) ? trim( (string) $match[1] ) : '';
					$color_value = isset( $match[2] ) ? self::mcp_normalize_css_value( $match[2] ) : '';
					if ( '' === $color_id || '' === $color_value ) {
						continue;
					}
					$color_value_to_id[ $color_value ] = $color_id;
				}
			}

			if ( preg_match_all( '/\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/s', $globals_ai_data, $class_blocks, PREG_SET_ORDER ) ) {
				foreach ( $class_blocks as $block ) {
					$class_name = isset( $block[1] ) ? trim( (string) $block[1] ) : '';
					$body = isset( $block[2] ) ? (string) $block[2] : '';
					if ( '' === $class_name || 0 !== strpos( $class_name, 'text-' ) ) {
						continue;
					}

					$preset_id = preg_replace( '/^text-/', '', $class_name );
					$decls = self::mcp_parse_css_declarations( $body );
					if ( empty( $decls ) ) {
						continue;
					}
					$typography_presets[] = array(
						'class_name' => $class_name,
						'preset_id' => $preset_id,
						'decls' => $decls,
					);
				}
			}

			return array(
				'color_value_to_id' => $color_value_to_id,
				'typography_presets' => $typography_presets,
			);
		}

		/**
		 * Apply color + typography dynamic vars to CSS.
		 *
		 * @param string $css Input css.
		 * @param array  $color_value_to_id Color map normalized value => global id.
		 * @param array  $typography_presets Typography presets.
		 * @return array<string, mixed>
		 */
		private static function mcp_apply_dynamic_globals_to_css( $css, $color_value_to_id, $typography_presets ) {
			$css = (string) $css;
			$color_replacements = 0;
			$color_matches_detail = array();
			$typography_rules_matched = 0;
			$unmatched_selectors = array();
			$typography_class_targets = array();

			$typography_map = array(
				'font-family' => 'font-family',
				'font-size' => 'font-size',
				'font-weight' => 'font-weight',
				'line-height' => 'line-height',
				'letter-spacing' => 'letter-spacing',
				'text-transform' => 'text-transform',
				'text-decoration' => 'text-decoration',
				'font-style' => 'font-style',
			);

			$color_prop_regex = '/(?:^|[^-])(color|background-color|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline-color|text-decoration-color|column-rule-color|fill|stroke)$/i';

			$next_css = preg_replace_callback(
				'/([^{]+)\{([^}]*)\}/s',
				function ( $rule_match ) use (
					$color_value_to_id,
					$typography_presets,
					$typography_map,
					$color_prop_regex,
					&$color_replacements,
					&$color_matches_detail,
					&$typography_rules_matched,
					&$unmatched_selectors,
					&$typography_class_targets
				) {
					$selector = isset( $rule_match[1] ) ? trim( (string) $rule_match[1] ) : '';
					$body = isset( $rule_match[2] ) ? (string) $rule_match[2] : '';
					if ( '' === $selector ) {
						return $rule_match[0];
					}

					$decls = self::mcp_parse_css_declarations( $body, true );
					if ( empty( $decls ) ) {
						return $rule_match[0];
					}

					$decl_map = array();
					foreach ( $decls as $idx => $d ) {
						$prop_key = self::mcp_normalize_css_property( $d['property'] );
						$decl_map[ $prop_key ] = $idx;
					}

					// Typography preset match.
					$matched_preset = null;
					foreach ( $typography_presets as $preset ) {
						$preset_decls = isset( $preset['decls'] ) && is_array( $preset['decls'] ) ? $preset['decls'] : array();
						if ( empty( $preset_decls ) ) {
							continue;
						}

						// Properties whose preset value equals the CSS default — omitting
						// them in generated CSS is semantically identical, so don't fail
						// the match when the CSS doesn't declare them explicitly.
						$css_default_values = array(
							'font-style'      => array( 'normal' ),
							'text-transform'  => array( 'none' ),
							'text-decoration' => array( 'none' ),
							'letter-spacing'  => array( '0', '0px', 'normal' ),
							'line-height'     => array( 'normal' ),
						);

						$all_match = true;
						foreach ( $typography_map as $prop => $suffix ) {
							if ( ! isset( $preset_decls[ $prop ] ) ) {
								continue;
							}
							if ( ! isset( $decl_map[ $prop ] ) ) {
								// If the preset value is a CSS default for this property,
								// not writing it in CSS is equivalent — treat as matched.
								$preset_normalized = self::mcp_normalize_css_value( $preset_decls[ $prop ] );
								if ( isset( $css_default_values[ $prop ] ) && in_array( $preset_normalized, $css_default_values[ $prop ], true ) ) {
									continue;
								}
								$all_match = false;
								break;
							}
							$decl_row     = $decls[ $decl_map[ $prop ] ];
							$current_raw  = isset( $decl_row['value'] ) ? (string) $decl_row['value'] : '';
							$expected_raw = isset( $preset_decls[ $prop ] ) ? (string) $preset_decls[ $prop ] : '';
							if ( ! self::mcp_typography_decl_values_match( $prop, $current_raw, $expected_raw ) ) {
								$all_match = false;
								break;
							}
						}

						if ( $all_match ) {
							$matched_preset = $preset;
							break;
						}
					}

					if ( $matched_preset ) {
						$preset_id = isset( $matched_preset['preset_id'] ) ? sanitize_key( (string) $matched_preset['preset_id'] ) : '';
						$class_name = isset( $matched_preset['class_name'] ) ? sanitize_html_class( (string) $matched_preset['class_name'] ) : '';
						if ( '' !== $preset_id ) {
							// Strip matched typography properties from this selector — the
							// text-* Elementor global class added to the HTML element is the
							// single source of truth for typography. Keeping var() duplicates
							// here would conflict with or override the global.
							$decls = array_values(
								array_filter(
									$decls,
									function ( $decl_row ) use ( $typography_map ) {
										$prop_name = isset( $decl_row['property'] ) ? self::mcp_normalize_css_property( $decl_row['property'] ) : '';
										return ! isset( $typography_map[ $prop_name ] );
									}
								)
							);
							$typography_rules_matched++;
							if ( '' !== $class_name ) {
								$replace_class = self::mcp_extract_typography_only_selector_class( $selector );
								$typography_class_targets[] = array(
									'selector' => $selector,
									'class_name' => $class_name,
									'replace_class' => $replace_class,
								);
							}
						}
					} else {
						$unmatched_selectors[] = $selector;
					}

					// Color replacements.
					foreach ( $decls as $idx => $decl ) {
						$prop = self::mcp_normalize_css_property( $decl['property'] );
						if ( ! preg_match( $color_prop_regex, $prop ) ) {
							continue;
						}
						$normalized_value = self::mcp_normalize_css_value( $decl['value'] );
						if ( isset( $color_value_to_id[ $normalized_value ] ) ) {
							$color_id = sanitize_key( (string) $color_value_to_id[ $normalized_value ] );
							if ( '' !== $color_id ) {
								$decls[ $idx ]['value'] = 'var(--e-global-color-' . $color_id . ')';
								$color_replacements++;
								$color_pair = $normalized_value . '||' . $color_id;
								if ( ! isset( $color_matches_detail[ $color_pair ] ) ) {
									$color_matches_detail[ $color_pair ] = array(
										'value' => $normalized_value,
										'global_id' => $color_id,
									);
								}
							}
						}
					}

					if ( empty( $decls ) ) {
						return '';
					}

					$next_body = self::mcp_build_css_declarations( $decls );
					return $selector . " {\n" . $next_body . "\n}";
				},
				$css
			);

			if ( ! is_string( $next_css ) ) {
				$next_css = $css;
			}

			// Dedupe typography class targets — duplicate selector+class pairs
			// (e.g. when the same selector appears twice in CSS) would otherwise
			// queue the same DOM mutation more than once downstream.
			$dedupe_seen = array();
			$dedupe_targets = array();
			foreach ( $typography_class_targets as $target ) {
				$selector_key = isset( $target['selector'] ) ? trim( (string) $target['selector'] ) : '';
				$class_key = isset( $target['class_name'] ) ? trim( (string) $target['class_name'] ) : '';
				if ( '' === $selector_key || '' === $class_key ) {
					continue;
				}
				$pair = $selector_key . '|' . $class_key;
				if ( isset( $dedupe_seen[ $pair ] ) ) {
					continue;
				}
				$dedupe_seen[ $pair ] = true;
				$dedupe_targets[] = $target;
			}

			return array(
				'css' => $next_css,
				'color_replacements' => $color_replacements,
				'color_matches_detail' => array_values( $color_matches_detail ),
				'typography_rules_matched' => $typography_rules_matched,
				'typography_class_targets' => $dedupe_targets,
				'unmatched' => array_values( array_unique( array_filter( $unmatched_selectors ) ) ),
			);
		}

		/**
		 * Apply typography class names to HTML for safely mappable selectors.
		 * Supported target forms:
		 * - .class, #id, tag
		 * - chained/simple descendant selectors where the terminal token is one of
		 *   the safe forms above (e.g. ".hero .title", "section .copy")
		 *
		 * @param string $html Raw HTML.
		 * @param array  $targets Selector/class targets.
		 * @return array<string, mixed>
		 */
		private static function mcp_apply_typography_classes_to_html( $html, $targets ) {
			$html = (string) $html;
			if ( '' === trim( $html ) || empty( $targets ) || ! class_exists( '\DOMDocument' ) || ! class_exists( '\DOMXPath' ) ) {
				return array(
					'html' => $html,
					'applied' => 0,
				);
			}

			$dom = new \DOMDocument();
			$previous = libxml_use_internal_errors( true );
			$loaded = $dom->loadHTML(
				'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' . $html . '</body></html>',
				LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
			);
			libxml_clear_errors();
			libxml_use_internal_errors( $previous );

			if ( ! $loaded ) {
				return array(
					'html' => $html,
					'applied' => 0,
				);
			}

			$xpath = new \DOMXPath( $dom );
			$applied = 0;
			$seen = array();

			foreach ( $targets as $target ) {
				$selector_raw = isset( $target['selector'] ) ? (string) $target['selector'] : '';
				$class_name = isset( $target['class_name'] ) ? sanitize_html_class( (string) $target['class_name'] ) : '';
				$replace_class = isset( $target['replace_class'] ) ? sanitize_html_class( (string) $target['replace_class'] ) : '';
				if ( '' === $selector_raw || '' === $class_name ) {
					continue;
				}

				$selectors = array_map( 'trim', explode( ',', $selector_raw ) );
				foreach ( $selectors as $selector ) {
					$selector = self::mcp_get_selector_terminal_target( $selector );
					if ( '' === $selector ) {
						continue;
					}

					$query = '';
					if ( '.' === substr( $selector, 0, 1 ) ) {
						$token = sanitize_html_class( substr( $selector, 1 ) );
						if ( '' === $token ) {
							continue;
						}
						$query = "//*[contains(concat(' ', normalize-space(@class), ' '), ' " . $token . " ')]";
					} elseif ( '#' === substr( $selector, 0, 1 ) ) {
						$id = sanitize_key( substr( $selector, 1 ) );
						if ( '' === $id ) {
							continue;
						}
						$query = "//*[@id='" . $id . "']";
					} elseif ( preg_match( '/^[a-zA-Z][a-zA-Z0-9-]*$/', $selector ) ) {
						$query = '//' . strtolower( $selector );
					}

					if ( '' === $query ) {
						continue;
					}

					$nodes = $xpath->query( $query );
					if ( ! ( $nodes instanceof \DOMNodeList ) ) {
						continue;
					}

					foreach ( $nodes as $node ) {
						if ( ! ( $node instanceof \DOMElement ) ) {
							continue;
						}
						$key = spl_object_hash( $node ) . '|' . $class_name;
						if ( isset( $seen[ $key ] ) ) {
							continue;
						}
						$seen[ $key ] = true;
						$current = trim( (string) $node->getAttribute( 'class' ) );
						$class_parts = preg_split( '/\s+/', $current );
						if ( ! is_array( $class_parts ) ) {
							$class_parts = array();
						}

						if ( '' !== $replace_class ) {
							$class_parts = array_values(
								array_filter(
									$class_parts,
									function ( $token ) use ( $replace_class ) {
										return trim( (string) $token ) !== $replace_class;
									}
								)
							);
						}

						if ( ! in_array( $class_name, $class_parts, true ) ) {
							$class_parts[] = $class_name;
						}
						$class_parts = array_values( array_filter( array_unique( $class_parts ) ) );
						$next_class_attr = implode( ' ', $class_parts );
						if ( $next_class_attr !== $current ) {
							$node->setAttribute( 'class', $next_class_attr );
							$applied++;
						}
					}
				}
			}

			// Final compaction pass — walk every element with a class attribute
			// and dedupe its class tokens. Belt-and-suspenders defense against
			// any path that could have produced repeats (legacy classes already
			// in the source HTML, multiple matchers, etc.).
			$all_elements = $xpath->query( '//*[@class]' );
			if ( $all_elements instanceof \DOMNodeList ) {
				foreach ( $all_elements as $el ) {
					if ( ! ( $el instanceof \DOMElement ) ) {
						continue;
					}
					$raw = trim( (string) $el->getAttribute( 'class' ) );
					if ( '' === $raw ) {
						continue;
					}
					$parts = preg_split( '/\s+/', $raw );
					if ( ! is_array( $parts ) ) {
						continue;
					}
					$parts = array_values( array_filter( array_unique( $parts ), function ( $token ) {
						return '' !== trim( (string) $token );
					} ) );
					$compact = implode( ' ', $parts );
					if ( $compact !== $raw ) {
						$el->setAttribute( 'class', $compact );
					}
				}
			}

			$body = $dom->getElementsByTagName( 'body' )->item( 0 );
			if ( ! $body ) {
				return array(
					'html' => $html,
					'applied' => $applied,
				);
			}

			$next_html = '';
			foreach ( $body->childNodes as $child ) {
				$next_html .= $dom->saveHTML( $child );
			}

			return array(
				'html' => $next_html,
				'applied' => $applied,
			);
		}

		/**
		 * Reduce a potentially complex CSS selector to a safe terminal target token
		 * for DOMXPath matching.
		 *
		 * Examples:
		 * - ".hero .title"        => ".title"
		 * - "section .copy:hover" => ".copy"
		 * - ".card[data-x='1']"   => ".card"
		 * - "#main > h2"          => "h2"
		 *
		 * @param string $selector CSS selector.
		 * @return string Safe terminal target token (.class, #id, tag) or empty when unsupported.
		 */
		private static function mcp_get_selector_terminal_target( $selector ) {
			$selector = trim( (string) $selector );
			if ( '' === $selector ) {
				return '';
			}

			// Ignore unsupported selector constructs entirely.
			if ( preg_match( '/\*/', $selector ) ) {
				return '';
			}

			// Use the right-most compound token after combinators.
			$parts = preg_split( '/\s+|>|~|\+/', $selector );
			if ( ! is_array( $parts ) || empty( $parts ) ) {
				return '';
			}
			$token = trim( (string) end( $parts ) );
			if ( '' === $token ) {
				return '';
			}

			// Drop pseudo classes/elements and attribute selectors from terminal token.
			$token = preg_replace( '/:{1,2}[a-zA-Z0-9_-]+(?:\([^)]*\))?$/', '', $token );
			$token = preg_replace( '/\[[^\]]*\]/', '', $token );
			$token = trim( (string) $token );
			if ( '' === $token ) {
				return '';
			}

			// Keep only one terminal target kind.
			if ( preg_match( '/\.([a-zA-Z0-9_-]+)$/', $token, $m ) ) {
				return '.' . sanitize_html_class( $m[1] );
			}
			if ( preg_match( '/#([a-zA-Z0-9_-]+)$/', $token, $m ) ) {
				return '#' . sanitize_key( $m[1] );
			}
			if ( preg_match( '/^[a-zA-Z][a-zA-Z0-9-]*$/', $token ) ) {
				return strtolower( $token );
			}

			return '';
		}

		/**
		 * Detect dedicated typography-only utility class selectors that are safe to replace.
		 * Contract for generated CSS: single class selector with one of these prefixes:
		 * - .uich-typo-*
		 * - .uich-text-*
		 *
		 * @param string $selector CSS selector.
		 * @return string Class token (without dot) or empty string when not replaceable.
		 */
		private static function mcp_extract_typography_only_selector_class( $selector ) {
			$selector = trim( (string) $selector );
			if ( '' === $selector ) {
				return '';
			}

			// Only a single simple class selector is eligible.
			if ( ! preg_match( '/^\.([a-zA-Z0-9_-]+)$/', $selector, $match ) ) {
				return '';
			}

			$class_name = isset( $match[1] ) ? sanitize_html_class( (string) $match[1] ) : '';
			if ( '' === $class_name ) {
				return '';
			}

			if ( 0 === strpos( $class_name, 'uich-typo-' ) || 0 === strpos( $class_name, 'uich-text-' ) ) {
				return $class_name;
			}

			return '';
		}

		/**
		 * Parse CSS declaration block into array map or list.
		 *
		 * @param string $body CSS declaration body.
		 * @param bool   $keep_order Keep ordered rows when true.
		 * @return array
		 */
		private static function mcp_parse_css_declarations( $body, $keep_order = false ) {
			$body = (string) $body;
			$rows = preg_split( '/;/', $body );
			if ( ! is_array( $rows ) ) {
				return array();
			}

			if ( $keep_order ) {
				$out_rows = array();
				foreach ( $rows as $row ) {
					$pair = explode( ':', $row, 2 );
					if ( ! isset( $pair[1] ) ) {
						continue;
					}
					$prop = self::mcp_normalize_css_property( $pair[0] );
					$val = trim( (string) $pair[1] );
					if ( '' === $prop || '' === $val ) {
						continue;
					}
					$out_rows[] = array(
						'property' => $prop,
						'value' => $val,
					);
				}
				return $out_rows;
			}

			$out = array();
			foreach ( $rows as $row ) {
				$pair = explode( ':', $row, 2 );
				if ( ! isset( $pair[1] ) ) {
					continue;
				}
				$prop = self::mcp_normalize_css_property( $pair[0] );
				$val = trim( (string) $pair[1] );
				if ( '' === $prop || '' === $val ) {
					continue;
				}
				$out[ $prop ] = $val;
			}

			return $out;
		}

		/**
		 * Build CSS declarations from ordered rows.
		 *
		 * @param array $decls Declaration rows.
		 * @return string
		 */
		private static function mcp_build_css_declarations( $decls ) {
			$out = array();
			if ( ! is_array( $decls ) ) {
				return '';
			}
			foreach ( $decls as $row ) {
				$prop = isset( $row['property'] ) ? self::mcp_normalize_css_property( $row['property'] ) : '';
				$val = isset( $row['value'] ) ? trim( (string) $row['value'] ) : '';
				if ( '' === $prop || '' === $val ) {
					continue;
				}
				$out[] = '    ' . $prop . ': ' . $val . ';';
			}
			return implode( "\n", $out );
		}

		/**
		 * Normalize CSS property for matching.
		 *
		 * @param string $property Property.
		 * @return string
		 */
		private static function mcp_normalize_css_property( $property ) {
			return strtolower( trim( (string) $property ) );
		}

		/**
		 * Normalize CSS values for matching.
		 *
		 * @param string $value Css value.
		 * @return string
		 */
		private static function mcp_normalize_css_value( $value ) {
			$value = strtolower( trim( (string) $value ) );
			$value = preg_replace( '/\s+/', ' ', $value );
			return is_string( $value ) ? trim( $value ) : '';
		}

		/**
		 * Normalize font-weight tokens so kit vs generated CSS compares reliably.
		 *
		 * @param string $weight Raw weight.
		 * @return string
		 */
		private static function mcp_normalize_font_weight_for_match( $weight ) {
			$w = strtolower( trim( (string) $weight ) );
			$map = array(
				'normal'  => '400',
				'bold'    => '700',
				'bolder'  => '700',
				'lighter' => '300',
			);
			if ( isset( $map[ $w ] ) ) {
				return $map[ $w ];
			}
			if ( is_numeric( $w ) ) {
				return (string) (int) $w;
			}
			return $w;
		}

		/**
		 * True if two typography declaration values match for globals pairing (tolerances for px rounding, weight aliases).
		 *
		 * @param string $prop         Normalized CSS property name.
		 * @param string $css_value    Value from generated CSS.
		 * @param string $preset_value Value from kit AI snapshot / global preset.
		 * @return bool
		 */
		private static function mcp_typography_decl_values_match( $prop, $css_value, $preset_value ) {
			$css_value    = self::mcp_normalize_css_value( $css_value );
			$preset_value = self::mcp_normalize_css_value( $preset_value );
			if ( '' === $css_value || '' === $preset_value ) {
				return false;
			}
			if ( 'font-family' === $prop ) {
				$css_value    = self::mcp_extract_first_font_family( $css_value );
				$preset_value = self::mcp_extract_first_font_family( $preset_value );
				return '' !== $css_value && $css_value === $preset_value;
			}
			if ( 'font-weight' === $prop ) {
				return self::mcp_normalize_font_weight_for_match( $css_value ) === self::mcp_normalize_font_weight_for_match( $preset_value );
			}
			if ( 'font-size' === $prop ) {
				if ( $css_value === $preset_value ) {
					return true;
				}
				if ( preg_match( '/^(-?[\d.]+)px$/', $css_value, $ma ) && preg_match( '/^(-?[\d.]+)px$/', $preset_value, $mb ) ) {
					return abs( (float) $ma[1] - (float) $mb[1] ) <= 2.0;
				}
				return false;
			}
			if ( 'letter-spacing' === $prop ) {
				if ( $css_value === $preset_value ) {
					return true;
				}
				$za = preg_replace( '/px$/', '', $css_value );
				$zb = preg_replace( '/px$/', '', $preset_value );
				if ( is_numeric( $za ) && is_numeric( $zb ) && abs( (float) $za ) < 0.001 && abs( (float) $zb ) < 0.001 ) {
					return true;
				}
			}
			if ( 'line-height' === $prop ) {
				if ( $css_value === $preset_value ) {
					return true;
				}
				if ( is_numeric( $css_value ) && is_numeric( $preset_value ) ) {
					return abs( (float) $css_value - (float) $preset_value ) < 0.02;
				}
				if ( preg_match( '/^(-?[\d.]+)px$/', $css_value, $ma ) && preg_match( '/^(-?[\d.]+)px$/', $preset_value, $mb ) ) {
					return abs( (float) $ma[1] - (float) $mb[1] ) <= 2.0;
				}
			}
			return $css_value === $preset_value;
		}

		/**
		 * Extract the first font-family token from a CSS font-family value.
		 *
		 * Examples:
		 * - "Inter, Arial, sans-serif" => "inter"
		 * - "'Open Sans', sans-serif" => "open sans"
		 *
		 * @param string $font_family Raw font-family value.
		 * @return string
		 */
		private static function mcp_extract_first_font_family( $font_family ) {
			$font_family = trim( (string) $font_family );
			if ( '' === $font_family ) {
				return '';
			}

			$parts = explode( ',', $font_family );
			$first = isset( $parts[0] ) ? trim( (string) $parts[0] ) : '';
			if ( '' === $first ) {
				return '';
			}

			// Remove surrounding single/double quotes if present.
			$first = preg_replace( '/^([\'"])(.*)\1$/', '$2', $first );
			$first = self::mcp_normalize_css_value( $first );

			return is_string( $first ) ? $first : '';
		}

		// ── Nav menu helpers ──────────────────────────────────────────────────

		/**
		 * MCP — ensure a WordPress nav menu exists.
		 * If no menus are present, creates "Main Menu", populates it with existing
		 * published pages, and assigns it to all unoccupied registered menu locations.
		 *
		 * @param array $payload Optional { menu_name: string }.
		 * @return array|\WP_Error
		 */
		public static function mcp_ensure_nav_menu( $payload = array() ) {
			$nav_menus = wp_get_nav_menus();

			if ( ! empty( $nav_menus ) ) {
				$names = array_values( array_map( function ( $m ) { return $m->name; }, $nav_menus ) );
				return array(
					'created'   => false,
					'menu_id'   => (int) $nav_menus[0]->term_id,
					'menu_name' => $nav_menus[0]->name,
					'all_menus' => $names,
					'message'   => 'Navigation menu already exists — no action taken.',
				);
			}

			$menu_name = isset( $payload['menu_name'] ) && '' !== trim( (string) $payload['menu_name'] )
				? sanitize_text_field( (string) $payload['menu_name'] )
				: 'Main Menu';

			$menu_id = wp_create_nav_menu( $menu_name );
			if ( is_wp_error( $menu_id ) ) {
				return new \WP_Error( 'uich_menu_create_failed', $menu_id->get_error_message() );
			}

			$pages_added = array();

			// Front page first.
			$front_page_id = (int) get_option( 'page_on_front' );
			if ( $front_page_id && 'page' === get_option( 'show_on_front' ) ) {
				wp_update_nav_menu_item(
					$menu_id,
					0,
					array(
						'menu-item-title'     => get_the_title( $front_page_id ),
						'menu-item-object'    => 'page',
						'menu-item-object-id' => $front_page_id,
						'menu-item-type'      => 'post_type',
						'menu-item-status'    => 'publish',
					)
				);
				$pages_added[] = get_the_title( $front_page_id );
			} else {
				// No static front page — add a plain Home link.
				wp_update_nav_menu_item(
					$menu_id,
					0,
					array(
						'menu-item-title'  => 'Home',
						'menu-item-type'   => 'custom',
						'menu-item-url'    => home_url( '/' ),
						'menu-item-status' => 'publish',
					)
				);
				$pages_added[] = 'Home';
			}

			// Add up to 4 more top-level published pages (menu_order ASC).
			$extra_pages = get_posts(
				array(
					'post_type'      => 'page',
					'post_status'    => 'publish',
					'post_parent'    => 0,
					'posts_per_page' => 4,
					'orderby'        => 'menu_order',
					'order'          => 'ASC',
					'post__not_in'   => $front_page_id ? array( $front_page_id ) : array(),
					'no_found_rows'  => true,
				)
			);
			foreach ( $extra_pages as $page ) {
				wp_update_nav_menu_item(
					$menu_id,
					0,
					array(
						'menu-item-title'     => $page->post_title,
						'menu-item-object'    => 'page',
						'menu-item-object-id' => $page->ID,
						'menu-item-type'      => 'post_type',
						'menu-item-status'    => 'publish',
					)
				);
				$pages_added[] = $page->post_title;
			}

			// Assign to all unoccupied registered menu locations.
			$registered_locations = get_registered_nav_menus();
			$current_locations    = get_nav_menu_locations();
			$assigned_to          = array();

			foreach ( $registered_locations as $location_slug => $location_label ) {
				if ( empty( $current_locations[ $location_slug ] ) ) {
					$current_locations[ $location_slug ] = $menu_id;
					$assigned_to[] = $location_label;
				}
			}

			if ( ! empty( $assigned_to ) ) {
				set_theme_mod( 'nav_menu_locations', $current_locations );
			}

			return array(
				'created'     => true,
				'menu_id'     => (int) $menu_id,
				'menu_name'   => $menu_name,
				'pages_added' => $pages_added,
				'assigned_to' => $assigned_to,
				'message'     => sprintf(
					'Navigation menu "%s" created with %d item(s) and assigned to %d location(s). The <uichemy-nav-menu> tag will now render these items in the header.',
					$menu_name,
					count( $pages_added ),
					count( $assigned_to )
				),
			);
		}

		// ── Site branding helpers ─────────────────────────────────────────────

		/**
		 * MCP — set site logo and/or site icon from image URLs.
		 * Sideloads each URL into the media library (reuses existing upload if already present)
		 * and sets the corresponding WordPress option/theme_mod.
		 *
		 * Skips an item when it is already set unless `force` = true.
		 *
		 * @param array $payload { logo_url?: string, icon_url?: string, force?: bool }
		 * @return array|\WP_Error
		 */
		public static function mcp_set_site_branding( $payload = array() ) {
			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$logo_url    = isset( $payload['logo_url'] ) ? trim( (string) $payload['logo_url'] ) : '';
			$logo_width  = isset( $payload['logo_width'] ) ? absint( $payload['logo_width'] ) : 0;
			$logo_height = isset( $payload['logo_height'] ) ? absint( $payload['logo_height'] ) : 0;
			$icon_url    = isset( $payload['icon_url'] ) ? trim( (string) $payload['icon_url'] ) : '';
			$force       = ! empty( $payload['force'] );

			if ( '' === $logo_url && '' === $icon_url ) {
				return new \WP_Error( 'uich_branding_no_input', 'At least one of logo_url or icon_url must be provided.' );
			}

			$result = array(
				'logo' => null,
				'icon' => null,
			);

			// ── Logo ──────────────────────────────────────────────────────────
			if ( '' !== $logo_url ) {
				$current_logo_id = absint( get_theme_mod( 'custom_logo', 0 ) );
				if ( $current_logo_id && ! $force ) {
					$result['logo'] = array(
						'set'     => false,
						'skipped' => true,
						'reason'  => 'Custom logo already set (attachment_id: ' . $current_logo_id . '). Pass force=true to replace.',
						'current_url' => (string) wp_get_attachment_url( $current_logo_id ),
					);
				} else {
					$uploaded_url = self::mcp_sideload_image_from_url( $logo_url );
					if ( is_wp_error( $uploaded_url ) ) {
						$result['logo'] = array(
							'set'   => false,
							'error' => $uploaded_url->get_error_message(),
							'url'   => $logo_url,
						);
					} else {
						$attachment_id = self::mcp_find_attachment_id_by_url( $uploaded_url, $logo_url );
						if ( $attachment_id ) {
							set_theme_mod( 'custom_logo', $attachment_id );
							// Design-intended display size, from the AI-detected logo node
							// (plugin export). Read by the site-logo widget render — also
							// the only way an SVG logo gets a width/height at all, since
							// WordPress core can't read intrinsic SVG dimensions.
							if ( $logo_width && $logo_height ) {
								update_post_meta( $attachment_id, '_uich_logo_width', $logo_width );
								update_post_meta( $attachment_id, '_uich_logo_height', $logo_height );
							}
							$result['logo'] = array(
								'set'           => true,
								'attachment_id' => $attachment_id,
								'url'           => $uploaded_url,
							);
						} else {
							$result['logo'] = array(
								'set'   => false,
								'error' => 'Image uploaded but attachment ID could not be resolved.',
								'url'   => $uploaded_url,
							);
						}
					}
				}
			}

			// ── Site icon ─────────────────────────────────────────────────────
			if ( '' !== $icon_url ) {
				$current_icon_id = absint( get_option( 'site_icon', 0 ) );
				if ( $current_icon_id && ! $force ) {
					$result['icon'] = array(
						'set'     => false,
						'skipped' => true,
						'reason'  => 'Site icon already set (attachment_id: ' . $current_icon_id . '). Pass force=true to replace.',
						'current_url' => get_site_icon_url( 192 ),
					);
				} else {
					$uploaded_url = self::mcp_sideload_image_from_url( $icon_url );
					if ( is_wp_error( $uploaded_url ) ) {
						$result['icon'] = array(
							'set'   => false,
							'error' => $uploaded_url->get_error_message(),
							'url'   => $icon_url,
						);
					} else {
						$attachment_id = self::mcp_find_attachment_id_by_url( $uploaded_url, $icon_url );
						if ( $attachment_id ) {
							update_option( 'site_icon', $attachment_id );
							$result['icon'] = array(
								'set'           => true,
								'attachment_id' => $attachment_id,
								'url'           => $uploaded_url,
							);
						} else {
							$result['icon'] = array(
								'set'   => false,
								'error' => 'Image uploaded but attachment ID could not be resolved.',
								'url'   => $uploaded_url,
							);
						}
					}
				}
			}

			// Build summary message.
			$logo_ok = isset( $result['logo']['set'] ) && $result['logo']['set'];
			$icon_ok = isset( $result['icon']['set'] ) && $result['icon']['set'];
			$parts   = array();
			if ( null !== $result['logo'] ) {
				$parts[] = 'logo: ' . ( $logo_ok ? '✅ set' : ( isset( $result['logo']['skipped'] ) ? 'skipped (already exists)' : '❌ failed' ) );
			}
			if ( null !== $result['icon'] ) {
				$parts[] = 'icon: ' . ( $icon_ok ? '✅ set' : ( isset( $result['icon']['skipped'] ) ? 'skipped (already exists)' : '❌ failed' ) );
			}
			$result['message'] = 'Site branding: ' . implode( ', ', $parts ) . '.';

			return $result;
		}

		/**
		 * Resolve attachment ID from an uploaded URL + original source URL.
		 * Tries WordPress built-in lookup first, falls back to source meta query.
		 *
		 * @param string $uploaded_url URL returned by media_sideload_image / sideload helper.
		 * @param string $source_url   Original source URL before sideloading.
		 * @return int Attachment ID, or 0 if not found.
		 */
		private static function mcp_find_attachment_id_by_url( $uploaded_url, $source_url ) {
			// Primary: WordPress core lookup.
			$id = attachment_url_to_postid( $uploaded_url );
			if ( $id ) {
				return $id;
			}
			// Fallback: source URL meta recorded during sideload.
			$id = self::mcp_find_existing_attachment_by_source_url( $source_url );
			if ( $id ) {
				return $id;
			}
			// Last resort: query by the uploaded URL as source.
			return self::mcp_find_existing_attachment_by_source_url( $uploaded_url );
		}

		// ── Header/footer template helpers ────────────────────────────────────

		/**
		 * Deactivate ALL existing active header or footer templates across both
		 * Elementor Pro (elementor_library) and Nexter (nxt_builder) systems.
		 * Called automatically before creating a new template of the same type.
		 *
		 * @param string $type 'header' or 'footer'.
		 * @return array List of deactivated template descriptors { system, post_id, title }.
		 */
		/**
		 * MCP — create a single post theme builder template with a Proton widget.
		 *
		 * Priority chain:
		 *  1. Elementor Pro  → elementor_library "single" template, conditions: singular/{post_type}
		 *  2. Nexter         → nxt_builder "singular" template, active immediately
		 *  3. Neither        → returns system=none; caller should fall back to create_uichemy_composer_page
		 *
		 * Always returns published_posts_count so the caller knows whether to prompt for a sample post.
		 *
		 * @param array $payload Tool payload.
		 * @return array|\WP_Error
		 */
		public static function mcp_create_single_post_template( $payload ) {
			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return new \WP_Error( 'uich_elementor_missing', 'Elementor is not active.' );
			}

			if ( ! is_array( $payload ) ) {
				$payload = array();
			}

			$post_type = isset( $payload['post_type'] ) ? sanitize_key( (string) $payload['post_type'] ) : 'post';
			if ( '' === $post_type ) {
				$post_type = 'post';
			}

			$title         = isset( $payload['title'] ) ? sanitize_text_field( (string) $payload['title'] ) : 'Single Post — Protuno';
			$label         = isset( $payload['label'] ) ? sanitize_text_field( (string) $payload['label'] ) : 'Single Post';
			$source        = isset( $payload['source'] ) ? sanitize_text_field( (string) $payload['source'] ) : 'mcp';
			$raw_html      = isset( $payload['html'] ) ? (string) $payload['html'] : '';
			$raw_css       = isset( $payload['css'] ) ? (string) $payload['css'] : '';
			$raw_js        = isset( $payload['js'] ) ? (string) $payload['js'] : '';
			$site_css      = isset( $payload['site_css'] ) ? (string) $payload['site_css'] : '';
			$site_js       = isset( $payload['site_js'] ) ? (string) $payload['site_js'] : '';
			$upload_images = isset( $payload['upload_images'] ) ? (bool) $payload['upload_images'] : true;

			// Sample post parameters.
			$create_sample_post  = isset( $payload['create_sample_post'] ) ? (bool) $payload['create_sample_post'] : false;
			$sample_post_title   = isset( $payload['sample_post_title'] ) ? sanitize_text_field( (string) $payload['sample_post_title'] ) : '';
			$sample_post_content = isset( $payload['sample_post_content'] ) ? wp_kses_post( (string) $payload['sample_post_content'] ) : '';

			// When true, deactivate existing active single-post templates before creating the new one.
			// When false (default), return existing templates so the caller can ask the user first.
			$force_deactivate = isset( $payload['force_deactivate'] ) ? (bool) $payload['force_deactivate'] : false;

			// Always return published post count so AI can decide to prompt for sample creation.
			$post_counts           = wp_count_posts( $post_type );
			$published_posts_count = isset( $post_counts->publish ) ? (int) $post_counts->publish : 0;

			$has_elementor_pro = class_exists( '\ElementorPro\Plugin' ) || defined( 'ELEMENTOR_PRO_VERSION' );
			$has_nexter        = post_type_exists( 'nxt_builder' );

			// No theme builder available — caller should use create_uichemy_composer_page.
			if ( ! $has_elementor_pro && ! $has_nexter ) {
				return array(
					'system'                => 'none',
					'published_posts_count' => $published_posts_count,
					'message'               => 'Neither Elementor Pro nor Nexter Extension is active. Use create_uichemy_composer_page to build a regular page instead.',
				);
			}

			// Check for existing active single-post templates BEFORE doing any work.
			// If found and force_deactivate is false, return them so the caller can ask the user.
			$existing_active = self::mcp_detect_active_single_post_templates( $post_type );
			if ( ! empty( $existing_active ) && ! $force_deactivate ) {
				return array(
					'status'                  => 'existing_templates_found',
					'system'                  => 'none',
					'existing_active_templates' => $existing_active,
					'published_posts_count'   => $published_posts_count,
					'message'                 => 'Active single post template(s) already exist. Ask the user: "An active single post template already exists (' . implode( ', ', array_column( $existing_active, 'title' ) ) . '). Should I replace it with the new design?" If yes, call this tool again with force_deactivate=true.',
				);
			}

			if ( '' === trim( $raw_html ) && '' === trim( $raw_css ) && '' === trim( $raw_js ) ) {
				return new \WP_Error( 'uich_empty_generated_code', 'At least one of html, css, or js must be provided.' );
			}

			// Upload images.
			if ( $upload_images ) {
				$html_media_result = self::mcp_upload_html_images_to_media_library( $raw_html, $raw_css );
				$raw_html          = $html_media_result['html'];
				if ( isset( $html_media_result['css'] ) ) {
					$raw_css = (string) $html_media_result['css'];
				}
			} else {
				$html_media_result = array( 'html' => $raw_html, 'uploaded' => array(), 'failed' => array() );
			}

			// Run global matching (colors → vars, typography → .text-{id}) server-side.
			$globals_prepared = self::mcp_prepare_import_html_css_with_globals( $raw_html, $raw_css );
			$raw_html         = $globals_prepared['html'];
			$raw_css          = $globals_prepared['css'];

			// Persist site-level CSS/JS.
			self::mcp_append_site_custom_code( $site_css, $site_js );

			// Build Elementor widget/container structure.
			$widget_id    = strtolower( wp_generate_password( 7, false, false ) );
			$container_id = strtolower( wp_generate_password( 7, false, false ) );

			$widget_settings = array(
				'raw_html' => self::build_mcp_tagged_code_block( 'html', $raw_html, $source, $label ),
				'raw_css'  => self::build_mcp_tagged_code_block( 'css', $raw_css, $source, $label ),
				'raw_js'   => self::build_mcp_tagged_code_block( 'js', $raw_js, $source, $label ),
			);

			$elements = array(
				array(
					'id'       => $container_id,
					'elType'   => 'container',
					'isInner'  => false,
					'settings' => self::mcp_widget_container_default_settings(),
					'elements' => array(
						array(
							'id'         => $widget_id,
							'elType'     => 'widget',
							'widgetType' => 'proton',
							'settings'   => $widget_settings,
							'elements'   => array(),
						),
					),
				),
			);

			// Deactivate existing active single-post templates across both systems.
			$deactivated = self::mcp_deactivate_existing_single_post_templates( $post_type );

			// Create sample post if requested and approved.
			$sample_post_result = null;
			if ( $create_sample_post && '' !== $sample_post_title ) {
				$fallback_content   = '<p>This is a sample post created by Protuno to preview the single post template.</p>';
				$sample_post_id     = wp_insert_post( array(
					'post_title'   => $sample_post_title,
					'post_content' => '' !== $sample_post_content ? $sample_post_content : $fallback_content,
					'post_status'  => 'publish',
					'post_type'    => $post_type,
				) );
				if ( ! is_wp_error( $sample_post_id ) && $sample_post_id ) {
					$sample_post_result = array(
						'post_id'   => (int) $sample_post_id,
						'title'     => $sample_post_title,
						'permalink' => get_permalink( $sample_post_id ),
					);
					$published_posts_count++;
				}
			}

			// Resolve a preview URL (sample post first, then first existing post).
			$preview_url = '';
			if ( $sample_post_result ) {
				$preview_url = $sample_post_result['permalink'];
			} elseif ( $published_posts_count > 0 ) {
				$first_posts = get_posts( array(
					'numberposts' => 1,
					'post_type'   => $post_type,
					'post_status' => 'publish',
					'fields'      => 'ids',
					'orderby'     => 'date',
					'order'       => 'DESC',
				) );
				if ( ! empty( $first_posts ) ) {
					$preview_url = (string) get_permalink( (int) $first_posts[0] );
				}
			}

			// ── Priority 1: Elementor Pro ──────────────────────────────────────
			if ( $has_elementor_pro ) {
				$ep_post_id = 0;
				$document   = null;

				if ( isset( \Elementor\Plugin::$instance->documents )
					&& method_exists( \Elementor\Plugin::$instance->documents, 'create' )
				) {
					try {
						$document = \Elementor\Plugin::$instance->documents->create(
							'single',
							array(
								'post_title'  => $title,
								'post_status' => 'publish',
							)
						);
						if ( is_wp_error( $document ) || ! $document ) {
							$document = null;
						} else {
							$ep_post_id = $document->get_main_id();
						}
					} catch ( \Throwable $e ) {
						$document = null;
					}
				}

				// Fallback: plain wp_insert_post.
				if ( ! $ep_post_id ) {
					$ep_post_id = wp_insert_post( array(
						'post_title'  => $title,
						'post_type'   => 'elementor_library',
						'post_status' => 'publish',
					) );
					if ( is_wp_error( $ep_post_id ) || ! $ep_post_id ) {
						return new \WP_Error( 'uich_template_create_failed', 'Failed to create Elementor Pro single post template.' );
					}
					update_post_meta( $ep_post_id, '_elementor_document_type', 'single' );
				}

				update_post_meta( $ep_post_id, '_elementor_template_type', 'single' );
				update_post_meta( $ep_post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
				update_post_meta( $ep_post_id, '_elementor_edit_mode', 'builder' );
				update_post_meta( $ep_post_id, '_elementor_page_settings', array() );

				wp_set_object_terms( $ep_post_id, 'single', 'elementor_library_type' );

				if ( 'publish' !== get_post_status( $ep_post_id ) ) {
					wp_update_post( array( 'ID' => $ep_post_id, 'post_status' => 'publish' ) );
				}

				// Activate conditions: target all posts of the given post type.
				$condition_str  = 'include/singular/' . $post_type;
				$conditions_set = false;
				if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
					try {
						$cm = \ElementorPro\Modules\ThemeBuilder\Module::instance()->get_conditions_manager();
						if ( $cm && method_exists( $cm, 'save_conditions' ) ) {
							$cm->save_conditions( $ep_post_id, array( $condition_str ) );
							$conditions_set = true;
						}
					} catch ( \Throwable $e ) {
						// Fall through to raw fallback.
					}
				}

				if ( ! $conditions_set ) {
					update_post_meta( $ep_post_id, '_elementor_conditions', array( $condition_str ) );
					foreach ( array( 'elementor_pro_theme_builder_conditions', '_elementor_pro_conditions_index' ) as $_k ) {
						delete_option( $_k );
						wp_cache_delete( $_k, 'options' );
					}
					if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
						try {
							\ElementorPro\Modules\ThemeBuilder\Module::instance()
								->get_conditions_manager()
								->get_cache()
								->regenerate();
						} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
						}
					}
				}

				if ( isset( \Elementor\Plugin::$instance->files_manager ) ) {
					\Elementor\Plugin::$instance->files_manager->clear_cache();
				}

				return array(
					'post_id'                 => $ep_post_id,
					'system'                  => 'elementor_pro',
					'type'                    => 'single',
					'target_post_type'        => $post_type,
					'active'                  => true,
					'conditions_api_used'     => $conditions_set,
					'title'                   => get_the_title( $ep_post_id ),
					'published_posts_count'   => $published_posts_count,
					'sample_post'             => $sample_post_result,
					'elementor_link'          => add_query_arg( array( 'post' => $ep_post_id, 'action' => 'elementor' ), admin_url( 'post.php' ) ),
					'theme_builder_link'      => admin_url( 'edit.php?post_type=elementor_library&tabs_group=theme' ),
					'preview_link'            => $preview_url,
					'deactivated_templates'   => $deactivated,
					'image_uploads'           => $html_media_result['uploaded'],
					'image_failures'          => $html_media_result['failed'],
					'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
					'message'                 => 'Single post template created via Elementor Pro and is ACTIVE for all "' . $post_type . '" posts.',
				);
			}

			// ── Priority 2: Nexter Extension ──────────────────────────────────
			$nxt_post_id = wp_insert_post( array(
				'post_title'  => $title,
				'post_type'   => 'nxt_builder',
				'post_status' => 'publish',
			) );

			if ( is_wp_error( $nxt_post_id ) || ! $nxt_post_id ) {
				return new \WP_Error( 'uich_template_create_failed', 'Failed to create nxt_builder singular post template.' );
			}

			// nxt-hooks-layout-sections = 'singular' tells Nexter this is a singular page template.
			update_post_meta( $nxt_post_id, 'nxt-hooks-layout-sections', 'singular' );

			// Condition group: include all posts of the target post type.
			update_post_meta( $nxt_post_id, 'nxt-singular-group', array(
				array(
					'nxt-singular-include-exclude'  => 'include',
					'nxt-singular-conditional-rule' => $post_type,
					'nxt-singular-conditional-type' => array( 'all' ),
				),
			) );

			update_post_meta( $nxt_post_id, 'nxt_build_status', '1' );
			update_post_meta( $nxt_post_id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
			update_post_meta( $nxt_post_id, '_elementor_edit_mode', 'builder' );

			if ( 'publish' !== get_post_status( $nxt_post_id ) ) {
				wp_update_post( array( 'ID' => $nxt_post_id, 'post_status' => 'publish' ) );
			}

			// Bust Nexter's singular condition cache so the new template is picked up immediately.
			delete_option( 'nxt-build-cache-singular' );
			wp_cache_delete( 'nxt-build-cache-singular', 'options' );

			if ( isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			return array(
				'post_id'                 => $nxt_post_id,
				'system'                  => 'nexter',
				'type'                    => 'singular',
				'target_post_type'        => $post_type,
				'active'                  => true,
				'title'                   => get_the_title( $nxt_post_id ),
				'published_posts_count'   => $published_posts_count,
				'sample_post'             => $sample_post_result,
				'elementor_link'          => add_query_arg( array( 'post' => $nxt_post_id, 'action' => 'elementor' ), admin_url( 'post.php' ) ),
				'builder_link'            => admin_url( 'edit.php?post_type=nxt_builder' ),
				'preview_link'            => $preview_url,
				'deactivated_templates'   => $deactivated,
				'image_uploads'           => $html_media_result['uploaded'],
				'image_failures'          => $html_media_result['failed'],
				'dynamic_globals_matches' => $globals_prepared['dynamic_globals'],
				'message'                 => 'Single post template created via Nexter Theme Builder and is ACTIVE for all "' . $post_type . '" posts.',
			);
		}

		/**
		 * Detect all currently active single-post templates across Elementor Pro and Nexter.
		 * Returns descriptors without making any changes.
		 *
		 * @param string $post_type Target post type slug.
		 * @return array Active template descriptors { system, post_id, title }.
		 */
		private static function mcp_detect_active_single_post_templates( $post_type ) {
			$active = array();

			// Elementor Pro: elementor_library posts of type 'single' with non-empty conditions.
			$ep_posts = get_posts( array(
				'post_type'      => 'elementor_library',
				'post_status'    => 'publish',
				'posts_per_page' => 10,
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_query'     => array(
					array( 'key' => '_elementor_template_type', 'value' => 'single' ),
				),
			) );
			foreach ( $ep_posts as $pid ) {
				$conditions = get_post_meta( (int) $pid, '_elementor_conditions', true );
				if ( ! empty( $conditions ) && is_array( $conditions ) ) {
					$active[] = array(
						'system'  => 'elementor_pro',
						'post_id' => (int) $pid,
						'title'   => get_the_title( (int) $pid ),
					);
				}
			}

			// Nexter: nxt_builder posts for 'singular' with build status active.
			if ( post_type_exists( 'nxt_builder' ) ) {
				$nxt_posts = get_posts( array(
					'post_type'      => 'nxt_builder',
					'post_status'    => 'publish',
					'posts_per_page' => 10,
					'fields'         => 'ids',
					'no_found_rows'  => true,
					'meta_query'     => array(
						'relation' => 'AND',
						array( 'key' => 'nxt-hooks-layout-sections', 'value' => 'singular' ),
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

		/**
		 * Deactivate all currently active single-post templates across both Elementor Pro
		 * and Nexter so only the newly created template is active.
		 *
		 * @param string $post_type Target post type slug (used to scope Elementor Pro lookup).
		 * @return array Descriptors of deactivated templates.
		 */
		private static function mcp_deactivate_existing_single_post_templates( $post_type ) {
			$deactivated   = array();
			$ep_had_active = false;

			// ── Elementor Pro / elementor_library ─────────────────────────────
			$ep_posts = get_posts( array(
				'post_type'      => 'elementor_library',
				'post_status'    => 'publish',
				'posts_per_page' => 10,
				'fields'         => 'ids',
				'no_found_rows'  => true,
				'meta_query'     => array(
					array( 'key' => '_elementor_template_type', 'value' => 'single' ),
				),
			) );

			foreach ( $ep_posts as $pid ) {
				$pid        = (int) $pid;
				$conditions = get_post_meta( $pid, '_elementor_conditions', true );
				if ( empty( $conditions ) || ! is_array( $conditions ) ) {
					continue;
				}

				$api_deactivated = false;
				if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
					try {
						$cm = \ElementorPro\Modules\ThemeBuilder\Module::instance()->get_conditions_manager();
						if ( $cm && method_exists( $cm, 'save_conditions' ) ) {
							$cm->save_conditions( $pid, array() );
							$api_deactivated = true;
						}
					} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
					}
				}
				if ( ! $api_deactivated ) {
					update_post_meta( $pid, '_elementor_conditions', array() );
				}

				$ep_had_active = true;
				$deactivated[] = array(
					'system'  => 'elementor_pro',
					'post_id' => $pid,
					'title'   => get_the_title( $pid ),
				);
			}

			// ── Nexter Extension ──────────────────────────────────────────────
			if ( post_type_exists( 'nxt_builder' ) ) {
				$nxt_posts = get_posts( array(
					'post_type'      => 'nxt_builder',
					'post_status'    => 'publish',
					'posts_per_page' => 10,
					'fields'         => 'ids',
					'no_found_rows'  => true,
					'meta_query'     => array(
						'relation' => 'AND',
						array( 'key' => 'nxt-hooks-layout-sections', 'value' => 'singular' ),
						array( 'key' => 'nxt_build_status', 'value'   => '1' ),
					),
				) );
				foreach ( $nxt_posts as $pid ) {
					update_post_meta( (int) $pid, 'nxt_build_status', '0' );
					$deactivated[] = array(
						'system'  => 'nexter',
						'post_id' => (int) $pid,
						'title'   => get_the_title( (int) $pid ),
					);
				}
			}

			if ( empty( $deactivated ) ) {
				return $deactivated;
			}

			if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			if ( $ep_had_active ) {
				if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
					try {
						\ElementorPro\Modules\ThemeBuilder\Module::instance()
							->get_conditions_manager()
							->get_cache()
							->regenerate();
					} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement
					}
				}
				foreach ( array( 'elementor_pro_theme_builder_conditions', '_elementor_pro_conditions_index' ) as $_k ) {
					delete_option( $_k );
					wp_cache_delete( $_k, 'options' );
				}
			}

			return $deactivated;
		}

		private static function mcp_deactivate_existing_header_footer_templates( $type ) {
			$deactivated      = array();
			$ep_had_active    = false;

			// ── Elementor Pro / elementor_library templates ────────────────────
			$ep_posts = get_posts(
				array(
					'post_type'      => 'elementor_library',
					'post_status'    => 'publish',
					'posts_per_page' => 20,
					'fields'         => 'ids',
					'no_found_rows'  => true,
					'meta_query'     => array(
						array( 'key' => '_elementor_template_type', 'value' => $type ),
					),
				)
			);

			foreach ( $ep_posts as $pid ) {
				$pid        = (int) $pid;
				$conditions = get_post_meta( $pid, '_elementor_conditions', true );

				if ( empty( $conditions ) || ! is_array( $conditions ) ) {
					continue; // already inactive.
				}

				// Prefer Elementor Pro's own save_conditions() so it handles
				// its internal cache automatically.
				$api_deactivated = false;
				if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
					try {
						$cm = \ElementorPro\Modules\ThemeBuilder\Module::instance()->get_conditions_manager();
						if ( $cm && method_exists( $cm, 'save_conditions' ) ) {
							$cm->save_conditions( $pid, array() );
							$api_deactivated = true;
						}
					} catch ( \Throwable $e ) {
						// Fall through to raw meta update below.
					}
				}

				if ( ! $api_deactivated ) {
					// Fallback: direct meta clear.
					update_post_meta( $pid, '_elementor_conditions', array() );
				}

				$ep_had_active = true;
				$deactivated[] = array(
					'system'  => 'elementor_pro',
					'post_id' => $pid,
					'title'   => get_the_title( $pid ),
				);
			}

			// ── Nexter Extension templates ─────────────────────────────────────
			if ( post_type_exists( 'nxt_builder' ) ) {
				$nxt_posts = get_posts(
					array(
						'post_type'      => 'nxt_builder',
						'post_status'    => 'publish',
						'posts_per_page' => 20,
						'fields'         => 'ids',
						'no_found_rows'  => true,
						'meta_query'     => array(
							'relation' => 'AND',
							array( 'key' => 'nxt-hooks-layout-sections', 'value' => $type ),
							array( 'key' => 'nxt_build_status', 'value'   => '1' ),
						),
					)
				);
				foreach ( $nxt_posts as $pid ) {
					update_post_meta( (int) $pid, 'nxt_build_status', '0' );
					$deactivated[] = array(
						'system'  => 'nexter',
						'post_id' => (int) $pid,
						'title'   => get_the_title( (int) $pid ),
					);
				}
			}

			if ( empty( $deactivated ) ) {
				return $deactivated;
			}

			// ── Flush all caches ───────────────────────────────────────────────

			// 1. Elementor files cache (CSS/JS regeneration).
			if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			}

			// 2. Elementor Pro conditions cache — two strategies.
			if ( $ep_had_active ) {
				// Strategy A: call regenerate() via the conditions manager API.
				if ( class_exists( '\ElementorPro\Modules\ThemeBuilder\Module' ) ) {
					try {
						\ElementorPro\Modules\ThemeBuilder\Module::instance()
							->get_conditions_manager()
							->get_cache()
							->regenerate();
					} catch ( \Throwable $e ) {
						// Swallow — strategy B below will cover it.
					}
				}

				// Strategy B: hard-delete known compiled conditions option keys
				// so Elementor Pro rebuilds them fresh on the next request.
				// These keys cover all known Elementor Pro versions.
				$ep_cache_keys = array(
					'elementor_pro_theme_builder_conditions',
					'_elementor_pro_conditions_index',
				);
				foreach ( $ep_cache_keys as $opt_key ) {
					delete_option( $opt_key );
				}
				// Also clear any object cache copy.
				wp_cache_delete( 'elementor_pro_theme_builder_conditions', 'options' );
				wp_cache_delete( '_elementor_pro_conditions_index', 'options' );
			}

			return $deactivated;
		}

		// ── Admin bar shortcuts ────────────────────────────────────────────────

		/**
		 * Add "Edit Header" / "Edit Footer" shortcuts to the WordPress admin bar.
		 *
		 * Shows links for:
		 *  - Elementor Pro active templates (elementor_library with _elementor_conditions set)
		 *  - Nexter active templates (nxt_builder with nxt_build_status = 1)
		 *
		 * Only fires on the front-end for users with edit_posts capability.
		 *
		 * @param \WP_Admin_Bar $wp_admin_bar Admin bar instance.
		 * @return void
		 */
		public function add_header_footer_edit_links( $wp_admin_bar ) {
			if ( is_admin() ) {
				return;
			}

			if ( ! current_user_can( 'edit_posts' ) ) {
				return;
			}

			if ( ! class_exists( '\Elementor\Plugin' ) ) {
				return;
			}

			$type_labels = array(
				'header' => __( 'Edit Header', 'protuno' ),
				'footer' => __( 'Edit Footer', 'protuno' ),
			);

			foreach ( $type_labels as $type => $label ) {
				$posts = array(); // [ ['post_id' => int, 'title' => string] ]

				// 1. Elementor Pro active templates for this type.
				$ep_posts = get_posts(
					array(
						'post_type'      => 'elementor_library',
						'post_status'    => 'publish',
						'posts_per_page' => 5,
						'fields'         => 'ids',
						'no_found_rows'  => true,
						'orderby'        => 'ID',
						'order'          => 'DESC',
						'meta_query'     => array(
							array( 'key' => '_elementor_template_type', 'value' => $type ),
						),
					)
				);
				foreach ( $ep_posts as $pid ) {
					$conditions = get_post_meta( (int) $pid, '_elementor_conditions', true );
					if ( ! empty( $conditions ) && is_array( $conditions ) ) {
						$posts[] = array( 'post_id' => (int) $pid, 'title' => get_the_title( (int) $pid ) );
					}
				}

				// 2. Nexter active templates for this type.
				if ( post_type_exists( 'nxt_builder' ) ) {
					$nxt_posts = get_posts(
						array(
							'post_type'      => 'nxt_builder',
							'post_status'    => 'publish',
							'posts_per_page' => 5,
							'fields'         => 'ids',
							'no_found_rows'  => true,
							'orderby'        => 'ID',
							'order'          => 'DESC',
							'meta_query'     => array(
								'relation' => 'AND',
								array( 'key' => 'nxt-hooks-layout-sections', 'value' => $type ),
								array( 'key' => 'nxt_build_status', 'value'   => '1' ),
							),
						)
					);
					foreach ( $nxt_posts as $pid ) {
						$posts[] = array( 'post_id' => (int) $pid, 'title' => get_the_title( (int) $pid ) );
					}
				}

				if ( empty( $posts ) ) {
					continue;
				}

				$node_id    = 'uichemy-edit-' . $type;
				$icon_html  = '<span class="ab-icon dashicons dashicons-edit" style="font-size:16px;vertical-align:middle;margin-right:4px;"></span>';

				if ( 1 === count( $posts ) ) {
					$post_id  = $posts[0]['post_id'];
					$edit_url = add_query_arg(
						array( 'post' => $post_id, 'action' => 'elementor' ),
						admin_url( 'post.php' )
					);
					$wp_admin_bar->add_node(
						array(
							'id'    => $node_id,
							'title' => $icon_html . esc_html( $label ),
							'href'  => esc_url( $edit_url ),
							'meta'  => array( 'target' => '_blank' ),
						)
					);
				} else {
					$wp_admin_bar->add_node(
						array(
							'id'    => $node_id,
							'title' => $icon_html . esc_html( $label ),
							'href'  => '#',
						)
					);
					foreach ( $posts as $entry ) {
						$post_id  = $entry['post_id'];
						$edit_url = add_query_arg(
							array( 'post' => $post_id, 'action' => 'elementor' ),
							admin_url( 'post.php' )
						);
						$wp_admin_bar->add_node(
							array(
								'parent' => $node_id,
								'id'     => $node_id . '-' . $post_id,
								'title'  => esc_html( $entry['title'] ),
								'href'   => esc_url( $edit_url ),
								'meta'   => array( 'target' => '_blank' ),
							)
						);
					}
				}
			}
		}
	}

	new Protuno_Proton_Manager();
}