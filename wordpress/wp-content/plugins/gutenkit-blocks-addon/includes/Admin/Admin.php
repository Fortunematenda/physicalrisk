<?php

namespace Gutenkit\Admin;
use Gutenkit\Traits\PluginHelper;

defined( 'ABSPATH' ) || exit;

/**
 * The admin class
 */
class Admin {
	use \Gutenkit\Traits\Singleton;
	use PluginHelper;

	/**
	 * @access private
	 * @var string slug of the admin menu
	 * @since 1.0.0
	 */
	private $menu_slug = 'gutenkit';
	private $menu_link_part;
	private $is_popup_active = false;
	private $popup_link_part;

	/**
	 * Initialize the class
	 */
	public function __construct() {
		$this->menu_link_part = admin_url('admin.php?page=gutenkit');

		// Check if a specific Popup Builder Block is active or not
		if(in_array('popup-builder-block/popup-builder-block.php', apply_filters('active_plugins', get_option('active_plugins')))) {
			$this->is_popup_active = true;
		}

		// Register Default Blocks
		new \Gutenkit\Core\BuildBlocks();

		// Register Default Modules
		new \Gutenkit\Core\BuildModules();

		// Register Default Settings
		new \Gutenkit\Core\BuildSettings();

		// Register Modules API
		new Api\ModulesData();

		// Register Blocks API
		new Api\BlocksData();

		// Register Settings API
		new Api\SettingsData();

		// Register Active Plugin API
		new Api\ActivePluginData();

		// Register Favorite Templates API
		new Api\FavoriteTemplates();

		// Register Onboard API
		new Api\OnboardData();

		add_action('admin_menu', [$this, 'add_admin_menu']);
		add_action('admin_enqueue_scripts', [$this, 'enqueue_all_admin_scripts']);
		add_action('admin_init', [$this, 'redirect_to_popupkit_page']);
	}

	public function get_onboard_status() {
		return get_option('gutenkit_onboard_status') && get_option('gutenkit_onboard_status') == 'onboarded';
	}

	public function add_admin_menu() {
		add_menu_page(
			esc_html__( 'Gutenkit', 'gutenkit-blocks-addon' ),
			esc_html__( 'Gutenkit', 'gutenkit-blocks-addon' ),
			'manage_options',
			$this->menu_slug,
			[$this, 'admin_menu_callback'],
			GUTENKIT_PLUGIN_URL . 'assets/icons/admin-menu.svg',
			27
		);

		add_submenu_page(
			$this->menu_slug,
			esc_html__('Welcome', 'gutenkit-blocks-addon'),
			esc_html__('Welcome', 'gutenkit-blocks-addon'),
			'manage_options',
			$this->menu_link_part . '#welcome',
			'',
			1
		);

		add_submenu_page(
			$this->menu_slug,
			esc_html__('Blocks', 'gutenkit-blocks-addon'),
			esc_html__('Blocks', 'gutenkit-blocks-addon'),
			'manage_options',
			$this->menu_link_part . '#blocks',
			'',
			2
		);

		add_submenu_page(
			$this->menu_slug,
			esc_html__('Modules', 'gutenkit-blocks-addon'),
			esc_html__('Modules', 'gutenkit-blocks-addon'),
			'manage_options',
			$this->menu_link_part . '#modules',
			'',
			3
		);

		add_submenu_page(
			$this->menu_slug,
			esc_html__('Popups', 'gutenkit-blocks-addon-pro'),
			esc_html__('Popups', 'gutenkit-blocks-addon-pro'),
			'manage_options',
			'popup-builder-block',
			[$this, 'popup_callback'],
			4
		);

		add_submenu_page(
			$this->menu_slug,
			esc_html__('Settings', 'gutenkit-blocks-addon'),
			esc_html__('Settings', 'gutenkit-blocks-addon'),
			'manage_options',
			$this->menu_link_part . '#settings'
		);

		remove_submenu_page( $this->menu_slug, $this->menu_slug );

		$this->add_license_page_menu();
	}

	public function admin_menu_callback() {
		$data_admin = $this->get_onboard_status() ? 'dashboard' : 'onboard';
		?>
		<div class="wrap">
			<div class="gutenkit-admin-dashboard" data-admin="<?php echo esc_attr($data_admin); ?>"></div>
		</div>
		<?php
	}

	public function enqueue_all_admin_scripts( $hook ) {
		// Dashboard / onboard scripts — only on the GutenKit admin page
		$this->enqueue_admin_scripts( $hook );

		// Popup builder scripts — only on the popup builder page
		$this->enqueue_popup_scripts( $hook );

		// Deactivation feedback popup — only on plugins.php
		$this->enqueue_deactivation_popup_scripts( $hook );
	}

