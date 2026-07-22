<?php
namespace PopupBuilderBlock\Hooks;

defined( 'ABSPATH' ) || exit;

class ThirdPartyCompatibility {
	public function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'blocks_compatibility' ) );
	}

	public function blocks_compatibility() {
		$theme = wp_get_theme();
		$is_block_theme = $theme->is_block_theme();
		if ( empty( $is_block_theme ) ) {
			$compatibility_editor_assets = include_once POPUP_BUILDER_BLOCK_PLUGIN_DIR . 'build/compatibility/frontend.asset.php';
			wp_enqueue_style(
				'gutenkit-third-party-editor-compatibility',
				POPUP_BUILDER_BLOCK_PLUGIN_URL . 'build/compatibility/frontend.css',
				$compatibility_editor_assets['dependencies'],
				$compatibility_editor_assets['version']
			);
		}
	}
}
