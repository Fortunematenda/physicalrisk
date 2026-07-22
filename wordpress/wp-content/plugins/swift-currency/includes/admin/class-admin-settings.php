<?php

/**
 * Admin Settings Class
 *
 * Owns menu registration, asset enqueuing and page rendering.
 * AJAX handling lives in Admin_Ajax; sanitization pipelines in Settings.
 *
 * @package SwiftCurrency
 * @since   1.0.0
 */

namespace Codeies\SwiftCurrency\Admin;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Admin_Settings class.
 *
 * @since 1.0.0
 */
class Admin_Settings {

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * Currency Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Cache Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Cache_Manager
	 */
	private $cache;

	/**
	 * Tab instances.
	 *
	 * @var array
	 */
	private $tabs = array();

	/**
	 * Sub-page instances.
	 *
	 * @var Currencies_Page
	 */
	private $currencies_page;

	/**
	 * @var Rates_Page
	 */
	private $rates_page;

	/**
	 * Main settings page slug.
	 *
	 * @var string
	 */
	const PAGE_SLUG = 'swiftcurrency-settings';

	/**
	 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
	 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
	 * @param \Codeies\SwiftCurrency\Cache_Manager    $cache            Cache Manager instance.
	 */
	public function __construct( $settings, $currency_manager, $cache ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->cache            = $cache;

		// Initialize tab renderers.
		$this->tabs['general']     = new Tabs\General_Tab( $settings, $currency_manager );
		$this->tabs['rates']       = new Tabs\Rates_Tab( $settings, $currency_manager );
		$this->tabs['display']     = new Tabs\Display_Tab( $settings );
		$this->tabs['pricing']     = new Tabs\Pricing_Tab( $settings, $currency_manager );
		$this->tabs['geolocation'] = new Tabs\Geolocation_Tab( $settings, $currency_manager );
		$this->tabs['gateways']    = new Tabs\PaymentGateways_Tab( $settings, $currency_manager );
		$this->tabs['advanced']    = new Tabs\Advanced_Tab( $settings );

		// Sub-pages.
		$this->currencies_page = new Currencies_Page( $settings, $currency_manager, $cache );
		$this->rates_page      = new Rates_Page( $settings, $currency_manager, $cache, $this );

		$this->init_hooks();
	}

	/**
	 * Register hooks.
	 */
	private function init_hooks()
	{
		add_action('admin_menu',             array($this, 'add_menu_page'));
		add_action('admin_init',             array($this, 'register_settings'));
		add_action('admin_enqueue_scripts',  array($this, 'enqueue_admin_assets'));
		add_action('admin_head',             array($this, 'support_menu_whatsapp_link'));
	}

	// -------------------------------------------------------------------------
	// Menu
	// -------------------------------------------------------------------------

	/**
	 * Register menu and sub-menu pages.
	 */
	public function add_menu_page()
	{
		$cap = current_user_can('manage_woocommerce') ? 'manage_woocommerce' : 'manage_options';

		add_menu_page(
			__('SwiftCurrency Settings', 'swift-currency'),
			__('SwiftCurrency', 'swift-currency'),
			$cap,
			self::PAGE_SLUG,
			array($this, 'render_settings_page'),
			'dashicons-money-alt',
			56
		);

		add_submenu_page(
			self::PAGE_SLUG,
			__('Settings', 'swift-currency'),
			__('Settings', 'swift-currency'),
			$cap,
			self::PAGE_SLUG,
			array($this, 'render_settings_page')
		);

		add_submenu_page(
			self::PAGE_SLUG,
			__('Currencies', 'swift-currency'),
			__('Currencies', 'swift-currency'),
			$cap,
			'swiftcurrency-currencies',
			array($this, 'render_currencies_page')
		);

		add_submenu_page(
			self::PAGE_SLUG,
			__('Exchange Rates', 'swift-currency'),
			__('Exchange Rates', 'swift-currency'),
			$cap,
			'swiftcurrency-rates',
			array($this, 'render_rates_page')
		);

		add_submenu_page(
			self::PAGE_SLUG,
			__('Support', 'swift-currency'),
			__('Support', 'swift-currency'),
			$cap,
			'swiftcurrency-support',
			array($this, 'render_support_page')
		);

		/**
		 * Allow the Pro add-on to register additional sub-menu pages.
		 *
		 * @since 1.0.0
		 * @param string $parent_slug The parent menu slug.
		 * @param string $cap         Required capability.
		 */
		do_action('swiftcurrency_admin_menu', self::PAGE_SLUG, $cap);
	}

	// -------------------------------------------------------------------------
	// Settings registration
	// -------------------------------------------------------------------------