	public function enqueue_admin_scripts( $hook ) {
		if(in_array($hook, array('toplevel_page_gutenkit'))) {
			$data_admin = $this->get_onboard_status() ? 'dashboard' : 'onboard';

			if($data_admin == 'onboard') {
				$onboard_assets = include GUTENKIT_PLUGIN_DIR . 'build/admin/onboard/index.asset.php';
				wp_enqueue_script(
					'gutenkit-onboard',
					GUTENKIT_PLUGIN_URL . 'build/admin/onboard/index.js',
					$onboard_assets['dependencies'],
					$onboard_assets['version'],
					true
				);

				// localization      
                wp_localize_script(
                    'gutenkit-onboard',
                    'gutenkit_onboard_localize',
                    array(
                        'adminUrl' => esc_url(admin_url('/')),
                        'plugin_status' => \Gutenkit\Helpers\Utils::onboard_plugins(),
                    )
                );

				wp_enqueue_style(
					'gutenkit-onboard',
					GUTENKIT_PLUGIN_URL . 'build/admin/onboard/index.css',
					array('wp-components'),
					GUTENKIT_PLUGIN_VERSION
				);
			} else {
				$dashboard_assets = include GUTENKIT_PLUGIN_DIR . 'build/admin/dashboard/index.asset.php';
				if (!empty($dashboard_assets)) {
					wp_enqueue_script(
						'gutenkit-dashboard',
						GUTENKIT_PLUGIN_URL . 'build/admin/dashboard/index.js',
						$dashboard_assets['dependencies'],
						$dashboard_assets['version'],
						true
					);

					wp_enqueue_style(
						'gutenkit-dashboard',
						GUTENKIT_PLUGIN_URL . 'build/admin/dashboard/index.css',
						array('wp-components'),
						$dashboard_assets['version']
					);
				}

				wp_localize_script(
					'gutenkit-dashboard',
					'gutenkit_admin_localize',
					array(
						'version' => GUTENKIT_PLUGIN_VERSION,
						'api_url' => GUTENKIT_API_URL,
						'admin_url' => admin_url(),
						'is_block_theme' => wp_is_block_theme() ? true : false,
						'is_pro_active' => self::is_plugin_active('gutenkit-blocks-addon-pro/gutenkit-blocks-addon-pro.php'),
						'pro_version' => defined('GUTENKIT_PRO_PLUGIN_VERSION') ? GUTENKIT_PRO_PLUGIN_VERSION : '',
					)
				);

				// Set up script translations
				wp_set_script_translations( 'gutenkit-dashboard', 'gutenkit-blocks-addon' );
			}
		}
	}

	/**
	 * License page will be active when pro plugin is available
	 */
	private function add_license_page_menu(){
		if(self::is_plugin_active('gutenkit-blocks-addon-pro/gutenkit-blocks-addon-pro.php')){
			add_submenu_page(
				$this->menu_slug,
				esc_html__('License', 'gutenkit-blocks-addon'),
				esc_html__('License', 'gutenkit-blocks-addon'),
				'manage_options',
				$this->menu_link_part . '#license'
			);
		}
	}

	public function popup_callback() {
		?>
		<div class="gutenkit-admin-popup-builder"></div>
		<?php
	}

	public function enqueue_popup_scripts($hook) {
		if(in_array($hook, array('gutenkit_page_popup-builder-block')) && !$this->is_popup_active) {
			$popup_assets = include GUTENKIT_PLUGIN_DIR . 'build/admin/popup-builder/index.asset.php';
			wp_enqueue_script(
				'gutenkit-admin-popup-builder',
				GUTENKIT_PLUGIN_URL . 'build/admin/popup-builder/index.js',
				$popup_assets['dependencies'],
				$popup_assets['version'],
				true
			);

			wp_enqueue_style(
				'gutenkit-admin-popup-builder',
				GUTENKIT_PLUGIN_URL . 'build/admin/popup-builder/index.css',
				array('wp-components'),
				$popup_assets['version']
			);
		}
	}

	public function enqueue_deactivation_popup_scripts( $hook ) {
		if ( 'plugins.php' !== $hook ) {
			return;
		}

		$asset_file = GUTENKIT_PLUGIN_DIR . 'build/admin/deactivation-popup/index.asset.php';
		if ( ! file_exists( $asset_file ) ) {
			return;
		}

		$assets = include $asset_file;

		wp_enqueue_script(
			'gutenkit-deactivation-popup',
			GUTENKIT_PLUGIN_URL . 'build/admin/deactivation-popup/index.js',
			$assets['dependencies'],
			$assets['version'],
			true
		);

		wp_localize_script(
			'gutenkit-deactivation-popup',
			'gutenkitDeactivation',
			array(
				'pluginUrl' => GUTENKIT_PLUGIN_URL,
			)
		);

		wp_enqueue_style(
			'gutenkit-deactivation-popup',
			GUTENKIT_PLUGIN_URL . 'build/admin/deactivation-popup/style-index.css',
			array(),
			$assets['version']
		);
	}

	public function redirect_to_popupkit_page() {
		if (!is_admin() || !$this->is_popup_active) {
			return;
		}

		$screen_id = isset($_GET['page']) ? sanitize_text_field($_GET['page']) : '';

		if ($screen_id === 'popup-builder-block') {
			wp_safe_redirect(admin_url('admin.php?page=popupkit'));
			exit;
		}
	}
}
