<?php
namespace PopupBuilderBlock\Hooks;

defined( 'ABSPATH' ) || exit;


use PopupBuilderBlock\Helpers\Utils;

class Enqueue {
	/**
	 * class constructor.
	 * private for singleton
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function __construct() {
		add_action( 'enqueue_block_editor_assets', array( $this, 'load_editor_assets' ) );
		add_action( 'enqueue_block_assets', array( $this, 'load_frontend_assets' ) );
		add_action( 'popup_builder_block/before_popup_render', array( $this, 'load_frontend_css' ) );
	}

	/**
	 * Loads scripts and styles for the block editor.
	 */
	public function load_editor_assets(): void {
		if ( in_array( get_post_type(), Utils::post_type() ) ) {
			$this->enqueue_scripts(
				array(
					'components' => [
						'key' => 'gkit-components', 
						'path' => 'popup/components.js'
					],
					'helpers'    => [
						'key' => 'gkit-helpers',
						'path' => 'popup/helpers.js'
					],
					'global'     => [
						'key' => 'popupkit-global',
						'path' => 'popup/global.js'
					],
				)
			);
		}
	}

	/**
	 * Loads frontend styles for blocks.
	 */
	public function load_frontend_assets(): void {
		// Enqueue styles for gutenberg editor
		if ( in_array( get_post_type(), Utils::post_type() ) && is_admin() ) {
			$this->enqueue_styles(
				array(
					'components' => [
						'key' =>'gkit-components',
						'path' => 'popup/components.css'
					],
					'global'     => [
						'key' => 'popupkit-global',
						'path' => 'popup/global.css'
					],
				)
			);
		}
		
		// Check if the script should load only on single popup campaign pages and not in an iframe
		if ( is_singular( Utils::post_type() ) && ! Utils::is_iframe() ) {
			wp_enqueue_style(
				'popup-builder-block-single-style',
				POPUP_BUILDER_BLOCK_PLUGIN_URL . 'includes/Templates/assets/style.css',
				array(),
				POPUP_BUILDER_BLOCK_PLUGIN_VERSION
			);

			// Add inline styles
			$inline_css = '
				body {
					background: #fff;
					background-image: radial-gradient(#999 5%, transparent 0);
					background-size: 35px 35px;
				}
				.popup-builder-modal[data-settings*="\"type\":\"inline\""] {
					height: 100vh;
				}
			';

			wp_add_inline_style(
				'popup-builder-block-single-style',
				apply_filters( 'popup_builder_block/custom_styles', $inline_css )
			);
		}

		// Check if the script should load only on single popup campaign pages
		if ( is_singular( Utils::post_type() ) ) {
			// Dequeue styles and scripts that are not needed for the preview
			wp_dequeue_style( 'admin-bar' );
			wp_dequeue_style( 'dashicons' );

			// Enqueue global CSS for the preview page
			$this->enqueue_styles(
				array(
					'global' => [
						'key'  => 'popupkit-global',
						'path' => 'popup/global.css',
					],
				)
			);

			// Enqueue the block CSS file for the preview
			$upload_dir = wp_upload_dir();
			$post_id    = get_the_ID();
			$css_file   = $upload_dir['basedir'] . "/popupkit/$post_id.css";

			if ( file_exists( $css_file ) ) {
				wp_enqueue_style(
					"popup-builder-block-$post_id",
					$upload_dir['baseurl'] . "/popupkit/$post_id.css",
					array(),
					filemtime( $css_file )
				);
			}
		}
	}

	public function load_frontend_css( $post_id ): void {
		// Enqueue global CSS when popup is rendered
		$this->enqueue_styles(
			array(
				'global' => [
					'key' => 'popupkit-global',
					'path' => 'popup/global.css'
				],
			)
		);
		
		$upload_dir = wp_upload_dir();
		$css_file   = $upload_dir['basedir'] . "/popupkit/$post_id.css";
		if ( file_exists( $css_file ) ) {
			wp_enqueue_style(
				"popup-builder-block-$post_id",
				$upload_dir['baseurl'] . "/popupkit/$post_id.css",
				array(),
				filemtime( $css_file )
			);
		}
	}

	/**
	 * Helper method to enqueue scripts dynamically.
	 *
	 * @param array $scripts Associative array of script handles and paths.
	 */
	private function enqueue_scripts( array $scripts ): void {
		foreach ( $scripts as $handle => $file ) {
			$asset_file = POPUP_BUILDER_BLOCK_PLUGIN_DIR . "build/popup/$handle.asset.php";
			
			if ( file_exists( $asset_file ) ) {
				$asset = include_once $asset_file;
				wp_enqueue_script(
					"{$file['key']}",
					POPUP_BUILDER_BLOCK_PLUGIN_URL . "build/{$file['path']}",
					$asset['dependencies'],
					$asset['version'],
					array( 'in_footer' => false )
				);
			}
		}
	}

	/**
	 * Helper method to enqueue styles dynamically.
	 *
	 * @param array $styles Associative array of style handles and paths.
	 */
	private function enqueue_styles( array $styles ): void {
		foreach ( $styles as $handle => $file ) {
			wp_enqueue_style(
				"{$file['key']}",
				POPUP_BUILDER_BLOCK_PLUGIN_URL . "build/{$file['path']}",
				array(),
				POPUP_BUILDER_BLOCK_PLUGIN_VERSION
			);
		}
	}
}
