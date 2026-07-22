<?php

/**
 * Plugin Name: Swift Currency - Multi-Currency Switcher for WooCommerce
 * Plugin URI: https://store.codeies.com/l/swift-currency
 * Description: Professional multi-currency plugin for WooCommerce with real-time exchange rates, automatic geolocation, and extensive customization options.
 * Version: 1.0.4
 * Author: Codeies
 * Author URI: https://codeies.com
 * Developer: Codeies
 * Developer URI: https://codeies.com
 * Text Domain: swift-currency
 * Domain Path: /languages
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 * WC tested up to: 9.0
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Plugin Constants
 */
define( 'SWIFTCURRENCY_VERSION', '1.0.4' );
define( 'SWIFTCURRENCY_PLUGIN_FILE', __FILE__ );
define( 'SWIFTCURRENCY_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'SWIFTCURRENCY_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'SWIFTCURRENCY_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );
define( 'SWIFTCURRENCY_INCLUDES_DIR', SWIFTCURRENCY_PLUGIN_DIR . 'includes/' );
define( 'SWIFTCURRENCY_ASSETS_URL', SWIFTCURRENCY_PLUGIN_URL . 'assets/' );

/**
 * Autoloader
 */
require_once SWIFTCURRENCY_INCLUDES_DIR . 'class-autoloader.php';

/**
 * Helper Functions
 */
require_once SWIFTCURRENCY_INCLUDES_DIR . 'helpers.php';

/**
 * Main SwiftCurrency Class
 *
 * @class   SwiftCurrency
 * @version 1.0.0
 */
final class SwiftCurrency {

	/**
	 * The single instance of the class.
	 *
	 * @var SwiftCurrency
	 */
	protected static $instance = null;

	/**
	 * Settings instance.
	 *
	 * @var Settings
	 */
	private $settings = null;

	/**
	 * Cache Manager instance.
	 *
	 * @var Cache_Manager
	 */
	private $cache = null;

	/**
	 * Currency Manager instance.
	 *
	 * @var Currency_Manager
	 */
	private $currency_manager = null;

	/**
	 * Price Converter instance.
	 *
	 * @var Price_Converter
	 */
	private $price_converter = null;

	/**
	 * Rate Provider Factory instance.
	 *
	 * Centralises provider slug → instance resolution so Cron_Handler,
	 * Admin_Ajax, and Rate_Fetcher all share the same factory.
	 *
	 * @var Rate_Provider_Factory
	 */
	private $rate_provider_factory = null;

	/**
	 * Rate Fetcher service instance.
	 *
	 * Wraps provider instantiation + crypto-base bridging.  Injected into
	 * Cron_Handler and Admin_Ajax so neither class owns provider logic.
	 *
	 * @var Rate_Fetcher
	 */
	private $rate_fetcher = null;

	// -------------------------------------------------------------------------
	// Bootstrap
	// -------------------------------------------------------------------------

	/**
	 * Main SwiftCurrency Instance.
	 *
	 * Ensures only one instance is loaded or can be loaded (singleton).
	 *
	 * @since  1.0.0
	 * @static
	 * @return SwiftCurrency
	 */
	public static function instance() {
		if ( is_null( self::$instance ) ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor – registers hooks only; no heavy work here.
	 *
	 * @since 1.0.0
	 */
	private function __construct() {
		$this->init_hooks();
	}

	/**
	 * Register early WordPress hooks.
	 *
	 * @since 1.0.0
	 */
	private function init_hooks() {
		// Initialize plugin after WordPress i18n is ready.
		add_action( 'init', array( $this, 'init' ), 2 );

		// Activation / deactivation hooks.
		register_activation_hook( SWIFTCURRENCY_PLUGIN_FILE, array( 'Codeies\\SwiftCurrency\\Installer', 'activate' ) );
		register_deactivation_hook( SWIFTCURRENCY_PLUGIN_FILE, array( 'Codeies\\SwiftCurrency\\Installer', 'deactivate' ) );

		// Plugins page action link.
		add_filter(
			'plugin_action_links_' . SWIFTCURRENCY_PLUGIN_BASENAME,
			array( $this, 'add_settings_link' )
		);
	}

	/**
	 * Add "Settings" link on the WP Plugins screen.
	 *
	 * @since 1.0.0
	 * @param string[] $links Existing plugin action links.
	 * @return string[]
	 */
	public function add_settings_link( $links ) {
		$settings_link = '<a href="' . esc_url( admin_url( 'admin.php?page=swiftcurrency-settings' ) ) . '">' . esc_html__( 'Settings', 'swift-currency' ) . '</a>';
		array_unshift( $links, $settings_link );
		return $links;
	}

	// -------------------------------------------------------------------------
	// Initialization pipeline
	// -------------------------------------------------------------------------

	/**
	 * Initialize the plugin.
	 *
	 * Called on the `init` action (priority 2) so WordPress i18n is ready.
	 *
	 * @since 1.0.0
	 */
	public function init() {
		// Core classes must be up before anything else.
		$this->init_classes();

		// WooCommerce integrations only when WooCommerce is present.
		if ( $this->is_woocommerce_active() ) {
			$this->init_integrations();
			$this->init_third_party_integrations();
		}

		// Admin-only classes.
		if ( is_admin() ) {
			$this->init_admin();
		}

		// Frontend classes (also runs during admin AJAX).
		if ( ! is_admin() || wp_doing_ajax() ) {
			$this->init_frontend();
		}

		// REST API + action hooks.
		$this->init_api();

		/**
		 * Fires after SwiftCurrency is fully initialized.
		 *
		 * Pro addons and third-party integrations should hook here.
		 *
		 * @since 1.0.0
		 */
		do_action( 'swiftcurrency_loaded' );
	}

	/**
	 * Instantiate core service classes.
	 *
	 * Order matters: Settings → Cache → Currency_Manager → Price_Converter →
	 * Rate_Provider_Factory → Rate_Fetcher.
	 *
	 * @since 1.0.0
	 */
	private function init_classes() {
		if ( is_null( $this->settings ) ) {
			$this->settings = new Settings();
		}

		if ( is_null( $this->cache ) ) {
			$this->cache = new Cache_Manager();
		}

		$this->currency_manager      = new Currency_Manager( $this->settings );
		$this->price_converter       = new Price_Converter( $this->settings, $this->cache );
		$this->rate_provider_factory = new Providers\Rate_Provider_Factory( $this->settings );
		$this->rate_fetcher          = new Rate_Fetcher( $this->currency_manager, $this->rate_provider_factory );
	}

	/**
	 * Initialize WooCommerce integrations and scheduled tasks.
	 *
	 * @since 1.0.0
	 */
	private function init_integrations() {
		new User_Preferences( $this->settings, $this->currency_manager );
		new Integrations\WooCommerce_Integration( $this->settings, $this->currency_manager, $this->price_converter );
		new Checkout_Handler( $this->currency_manager, $this->price_converter, $this->settings );

		// Rate_Fetcher injected so Cron_Handler has no provider logic of its own.
		new Cron_Handler( $this->settings, $this->cache, $this->currency_manager, $this->rate_fetcher );
	}

	/**
	 * Initialize third-party integrations.
	 *
	 * Geolocation, WPML, and similar integrations are Pro features wired in
	 * the Pro addon via the `swiftcurrency_loaded` action.
	 *
	 * @since 1.0.0
	 */
	private function init_third_party_integrations() {
		// Pro addon handles this.
	}

	/**
	 * Initialize admin-only classes.
	 *
	 * @since 1.0.0
	 */
	private function init_admin() {
		new Admin\Admin_Settings( $this->settings, $this->currency_manager, $this->cache );

		// Admin AJAX handlers extracted from Admin_Settings — injected with the
		// Rate_Provider_Factory and Rate_Fetcher so they share the same factory.
		new Admin\Admin_Ajax( $this->settings, $this->cache, $this->rate_provider_factory );

		new Admin\Dashboard_Widget( $this->settings );
	}

	/**
	 * Initialize frontend classes.
	 *
	 * Also runs during admin-context AJAX calls.
	 *
	 * @since 1.0.0
	 */
	private function init_frontend() {
		new Frontend\Currency_Switcher( $this->currency_manager, $this->settings );
		new Frontend\Price_Display( $this->currency_manager );
		new AJAX_Handler( $this->settings, $this->currency_manager, $this->price_converter );
	}

	/**
	 * Initialize REST API and action hooks.
	 *
	 * @since 1.0.0
	 */
	private function init_api() {
		new API\REST_API( $this->settings, $this->currency_manager, $this->cache );
		new API\Hooks( $this->settings, $this->currency_manager );
	}

	// -------------------------------------------------------------------------
	// Getters – Pro addons extend the plugin through these, not via public props
	// -------------------------------------------------------------------------

	/**
	 * @since 1.0.0
	 * @return string
	 */
	public function get_version() {
		return SWIFTCURRENCY_VERSION;
	}

	/**
	 * @since 1.0.0
	 * @return Settings
	 */
	public function get_settings() {
		return $this->settings;
	}

	/**
	 * @since 1.0.0
	 * @return Cache_Manager
	 */
	public function get_cache() {
		return $this->cache;
	}

	/**
	 * @since 1.0.0
	 * @return Currency_Manager
	 */
	public function get_currency_manager() {
		return $this->currency_manager;
	}

	/**
	 * @since 1.0.0
	 * @return Price_Converter
	 */
	public function get_price_converter() {
		return $this->price_converter;
	}

	/**
	 * @since 1.0.0
	 * @return Rate_Provider_Factory
	 */
	public function get_rate_provider_factory() {
		return $this->rate_provider_factory;
	}

	/**
	 * @since 1.0.0
	 * @return Rate_Fetcher
	 */
	public function get_rate_fetcher() {
		return $this->rate_fetcher;
	}

	// -------------------------------------------------------------------------
	// Utility
	// -------------------------------------------------------------------------

	/**
	 * Check whether WooCommerce is active.
	 *
	 * @since 1.0.0
	 * @return bool
	 */
	private function is_woocommerce_active() {
		return class_exists( 'WooCommerce' );
	}

	/**
	 * Admin notice – WooCommerce not installed/active.
	 *
	 * @since 1.0.0
	 */
	public function woocommerce_missing_notice() {
		?>
		<div class="notice notice-warning is-dismissible">
			<p>
				<?php
				echo wp_kses_post(
					sprintf(
						/* translators: %s: WooCommerce plugin link */
						__( '<strong>SwiftCurrency</strong> works best with WooCommerce. Install %s to enable product pricing conversion, checkout integration, and order currency management.', 'swift-currency' ),
						'<a href="' . esc_url( admin_url( 'plugin-install.php?s=woocommerce&tab=search&type=term' ) ) . '">WooCommerce</a>'
					)
				);
				?>
			</p>
		</div>
		<?php
	}

	// -------------------------------------------------------------------------
	// Singleton guards
	// -------------------------------------------------------------------------

	/**
	 * Prevent cloning.
	 *
	 * @since 1.0.0
	 */
	private function __clone() {
		_doing_it_wrong( __FUNCTION__, esc_html__( 'Cloning is forbidden.', 'swift-currency' ), '1.0.0' );
	}

	/**
	 * Prevent unserializing.
	 *
	 * @since 1.0.0
	 */
	public function __wakeup() {
		_doing_it_wrong( __FUNCTION__, esc_html__( 'Unserializing instances of this class is forbidden.', 'swift-currency' ), '1.0.0' );
	}
}

/**
 * Returns the main instance of SwiftCurrency.
 *
 * @since  1.0.0
 * @return SwiftCurrency
 */
function swiftcurrency() {
	return SwiftCurrency::instance();
}

// Initialize the plugin.
swiftcurrency();
