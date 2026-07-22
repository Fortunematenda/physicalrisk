<?php
namespace Gutenkit\Libs;

defined('ABSPATH') || exit;

use \Gutenkit\Helpers\Utils;

class AssetGenerator extends \Gutenkit\Libs\FontLoadLocally {
	use \Gutenkit\Traits\Singleton;

	/**
	 * Defining css
	 */
	protected $css = '';

	/**
	 * Defining fonts
	 */
	protected $fonts = array();

	/**
	 * AssetGenerator class constructor.
	 * private for singleton
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function __construct() {
		add_action( 'save_post', array( $this, 'save_fonts' ), 10, 3 );
		add_filter( 'render_block_data', array( $this, 'set_blocks_css' ), 10 );
		add_filter( 'wp_resource_hints', array( $this, 'fonts_resource_hints' ), 10, 2 );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_scripts' ), 10 );
		add_action( 'enqueue_block_assets', array($this, 'enqueue_block_fonts'), 10 );
		add_action( 'enqueue_block_assets', array($this, 'load_fse_font'), 10 );
	}

	/**
	 * recursively combine blocks assets based on used blocks
	 *
	 * @param array $blocks
	 * @return $result array | $blocks_data
	 */
	protected function combine_blocks_asstes( $parsed_block = array() ) {
		// combine blocks assets
		$blocks_css = [];

		if( isset($parsed_block['blockName']) && strpos($parsed_block['blockName'], 'gutenkit') !== false ) {
			// block css
			$active_modules = \Gutenkit\Config\Modules::get_active_modules_list();
			$has_dynamic_background = false;
			// Check if 'backgroundTracker' exists before using it
			 
			if ( isset( $parsed_block['attrs']['blocksCSS'] ) && (empty( $active_modules['dynamic-content'] ) || !$has_dynamic_background ) ) {
				foreach ( $parsed_block['attrs']['blocksCSS'] as $device => $css ) {
					if (!isset($blocks_css[$device])) {
						$blocks_css[$device] = '';
					}

					if (is_string($css)) {
						$blocks_css[$device] .= $css;
					}
				}
			}

			// block typography
			$this->set_typography( $parsed_block );

			// block common style
			if ( isset( $parsed_block['attrs']['commonStyle'] ) && (empty( $active_modules['dynamic-content'] ) || !$has_dynamic_background) ) {
				foreach ( $parsed_block['attrs']['commonStyle'] as $device => $css ) {
					if (!isset($blocks_css[$device])) {
						$blocks_css[$device] = '';
					}

					$blocks_css[$device] .= $css;
				}
			}
		}

		// concate css/js content into a single file
		$css_content = '';
		$is_custom_styles_added = false;
		$device_list = Utils::get_device_list();

		if (!empty($blocks_css)) {
			foreach ($device_list as $device) {
				foreach ($blocks_css as $key => $block) {
					if (!empty($block) && trim($block) !== '') {
						$direction = isset($device['direction']) ? $device['direction'] : 'max';
						$width = isset($device['value']) ? $device['value'] : '';
						$device_key = isset($device['slug']) ? strtolower($device['slug']) : '';

						if (isset($device['value']) && $device['value'] == 'base' && $key == 'desktop') {
							$css_content .= $block;
						} elseif (!empty($direction) && !empty($width) && $device_key == $key) {
							$css_content .= '@media (' . $direction . '-width: ' . $width . 'px) {' . trim($block) . '}';
						}

						if ($key == 'customStyles' && !$is_custom_styles_added) {
							$is_custom_styles_added = true;
							$css_content .= $block;
						}
					}
				}
			}
		}

		return $css_content;
	}

	/**
	 * Sets typography for the parsed block.
	 *
	 * @param array $parsed_block
	 * @return void
	 */
	protected function set_typography($parsed_block) {
		if ( isset( $parsed_block['attrs'] ) ) {
			$typographies = array_filter(
				$parsed_block['attrs'],
				function ( $key ) {
					$key = strtolower($key);
        			return str_contains($key, 'typography') || str_contains($key, 'typo');
				},
				ARRAY_FILTER_USE_KEY
			);

			if ( ! empty( $typographies ) ) {
				foreach ( $typographies as $typography ) {
					$font_weight = ! empty( $typography['fontWeight']['value'] ) ? $typography['fontWeight']['value'] : 400;
					if( ! empty( $typography['fontFamily']['value'] ) ) {
						$this->fonts[$typography['fontFamily']['value']][] = $font_weight;
					}
				}
			}
		}
	}

	/**
	 * Processes font attributes when a post is saved.
	 *
	 * @param int      $post_id The ID of the post being saved.
	 * @param WP_Post  $post    The post object.
	 * @param bool     $update  Whether this is an existing post being updated.
	 * @return void
	 */
	public function save_fonts($post_id, $post, $update){
		if (isset($post->post_status) && 'auto-draft' == $post->post_status) {
			return;
		}

		if (false !== wp_is_post_revision($post_id)) {
			return;
		}

		if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
			return;
		}

		if (! $update) {
			return;
		}

		// get post blocks
		$post = get_post($post_id);

		// Bail if no post content
		if (empty($post->post_content)) {
			return;
		}

