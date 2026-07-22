<?php

/**
 * Plugin Name: PopupKit
 * Description: Powerful popup builder with ready templates and easy customization.
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * Plugin URI: https://wpmet.com/plugin/popupkit
 * Author: Wpmet
 * Version: 2.3.2
 * Author URI: https://wpmet.com/
 * License: GPL-3.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 *
 * Text Domain: popup-builder-block
 * Domain Path: /languages
 *
 */

// Exit if accessed directly.
if (!defined('ABSPATH')) {
	exit;
}

/**
 * Final class for the Popup Builder Block plugin.
 *
 * @since 1.0.0
 */
final class PopupBuilderBlock {
	/**
	 * The version number of the Popup Builder Block plugin.
	 *
	 * @var string
	 */
	const VERSION = '2.3.2';

	/**
	 * \PopupKit class constructor.
	 * private for singleton
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function __construct() {
		// Plugins helper constants
		$this->helper_constants();

		// Load after plugin activation
		register_activation_hook(__FILE__, array($this, 'activated_plugin'));

		// Load after plugin deactivation
		register_deactivation_hook(__FILE__, array($this, 'deactivated_plugin'));

		// Add popup link to the plugin action links
		add_filter('plugin_action_links', array( $this, 'add_popup_link'), 10, 2 );

		// Hook into the plugin_row_meta filter
		add_filter( 'plugin_row_meta', [ $this, 'plugin_row_meta' ], 10, 2 );

		// Load the scoped vendor autoload file
		if ( file_exists( POPUP_BUILDER_BLOCK_PLUGIN_DIR . 'scoped/vendor/scoper-autoload.php' ) ) {
			require_once POPUP_BUILDER_BLOCK_PLUGIN_DIR . 'scoped/vendor/scoper-autoload.php';
		}

		// Plugin actions
		add_action( 'plugins_loaded', array( $this, 'plugins_loaded' ) );

		// Plugin unfiltered file support
		add_action( 'init', array( $this, 'process_libs' ) );
	}

	/**
	 * Helper method for plugin constants.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function helper_constants() {
		define('POPUP_BUILDER_BLOCK_PLUGIN_VERSION', self::VERSION);
		define('POPUP_BUILDER_BLOCK_PLUGIN_URL', trailingslashit(plugin_dir_url(__FILE__)));
		define('POPUP_BUILDER_BLOCK_PLUGIN_DIR', trailingslashit(plugin_dir_path(__FILE__)));
		define('POPUP_BUILDER_BLOCK_INC_DIR', POPUP_BUILDER_BLOCK_PLUGIN_DIR . 'includes/');
		define('POPUP_BUILDER_BLOCK_DIR', POPUP_BUILDER_BLOCK_PLUGIN_DIR . 'build/blocks/');
		define('POPUP_BUILDER_BLOCK_API_URL', 'https://wpmet.com/plugin/popupkit/wp-content/plugins/');
	}

	/**
	 * Add popup link to the plugin action links.
	 *
	 * @param array  $plugin_actions An array of plugin action links.
	 * @param string $plugin_file    Path to the plugin file relative to the plugins directory.
	 * @return array An array of plugin action links.
	 * @since 1.0.0
	 */
	public function add_popup_link( $plugin_actions, $plugin_file ) {
		$plugin_slug = 'popup-builder-block';
		$plugin_name = "{$plugin_slug}/{$plugin_slug}.php";

		if ( $plugin_file === $plugin_name ) {
			// Add "Build Popup" link at the beginning
			$menu_link = 'admin.php?page=popupkit#campaigns';
			$settings_link = sprintf(
				'<a href="%s">%s</a>',
				esc_url( $menu_link ),
				esc_html__( 'Build Popup', 'popup-builder-block' )
			);

			array_unshift( $plugin_actions, $settings_link );
			// Add "Get PopupKit Pro" link at the end
			if ( ! class_exists( 'PopupBuilderBlockPro' ) ) {
				$popup_kit_pro_link = sprintf(
					'<a href="%1$s" target="_blank" style="font-weight: 700; color: #b32d2e;">%2$s</a>',
					'https://wpmet.com/ftopro',
					esc_html__( 'Get PopupKit Pro', 'popup-builder-block' )
				);

				$plugin_actions['get_popupkit_pro'] = $popup_kit_pro_link;
			}
		}

		return $plugin_actions;
	}

	/**
	 * Plugin row meta.
	 *
	 * Adds row meta links to the plugin list table
	 *
	 * Fired by `plugin_row_meta` filter.
	 *
	 * @since 2.0.2
	 */
	public function plugin_row_meta( $plugin_meta, $plugin_file ) {
		if ( plugin_basename( __FILE__ ) === $plugin_file ) {
			$row_meta = [
				'docs' => '<a href="https://wpmet.com/doc/popupkit/" aria-label="' . esc_attr( esc_html__( 'View PopupKit Documentation', 'popup-builder-block' ) ) . '" target="_blank">' . esc_html__( 'Docs & FAQs', 'popup-builder-block' ) . '</a>',
				'video' => '<a href="https://tinyurl.com/35pc4dcc" aria-label="' . esc_attr( esc_html__( 'View PopupKit Video Tutorials', 'popup-builder-block' ) ) . '" target="_blank">' . esc_html__( 'Video Tutorials', 'popup-builder-block' ) . '</a>',
			];

			$plugin_meta = array_merge( $plugin_meta, $row_meta );
		}

		return $plugin_meta;
	}

	/**
	 * Activated plugin method.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function activated_plugin() {
		// Manually register CPT before flushing
		\PopupBuilderBlock\Hooks\Cpt::popup_builder_cpt();
		\PopupBuilderBlock\Helpers\DataBase::createDB();

		// Record first install time once, used for deactivation feedback "active days".
		if ( ! get_option( 'popupkit_installed_time' ) ) {
			update_option( 'popupkit_installed_time', time() );
		}

		flush_rewrite_rules();
	}

	/**
	 * Deactivated plugin method.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function deactivated_plugin() {
		$timestamp = wp_next_scheduled('pbb_daily_event');
    	if($timestamp) wp_unschedule_event($timestamp, 'pbb_daily_event');

		flush_rewrite_rules();
	}

	/**
	 * Plugins loaded method.
	 * loads our others classes and textdomain.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function plugins_loaded() {
		/**
		 * Fires before the initialization of the PopupKit plugin.
		 *
		 * This action hook allows developers to perform additional tasks before the PopupKit plugin has been initialized.
		 * @since 1.0.0
		 */
		do_action( 'popup_builder_block/before_init' );

		/**
		 * Initializes the Popup Builder Block admin functionality.
		 *
		 * This function creates an instance of the PopupBuilderBlock\Admin\Admin class and initializes the admin functionality for the Popup Builder Block plugin.
		 *
		 * @since 1.0.0
		 */
		new PopupBuilderBlock\Admin\Admin();
		new PopupBuilderBlock\Config\Init();
		new PopupBuilderBlock\Hooks\Init();
		new PopupBuilderBlock\Routes\Init();
	}

	/**
	 * Process libs method.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function process_libs() {
		new PopupBuilderBlock\Libs\UnfilteredFileSupport();
		new PopupBuilderBlock\Libs\UtilityPackages();
	}
}

/**
 * Kickoff the plugin
 *
 * @since 1.0.0
 *
 */
new PopupBuilderBlock();