	/**
	 * Register the settings group.
	 *
	 * The sanitize_callback points to the global function
	 * swiftcurrency_sanitize_settings() defined in includes/helpers.php.
	 * It sanitizes every field using sanitize_text_field(), sanitize_key(),
	 * sanitize_hex_color(), sanitize_textarea_field(), absint(), and
	 * allowlist validation.
	 */
	public function register_settings()
	{
		register_setting(
			'swiftcurrency_settings',
			'swiftcurrency_settings',
			array(
				'type'              => 'array',
				'description'       => __( 'SwiftCurrency plugin settings.', 'swift-currency' ),
				'sanitize_callback' => 'swiftcurrency_sanitize_settings',
				'show_in_rest'      => false,
				'default'           => array(),
			)
		);
	}

	// -------------------------------------------------------------------------
	// Assets
	// -------------------------------------------------------------------------

	/**
	 * Enqueue admin CSS and JS on SwiftCurrency pages.
	 *
	 * @param string $hook Current admin page hook suffix.
	 */
	public function enqueue_admin_assets($hook)
	{
		$page = isset($_GET['page']) ? sanitize_text_field(wp_unslash($_GET['page'])) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if (false === strpos($hook, 'swiftcurrency') && false === strpos($page, 'swiftcurrency')) {
			return;
		}

		wp_enqueue_media();

		// Register Styles.
		wp_register_style(
			'swiftcurrency-admin',
			SWIFTCURRENCY_ASSETS_URL . 'css/admin.css',
			array(),
			SWIFTCURRENCY_VERSION
		);

		wp_register_style(
			'swiftcurrency-frontend-flags',
			SWIFTCURRENCY_ASSETS_URL . 'css/frontend.css',
			array(),
			SWIFTCURRENCY_VERSION
		);

		// Register Scripts.
		wp_register_script(
			'swiftcurrency-admin',
			SWIFTCURRENCY_ASSETS_URL . 'js/admin.js',
			array('jquery'),
			SWIFTCURRENCY_VERSION,
			true
		);

		// Enqueue.
		wp_enqueue_style('swiftcurrency-admin');
		wp_enqueue_style('swiftcurrency-frontend-flags');
		wp_enqueue_script('swiftcurrency-admin');

		// Tab specific assets.
		$active_tab = isset($_GET['tab']) ? sanitize_text_field(wp_unslash($_GET['tab'])) : 'general'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if (isset($this->tabs[$active_tab]) && method_exists($this->tabs[$active_tab], 'enqueue_assets')) {
			$this->tabs[$active_tab]->enqueue_assets();
		}

		wp_localize_script(
			'swiftcurrency-admin',
			'swiftcurrencyAdmin',
			array(
				'ajaxUrl' => admin_url('admin-ajax.php'),
				'nonce'   => wp_create_nonce('swiftcurrency_admin'),
				'isPro'   => \Codeies\SwiftCurrency\Utils::is_pro(),
				'strings' => array(
					'saving'        => __('Saving...', 'swift-currency'),
					'saved'         => __('Settings saved!', 'swift-currency'),
					'error'         => __('Error saving settings.', 'swift-currency'),
					'confirmDelete' => __('Are you sure you want to delete this currency?', 'swift-currency'),
					'testingApi'    => __('Testing...', 'swift-currency'),
					'apiFailed'     => __('API connection failed.', 'swift-currency'),
				),
			)
		);
	}

	// -------------------------------------------------------------------------
	// Page renderers
	// -------------------------------------------------------------------------