		$parse_blocks = $this->filter_blocks(parse_blocks($post->post_content));
		if($parse_blocks) {
			foreach ($parse_blocks as $block) {
				if (isset($block['attrs']) && !empty($block['attrs'])) {
					$this->set_typography($block);
				}
			}
		}

		// Check if fonts are set
		if($this->fonts) {
			$this->load_font($this->fonts);
		}
	}

	/**
	 * Sets the CSS for the blocks.
	 *
	 * @param array $parsed_block The parsed block data.
	 * @return array The modified parsed block data.
	 */
	public function set_blocks_css( $parsed_block ) {
		$parsed_block = apply_filters( 'gutenkit/collected_css', $parsed_block );
		$css_content = $this->combine_blocks_asstes( $parsed_block );
		if(!empty($css_content)) {
			$this->css .= $css_content;
		}

		return $parsed_block;
	}

	/**
	 * Add preconnect for Google Fonts.
	 *
	* @param array  $urls URLs to print for resource hints.
	* @param string $relation_type The relation type the URLs are printed.
	* @return array
	*/
	public function fonts_resource_hints( $urls, $relation_type ) {
		if ( wp_style_is( 'gkit-google-fonts', 'queue' ) && 'preconnect' === $relation_type ) {
			$urls[] = array(
				'href' => 'https://fonts.gstatic.com',
				'crossorigin',
			);
		}

		return $urls;
	}

	/**
	 * Enqueues the Google Fonts stylesheet if available.
	 * Enqueues inline styles for the Gutenkit frontend.
	 */
	public function enqueue_scripts() {
		global $post;

		// If the theme is not a block theme, parse the blocks and set the CSS.
		if( ! wp_is_block_theme() && ! empty($post->post_content) ) {
			do_blocks($post->post_content);
		}

		// This checks if the $css property is not empty and adds it as inline styles to the 'gutenkit-frontend-common' stylesheet.
		$generated_css = apply_filters( 'gutenkit/generated_css', $this->css );
		if(!empty($generated_css)) {
			wp_add_inline_style( 'gutenkit-frontend-common', Utils::cssminifier( $generated_css ) );
		}
	}

	/**
	 * Generate Google Font URL
	 * Combine multiple google font in one URL
	 *
	 * @return string|bool
	 */
	protected function generate_fonts_url() {
		if ( empty( $this->fonts ) ) {
			return false;
		}

		$fonts = $this->check_existing_fonts($this->fonts);

		$font_families = array();
		$font_url      = 'https://fonts.googleapis.com/css2?family=';

		// Remove duplicates and sort weights for each font
		$all_fonts = array_map(function($weights) {
			$weights = array_unique($weights);
			sort($weights);
			return $weights;
		}, $fonts);

		foreach ( $all_fonts as $font => $weights ) {
			$regular_weights = [];
			$italic_weights  = [];

			foreach ( $weights as $weight ) {
				// Sanitize weight
				if ( in_array( $weight, ['normal', 'inherit', 'initial'], true ) ) {
					$weight = '400';
				}

				if ( strpos( $weight, 'italic' ) !== false ) {
					$weight = str_replace( 'italic', '', $weight );
					$weight = $weight === '' ? '400' : $weight;
					$italic_weights[] = '1,' . $weight;
				} else {
					$regular_weights[] = '0,' . $weight;
				}
			}

			// Combine and sort
			$combined_weights = array_merge( $regular_weights, $italic_weights );
			$combined_weights = array_unique( $combined_weights );
			sort( $combined_weights );

			// Build font family string
			$font_param = str_replace( ' ', '+', $font );

			if ( ! empty( $italic_weights ) ) {
				$font_param .= ':ital,wght@' . implode( ';', $combined_weights );
			} else {
				// Only regular
				$only_weights = array_map( function( $w ) {
					return explode( ',', $w )[1]; // extract weight part
				}, $regular_weights );

				$font_param .= ':wght@' . implode( ';', array_unique( $only_weights ) );
			}

			$font_families[] = $font_param;
		}

		$font_url .= implode( '&family=', $font_families );
		$font_url .= '&display=swap';

		return $font_url;
	}

	/**
	 * Enqueues the block assets, including Google Fonts.
	 *
	 * @return void
	 */
	public function enqueue_block_fonts() {
		$load_font_locally = Utils::get_settings('load_google_fonts');
		if($load_font_locally) {
			$this->load_font($this->fonts);
		} else {
			$fonts_url = $this->generate_fonts_url();

			// Bail early if no fonts are defined
			if (empty($fonts_url)) {
				return;
			}

			// Load from Google (external)
			$this->enqueue_fonts_inline($fonts_url);
		}
	}

	/**
	 * Enqueue fonts inline using @import.
	 *
	 * @param string $fonts_url Google Fonts or local fonts URL.
	 */
	public function enqueue_fonts_inline($fonts_url) {
		if (empty($fonts_url)) return;

		$handle    = 'gkit-google-fonts-cdn';
		$fonts_css = "@import url('$fonts_url');";

		wp_register_style($handle, false);
		wp_add_inline_style($handle, $fonts_css);
		wp_enqueue_style($handle);
	}
}
