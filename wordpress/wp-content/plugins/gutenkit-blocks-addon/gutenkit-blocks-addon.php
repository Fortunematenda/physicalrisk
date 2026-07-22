<?php
/**
 * Plugin Name: GutenKit Blocks
 * Description: Faster loading blocks, patterns, and templates for Gutenberg, bringing the page builder experience to block editor.
 * Requires at least: 6.1
 * Requires PHP: 7.4
 * Plugin URI: https://wpgutenkit.com/
 * Author: Wpmet
 * Version: 2.4.10
 * Author URI: https://wpmet.com/
 * License: GPL-3.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 *
 * Text Domain: gutenkit-blocks-addon
 * Domain Path: /languages
 *
 * GutenKit is a powerful blocks addon for gutenberg builder.
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Final class for the \Gutenkit plugin.
 *
 * @since 1.0.0
 */
final class Gutenkit {
	/**
	 * The version number of the Gutenkit Blocks Addon plugin.
	 *
	 * @var string
	 */
	const VERSION = '2.4.10';

	/**
	 * \Gutenkit class constructor.
	 * private for singleton
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function __construct() {
		// Plugins helper constants
		$this->helper_constants();

		// Load after plugin activation
		register_activation_hook( __FILE__, array( $this, 'activated_plugin' ) );

		// Redirect to the settings page after activation
		add_action( 'admin_init', array( $this, 'admin_redirect' ) );

		// Make sure ADD AUTOLOAD is scoped/vendor/scoper-autoload.php file
		require_once GUTENKIT_PLUGIN_DIR . 'scoped/vendor/scoper-autoload.php';

		// Plugin actions
		add_action( 'plugins_loaded', array( $this, 'plugins_loaded' ) );

		/**
		 * Fires while initialization of the GutenKit plugin.
		 *
		 * This action hook allows developers to perform additional tasks while the GutenKit plugin has been initialized.
		 *
		 * @since 1.0.0
		 */
		do_action( 'gutenkit/init' );
	}

	/**
	 * Helper method for plugin constants.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function helper_constants() {
		define( 'GUTENKIT_PLUGIN_VERSION', self::VERSION );
		define( 'GUTENKIT_PLUGIN_NAME', 'GutenKit' );
		define( 'GUTENKIT_PLUGIN_URL', trailingslashit( plugin_dir_url( __FILE__ ) ) );
		define( 'GUTENKIT_PLUGIN_DIR', trailingslashit( plugin_dir_path( __FILE__ ) ) );
		define( 'GUTENKIT_BLOKS_INC_DIR', GUTENKIT_PLUGIN_DIR . 'includes/' );
		define( 'GUTENKIT_BLOKS_STYLE_DIR', GUTENKIT_PLUGIN_DIR . 'build/styles/' );
		define( 'GUTENKIT_BLOCKS_DIR', GUTENKIT_PLUGIN_DIR . 'build/blocks/' );
		define( 'GUTENKIT_API_URL', 'https://wpgutenkit.com/' );
	}

	/**
	 * After activation hook method
	 * add version to the options table if not exists yet and update the version if already exists.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function activated_plugin() {
		// update vertion to the options table
		update_option( 'gutenkit_version', GUTENKIT_PLUGIN_VERSION );

		// added installed time after checking time exist or not
		if ( ! get_option( 'gutenkit_installed_time' ) ) {
			add_option( 'gutenkit_installed_time', time() );
		}

		// Check if the plugin is activated via bulk action
		$action = isset($_REQUEST['action']) ? sanitize_text_field($_REQUEST['action']) : '';
		if ($action === 'activate-selected') {
			return;
		}

		// redirect to the settings page after activation
		add_option('gutenkit_do_activation_redirect', true);
	}

	/**
	 * Redirect to the settings page after activation.
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function admin_redirect() {
		if ( get_option('gutenkit_do_activation_redirect', false) ) {
			delete_option('gutenkit_do_activation_redirect');
			wp_safe_redirect( admin_url( 'admin.php?page=gutenkit&activation-redirect=1' ) );
			exit;
		}
	}

	/**
	 * Adds action links to the plugin list table.
	 *
	 * This adds a "Settings" link and a "Go Pro" link to the plugin's action links on the Plugins page.
	 *
	 * @since 2.0.2
	*/
	public function plugin_action_links( $links ) {
		$settings_link = sprintf(
			'<a href="%1$s">%2$s</a>',
			admin_url( 'admin.php?page=gutenkit#welcome' ),
			esc_html__( 'Settings', 'gutenkit-blocks-addon' )
		);

		// Only add "Go Pro" link if Pro version is NOT active
		if ( ! class_exists( 'GutenkitPro' ) ) {
			$gkit_pro_text = esc_html__( 'Get GutenKit Pro', 'gutenkit-blocks-addon' );
			$gkit_pro_link = sprintf(
				'<a href="%1$s" target="_blank" style="font-weight: 700; color: #b32d2e;">%2$s</a>',
				'https://wpgutenkit.com/pricing/',
				$gkit_pro_text
			);
			$links['gutenkit-pro'] = $gkit_pro_link;
		}
		array_unshift( $links, $settings_link );

		return $links;
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
				'docs' => '<a href="https://wpmet.com/doc/gutenkit/" aria-label="' . esc_attr( esc_html__( 'View Gutenkit Documentation', 'gutenkit-blocks-addon' ) ) . '" target="_blank">' . esc_html__( 'Docs & FAQs', 'gutenkit-blocks-addon' ) . '</a>',
				'ideo' => '<a href="https://tinyurl.com/yc3w3u7m" aria-label="' . esc_attr( esc_html__( 'View Gutenkit Video Tutorials', 'gutenkit-blocks-addon' ) ) . '" target="_blank">' . esc_html__( 'Video Tutorials', 'gutenkit-blocks-addon' ) . '</a>',
			];

			$plugin_meta = array_merge( $plugin_meta, $row_meta );
		}

		return $plugin_meta;
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
		 * Fires before the initialization of the GutenKit plugin.
		 *
		 * This action hook allows developers to perform additional tasks before the GutenKit plugin has been initialized.
		 * @since 1.0.0
		 */
		do_action( 'gutenkit/before_init' );

		/**
		 * Action & Filter hooks.
		 *
		 * @return void
		 * @since 1.2.9
		 */
		Gutenkit\Hooks\Init::instance();

		/**
		 * Register & Enqueue assets.
		 *
		 * @return void
		 * @since 1.0.0
		 */
		Gutenkit\Core\Enqueue::instance();

		/**
		 * Global Classes Post Type.
		 *
		 * @return void
		 * @since 2.0.0
		 */
		Gutenkit\Core\ClassManager::instance();

		/**
		 * Register Modules.
		 *
		 * @return void
		 * @since 1.0.0
		 */
		Gutenkit\Config\Modules::instance();

		/**
		 * Register Blocks.
		 *
		 * @return void
		 * @since 1.0.0
		 */
		Gutenkit\Config\Blocks::instance();

		/**
		 * Register Post Meta.
		 *
		 * @return void
		 * @since 1.0.0
		 */
		Gutenkit\Config\PostMeta::instance();

		/**
		 * Instantiate the AssetGenerator class and return its instance.
		 *
		 * @return void
		 * @since 1.0.0
		 */
		Gutenkit\Libs\AssetGenerator::instance();

		/**
		 * Initializes the SvgSupport class instance.
		 *
		 * @return void
		 * @since 1.0.0
		 */
		Gutenkit\Libs\UnfilteredFileSupport::instance();

		/**
		 * Initializes the Gutenkit admin functionality.
		 *
		 * This function creates an instance of the Gutenkit\Admin\Admin class and initializes the admin functionality for the Gutenkit plugin.
		 *
		 * @since 1.0.0
		 */
		Gutenkit\Admin\Admin::instance();

		/**
		 * Initializes the REST API routes.
		 *
		 * This creates an instance of the Gutenkit\Routes\Init class, which in turn
		 * initializes all of the GutenKit route classes (MediaUploadFromUrl,
		 * GlobalSettings, DeactivationFeedback, MailChimp).
		 *
		 * @return void
		 * @since 2.4.8
		 */
		Gutenkit\Routes\Init::instance();

		/**
		 * Instantiate the UtilityPackage class.
		 * This class provides wpmet/utility-package functions.
		 *
		 * @since 1.0.0
		 */
		if(is_admin()) {
			Gutenkit\Libs\UtilityPackages::instance();
		}

		/**
		 * Adds a global CSS class to the body tag in the editor.
		 *
		 * This code snippet demonstrates the usage of shorthand function syntax and the spread operator in PHP.
		 * The fn($classes) is shorthand for function ($classes), and the ...$classes is used to merge the existing classes with the new 'gutenkit' class.
		 *
		 * @param string $classes An array of CSS classes for the body tag.
		 * @return string The modified list of CSS classes.
		 * @since 1.0.0
		 */
		add_filter('admin_body_class', fn($classes) => $classes . ' gutenkit');

		/**
		 * Add global CSS class in body frontend
		 *
		 * This code snippet demonstrates the usage of shorthand function syntax and the spread operator in PHP.
		 * The fn($classes) is shorthand for function ($classes), and the ...$classes is used to merge the existing classes with the new 'gutenkit' class.
		 *
		 * @param array $classes An array of CSS classes for the body tag.
		 * @return array The modified array of CSS classes.
		 * @since 1.0.0
		 */
		add_filter('body_class', fn($classes) => [...$classes, 'gutenkit gutenkit-frontend']);

		// Hook into 'plugin_action_links' filter
		add_filter( 'plugin_action_links_' . plugin_basename(__FILE__), [ $this, 'plugin_action_links' ] );

		// Hook into the plugin_row_meta filter
		add_filter( 'plugin_row_meta', [ $this, 'plugin_row_meta' ], 10, 2 );

		/**
		 * Fires after the initialization of the GutenKit plugin.
		 *
		 * This action hook allows developers to perform additional tasks after the GutenKit plugin has been initialized.
		 * @since 1.0.0
		 */
		do_action( 'gutenkit/after_init' );
	}
}

/**
 * Kickoff the plugin
 *
 * @since 1.0.0
 *
 * 'GutenkitScopedDependencies\Wpmet\UtilityPackage\Helper\Helper'
 * 'GutenkitScopedDependencies\Wpmet\UtilityPackage\Notice\Notice'
 * 'GutenkitScopedDependencies\Wpmet\UtilityPackage\Banner\Banner'
 * 'GutenkitScopedDependencies\Wpmet\UtilityPackage\Stories\Stories'
 *
 *  Utility package added the path will be mentioned above
 *  for more info see: https://github.com/wpmetcom/utility-pacakge
 */
new Gutenkit();