	/**
	 * Render the tabbed settings page.
	 */
	public function render_settings_page()
	{
		$active_tab = isset($_GET['tab']) ? sanitize_text_field(wp_unslash($_GET['tab'])) : 'general'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		$tabs = array(
			'general'     => array('icon' => 'dashicons-admin-settings', 'label' => __('General', 'swift-currency')),
			'rates'       => array('icon' => 'dashicons-chart-line',      'label' => __('Rate Providers', 'swift-currency')),
			'display'     => array('icon' => 'dashicons-visibility',       'label' => __('Display', 'swift-currency')),
			'pricing'     => array('icon' => 'dashicons-tag',              'label' => __('Pricing', 'swift-currency')),
			'geolocation' => array('icon' => 'dashicons-location',         'label' => __('Geolocation', 'swift-currency'), 'pro' => true),
			'gateways'    => array('icon' => 'dashicons-cart',             'label' => __('Gateways', 'swift-currency'), 'pro' => true),
			'advanced'    => array('icon' => 'dashicons-admin-tools',      'label' => __('Advanced', 'swift-currency')),
		);

		/**
		 * Allow the Pro add-on to register additional tabs.
		 *
		 * @since 1.0.0
		 * @param array $tabs Registered tabs: slug => [ icon, label, ?pro ].
		 */
		$tabs   = apply_filters('swiftcurrency_admin_tabs', $tabs);
		$is_pro = \Codeies\SwiftCurrency\Utils::is_pro();
?>
		<div class="wrap sc-wrap">
			<?php settings_errors('swiftcurrency_settings'); ?>
			<div class="sc-header">
				<div class="sc-header-icon"><span class="dashicons dashicons-money-alt"></span></div>
				<div>
					<div class="sc-header-title"><?php esc_html_e('SwiftCurrency', 'swift-currency'); ?></div>
					<div class="sc-header-subtitle"><?php esc_html_e('Multi-Currency for WooCommerce', 'swift-currency'); ?></div>
				</div>
			</div>
			<nav class="sc-tab-nav">
				<?php foreach ($tabs as $slug => $tab) : ?>
					<a href="?page=<?php echo esc_attr(self::PAGE_SLUG); ?>&tab=<?php echo esc_attr($slug); ?>"
						class="sc-tab-link <?php echo esc_attr( $active_tab === $slug ? 'sc-tab-active' : '' ); ?>">
						<span class="dashicons <?php echo esc_attr($tab['icon']); ?>"></span>
						<?php echo esc_html($tab['label']); ?>
						<?php if (! $is_pro && ! empty($tab['pro'])) : ?>
							<span class="sc-tab-pro-badge"><?php esc_html_e('Pro', 'swift-currency'); ?></span>
						<?php endif; ?>
					</a>
				<?php endforeach; ?>
			</nav>
			<div class="sc-settings-body">
				<?php
				/**
				 * Let the Pro add-on render its own tabs before core tab renderers run.
				 *
				 * @since 1.0.0
				 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
				 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
				 */
				do_action('swiftcurrency_render_admin_tab_' . $active_tab, $this->settings, $this->currency_manager);

				if (isset($this->tabs[$active_tab])) {
					$this->tabs[$active_tab]->render();
				}
				?>
			</div>
		</div>
<?php
	}

	/**
	 * Render the currencies sub-page.
	 */
	public function render_currencies_page()
	{
		$this->currencies_page->render();
	}

	/**
	 * Render the exchange rates sub-page.
	 */
	public function render_rates_page()
	{
		$this->rates_page->render();
	}

	/**
	 * Render the support page — immediately forwards to WhatsApp with pre-filled message.
	 */
	public function render_support_page()
	{
		$url = $this->get_support_whatsapp_url();
		?>
		<script>window.location.href = <?php echo wp_json_encode( $url ); ?>;</script>
		<p><?php esc_html_e( 'Redirecting to WhatsApp support…', 'swift-currency' ); ?> <a href="<?php echo esc_url( $url ); ?>"><?php esc_html_e( 'Click here if not redirected.', 'swift-currency' ); ?></a></p>
		<?php
	}

	/**
	 * Build the WhatsApp URL with a pre-filled support message.
	 *
	 * @return string WhatsApp URL.
	 */
	private function get_support_whatsapp_url()
	{
		$message = sprintf(
			"Hi SwiftCurrency Support,\n\nSite: %s\nPlugin: SwiftCurrency v%s\nWooCommerce: %s\nWordPress: %s\n\n[Please describe your issue here]",
			get_site_url(),
			SWIFTCURRENCY_VERSION,
			defined( 'WC_VERSION' ) ? WC_VERSION : 'N/A',
			get_bloginfo( 'version' )
		);
		return 'https://wa.me/923138231367?text=' . rawurlencode( $message );
	}

	/**
	 * Output a small inline script on every admin page that rewrites the
	 * "Support" sidebar link to open WhatsApp directly in a new tab.
	 */
	public function support_menu_whatsapp_link()
	{
		$url = $this->get_support_whatsapp_url();
		?>
		<script>
		(function(){
			var slug = 'admin.php?page=swiftcurrency-support';
			document.querySelectorAll('#adminmenu a[href$="' + slug + '"]').forEach(function(a){
				a.href   = <?php echo wp_json_encode( $url ); ?>;
				a.target = '_blank';
				a.rel    = 'noopener noreferrer';
			});
		})();
		</script>
		<?php
	}

	/**
	 * Get a rate provider instance by slug.
	 *
	 * @since 1.0.0
	 * @param string $slug Provider slug.
	 * @return object|null
	 */
	public function get_rate_provider($slug)
	{
		$factory = new \Codeies\SwiftCurrency\Providers\Rate_Provider_Factory($this->settings);
		return $factory->make($slug);
	}
}
