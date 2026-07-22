<?php
namespace ElementsKit_Lite;

defined( 'ABSPATH' ) || exit;


/**
 * ElementsKit - the God class.
 * Initiate all necessary classes, hooks, configs.
 *
 * @since 1.0.0
 */
class Plugin {


	/**
	 * The plugin instance.
	 *
	 * @since 1.0.0
	 * @access public
	 * @static
	 *
	 * @var Plugin
	 */
	public static $instance = null;

	/**
	 * Construct the plugin object.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function __construct() {

		// check on-boarding status
		Libs\Framework\Classes\Onboard_Status::instance()->onboard();

		// Initialize deactivation feedback
		Core\Plugin_Unsubscribe::instance();

		// migrate old settings db to new format.
		new Compatibility\Data_Migration\Settings_Db();

		// compatibility for element manager.
		new Compatibility\Element_Manager\Init();

		// Enqueue admin scripts.
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin' ) );

		// Enqueue inline scripts
		Core\Build_Inline_Scripts::instance();

		// Register plugin settings pages
		Libs\Framework\Attr::instance();

		// Register default widgets
		Core\Build_Widgets::instance();

		// Register default modules
		Core\Build_Modules::instance();

		// register plugin activation actions
		( new Core\Activation_Actions() )->init();

		add_action( 'send_headers', array( $this, 'add_meta_for_search_excluded' ) );

		// Register ElementsKit supported widgets to Elementor from 3rd party plugins.
		add_action( 'elementor/widgets/register', array( $this, 'register_widgets' ), 1050 );

		// Register wpml compatibility
		Compatibility\Wpml\Init::instance();

		// Compatibility issues
		Compatibility\Conflicts\Init::instance();

		// Show forms sub menu page
		\Wpmet\Libs\Forms::instance();

		$is_pro_active = \ElementsKit_Lite\Utils::ekit_is_plugin_active( 'elementskit/elementskit.php');

		// Initialize editor promotion for pro widgets
		if( ! $is_pro_active ) {
			add_action( 'elementor/editor/init', function() {
				if ( class_exists( '\ElementsKit_Lite\Core\Editor_Promotion' ) ) {
					\ElementsKit_Lite\Core\Editor_Promotion::instance()->init();
				}
			} );
		}

		if ( is_admin() && Libs\Framework\Classes\Utils::instance()->get_settings( 'ekit_user_consent_for_banner', 'yes' ) == 'yes' ) {
			$filter_string = \ElementsKit_Lite::active_plugins();
			/**
			 * Show WPMET stories widget in dashboard
			 */
			\Wpmet\Libs\Stories::instance( 'elementskit-lite' )
			// ->is_test(true)
			->set_filter( $filter_string )
			->set_plugin( 'ElementsKit', 'https://wpmet.com/plugin/elementskit/' )
			->set_api_url( 'https://api.wpmet.com/public/stories/' )
			->call();

			/**
			 * Show WPMET banner (codename: jhanda)
			 */
			\Wpmet\Libs\Banner::instance( 'elementskit-lite' )
			// ->is_test(true)
			->set_filter( ltrim( $filter_string, ',' ) )
			->set_api_url( 'https://api.wpmet.com/public/jhanda' )
			->set_plugin_screens( 'edit-elementskit_template' )
			->set_plugin_screens( 'toplevel_page_elementskit' )
			->call();

			/**
			 *  Ask for rating
			 *  A rating notice will appear depends on
			 *  @set_first_appear_day methods
			 */
			\Wpmet\Libs\Rating::instance( 'elementskit-lite' )
			->set_plugin( 'ElementsKit', 'https://wpmet.com/wordpress.org/rating/elementskit' )
			->set_plugin_logo( 'https://ps.w.org/elementskit-lite/assets/icon-128x128.gif', 'width:150px !important' )
			->set_allowed_screens( 'edit-elementskit_template' )
			->set_allowed_screens( 'toplevel_page_elementskit' )
			->set_allowed_screens( 'elementskit_page_elementskit-lite_get_help' )
			->set_priority( 10 )
			->set_first_appear_day( 7 )
			->set_condition( true )
			->call();

		}

		/**
		 * Show go Premium menu
		 */
		$pro_awareness = \Wpmet\Libs\Pro_Awareness::instance('elementskit-lite');

		if(version_compare($pro_awareness->get_version(), '1.2.0') >= 0) {
			$pro_awareness
			->set_parent_menu_slug( 'elementskit' )
			->set_plugin_file( 'elementskit-lite/elementskit-lite.php' )
			->set_pro_link(
				( ( \ElementsKit_Lite::package_type() != 'free' ) ? '' : 'https://wpmet.com/elementskit-pricing' )
			)
			->set_default_grid_thumbnail( \ElementsKit_Lite::lib_url() . 'pro-awareness/assets/support.png' )
			->set_page_grid(
				array(
					'url'       => 'https://wpmet.com/fb-group',
					'title'     => esc_html__( 'Join the Community', 'elementskit-lite' ),
					'thumbnail' => \ElementsKit_Lite::lib_url() . 'pro-awareness/assets/community.png',
					'description' => esc_html__( 'Join our Facebook group to get 20% discount coupon on premium products. Follow us to get more exciting offers.', 'elementskit-lite' )
				)
			)
			->set_page_grid(
				array(
					'url'       => 'https://www.youtube.com/playlist?list=PL3t2OjZ6gY8MVnyA4OLB6qXb77-roJOuY',
					'title'     => esc_html__( 'Video Tutorials', 'elementskit-lite' ),
					'thumbnail' => \ElementsKit_Lite::lib_url() . 'pro-awareness/assets/videos.png',
					'description' => esc_html__( 'Learn the step by step process for developing your site easily from video tutorials.', 'elementskit-lite' )
				)
			)
			->set_page_grid(
				array(
					'url'       => 'https://wpmet.com/plugin/elementskit/roadmaps#ideas',
					'title'     => esc_html__( 'Request a feature', 'elementskit-lite' ),
					'thumbnail' => \ElementsKit_Lite::lib_url() . 'pro-awareness/assets/request.png',
					'description' => esc_html__( 'Have any special feature in mind? Let us know through the feature request.', 'elementskit-lite' )
				)
			)
			->set_page_grid(
				array(
					'url'       => 'https://wpmet.com/doc/elementskit/',
					'title'     => esc_html__( 'Documentation', 'elementskit-lite' ),
					'thumbnail' => \ElementsKit_Lite::lib_url() . 'pro-awareness/assets/documentation.png',
					'description' => esc_html__( 'Detailed documentation to help you understand the functionality of each feature.', 'elementskit-lite' )
				)
			)
			->set_page_grid(
				array(
					'url'       => 'https://wpmet.com/plugin/elementskit/roadmaps/',
					'title'     => esc_html__( 'Public Roadmap', 'elementskit-lite' ),
					'thumbnail' => \ElementsKit_Lite::lib_url() . 'pro-awareness/assets/roadmaps.png',
					'description' => esc_html__( 'Check our upcoming new features, detailed development stories and tasks', 'elementskit-lite' )
				)
			)
			->set_plugin_row_meta( esc_html__( 'Documentation', 'elementskit-lite' ), 'https://wpmet.com/elementskit-docs', array( 'target' => '_blank' ) )
			->set_plugin_row_meta( esc_html__( 'Facebook Community', 'elementskit-lite' ), 'https://wpmet.com/fb-group', array( 'target' => '_blank' ) )
			->set_plugin_row_meta( esc_html__( 'Rate the plugin ★★★★★', 'elementskit-lite' ), 'https://wordpress.org/support/plugin/elementskit-lite/reviews/#new-post', array( 'target' => '_blank' ) )
			->set_plugin_action_link( esc_html__( 'Settings', 'elementskit-lite' ), admin_url() . 'admin.php?page=elementskit' )
			->set_plugin_action_link(
				( $is_pro_active ? '' : esc_html__( 'Go Premium', 'elementskit-lite' ) ),
				'https://wpmet.com/elementskit-pricing',
				array(
					'target' => '_blank',
					'style'  => 'color: #FCB214; font-weight: bold;',
				)
			)
			->call();
		}

		// Adding pro lebel
		if ( \ElementsKit_Lite::package_type() == 'free' ) {
			new Libs\Pro_Label\Init();
		}

		/**
		 * Show our plugins menu for others wpmet plugins
		 */
		\Wpmet\Libs\Our_Plugins::instance()->init('elementskit-lite') # @text_domain
		->set_parent_menu_slug('elementskit') # @plugin_slug
		->set_submenu_name(
			esc_html__('Our Plugins', 'elementskit-lite')
		) # @submenu_name (optional- default: Our Plugins)
		->set_section_title(
			esc_html__('Take Your WordPress Website To Next Level!', 'elementskit-lite')
		) # @section_title (optional)
		->set_section_description(
			esc_html__('Our diverse range of plugins has every solution for WordPress, Gutenberg, Elementor, and WooCommerce.', 'elementskit-lite')
		) # @section_description (optional)
		->set_items_per_row(4) # @items_per_row (optional- default: 6)
		->set_plugins(
			[
				'gutenkit-blocks-addon/gutenkit-blocks-addon.php' => [
					'name' => esc_html__('GutenKit', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/gutenkit-blocks-addon/',
					'icon' => 'https://ps.w.org/gutenkit-blocks-addon/assets/icon-256x256.gif?rev=3044956',
					'desc' => esc_html__('Gutenberg blocks, patterns, and templates that extend the page-building experience using the WordPress block editor.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/docs/gutenkit/',
				],
				'rox-dynamic-cpt-fields-engine/rox-dynamic-cpt-fields-engine.php' => [
					'name' => esc_html__('Dynamic CPT Fields Engine', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/rox-dynamic-cpt-fields-engine/',
					'icon' => 'https://ps.w.org/rox-dynamic-cpt-fields-engine/assets/icon-128x128.jpeg?rev=3538537',
					'desc' => esc_html__('Build custom post types, fields, taxonomies, and dynamic frontend layouts for WordPress, with zero coding and full AI-generated schema.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/doc/rox-dynamic-cpt-fields-engine/',
				],
				'rox-appointment-booking/rox-appointment-booking.php' => [
					'name' => esc_html__('Rox Appointment Booking', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/rox-appointment-booking/',
					'icon' => 'https://ps.w.org/rox-appointment-booking/assets/icon-128x128.png?rev=3575641',
					'desc' => esc_html__(' Manage bookings, agents, payments, and calendars from one dashboard! A complete appointment and scheduling solution for WordPress.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/doc/rox-appointment-booking/',
				],
				'metform/metform.php' => [
					'name' => esc_html__('MetForm', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/genie-image-ai/',
					'icon' => 'https://ps.w.org/metform/assets/icon-256x256.png?rev=2544152',
					'desc' => esc_html__('Drag & drop form builder for Elementor to create contact forms, multi-step forms, and more — smoother, faster, and better!', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/doc/metform/',
				],
				'shopengine/shopengine.php' => [
					'name' => esc_html__('ShopEngine', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/shopengine/',
					'icon' => 'https://ps.w.org/shopengine/assets/icon-256x256.gif?rev=2505061',
					'desc' => esc_html__('Complete WooCommerce solution for Elementor to fully customize any pages including cart, checkout, shop page, and so on.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/doc/shopengine/',
				],
				'popup-builder-block/popup-builder-block.php' => [
					'name' => esc_html__('PopupKit', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/popup-builder-block/',
					'icon' => 'https://ps.w.org/popup-builder-block/assets/icon-256x256.png?rev=3316844',
					'desc' => esc_html__('Design popups that convert, right in your WordPress dashboard.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/docs/popupkit/',
				],
				'table-builder-block/table-builder-block.php' => [
					'name' => esc_html__('TableKit', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/table-builder-block/',
					'icon' => 'https://ps.w.org/table-builder-block/assets/icon-256x256.jpg?rev=3168211',
					'desc' => esc_html__('Fully Customizable. Multi-Media Integration. Synch Any Data Files. All Within Block Editor.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/docs/tablekit/',
				],
				'getgenie/getgenie.php' => [
					'name' => esc_html__('GetGenie AI', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/getgenie/',
					'icon' => 'https://ps.w.org/getgenie/assets/icon-256x256.gif?rev=2798355',
					'desc' => esc_html__('Your personal AI assistant for content and SEO. Write content that ranks on Google with NLP keywords and SERP analysis data.', 'elementskit-lite'),
					'docs' => 'https://getgenie.ai/docs/',
				],
				'emailkit/EmailKit.php' => [
					'name' => esc_html__('EmailKit', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/genie-image-ai/',
					'icon' => 'https://ps.w.org/emailkit/assets/icon-256x256.png?rev=3003571',
					'desc' => esc_html__('Advanced email customizer for WooCommerce and WordPress. Build, customize, and send emails from WordPress to boost your sales!', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/doc/emailkit/',
				],
				'wp-social/wp-social.php' => [
					'name' => esc_html__('WP Social', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/wp-social/',
					'icon' => 'https://ps.w.org/wp-social/assets/icon-256x256.png?rev=2544214',
					'desc' => esc_html__('Add social share, login, and engagement counter — unified solution for all social media with tons of different styles for your website.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/doc/wp-social/',
				],
				'blocks-for-shopengine/shopengine-gutenberg-addon.php' => [
					'name' => esc_html__('Blocks for ShopEngine', 'elementskit-lite'),
					'url'  => 'https://wordpress.org/plugins/blocks-for-shopengine/',
					'icon' => 'https://ps.w.org/blocks-for-shopengine/assets/icon-256x256.gif?rev=2702483',
					'desc' => esc_html__('All in one WooCommerce solution for Gutenberg! Build your WooCommerce pages in a block editor with full customization.', 'elementskit-lite'),
					'docs' => 'https://wpmet.com/doc/shopengine/shopengine-gutenberg/',
				],
			]
		) # @plugins
		->call();

		$user_consent = Libs\Framework\Classes\Utils::instance()->get_settings('ekit_user_consent_for_banner', 'yes') == 'yes';

		/**
		 * EmailKit Global Class initialization
		 *
		 */
		if (
			class_exists('WooCommerce')
			&& !class_exists('EmailKit')
			&& !did_action('edit_with_emailkit_loaded')
			&& class_exists('\Wpmet\Libs\Emailkit')
			&& $user_consent
		) {
			new \Wpmet\Libs\Emailkit();
		}

		/**
		 * Initializes the Template Library of the Gutenkit plugin
		 *
		 * This code block checks if certain conditions are met and then initializes the Template Library of the Gutenkit plugin.
		 *
		 * Conditions:
		 * - The action 'edit_with_gutenkit_loaded' has not been performed yet.
		 * - The class '\ElementsKit_Lite\Libs\Template_Library\Init' exists.
		 * - The setting 'ekit_user_consent_for_banner' in the Utils class is set to 'yes'.
		 * - The plugin 'gutenkit-blocks-addon' is not active or install.
		 *
		 * If any of the above conditions are met, the Template Library is initialized by creating a new instance of
		 * the class '\ElementsKit_Lite\Libs\Template_Library\Init'.
		 *
		 * @since 3.1.4
		 */
		if ($user_consent && class_exists('\ElementsKit_Lite\Libs\Template_Library\Init') && !did_action('gutenkit/init')) {
			new \ElementsKit_Lite\Libs\Template_Library\Init();
		}
	}

	/**
	 * Check the admin screen and show the rating notice if eligible
	 *
	 * @access private
	 * @return boolean
	 */
	private function should_show_rating_notice() {

		if ( \ElementsKit_Lite::package_type() == 'free' ) {
			return true;
		}

		if ( ! function_exists( 'get_current_screen' ) ) {
			return false;
		}

		$current_screen     = ( get_current_screen() )->base;
		$current_post_type  = ( get_current_screen() )->post_type;
		$eligible_post_type = array( 'elementskit_template' );
		$eligible_screens   = array( 'plugins', 'dashboard', 'elementskit', 'themes' );

		if ( in_array( $current_post_type, $eligible_post_type ) ) {
			return true;
		}

		if ( in_array( $current_screen, $eligible_screens ) ) {
			return true;
		}

		return false;
	}

	/**
	 * Enqueue scripts
	 *
	 * Enqueue js and css to admin.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function enqueue_admin() {
		$screen = get_current_screen();

		if ( ! in_array( $screen->id, array( 'nav-menus', 'toplevel_page_elementskit', 'edit-elementskit_template', 'elementskit_page_elementskit-license', 'elementskit_page_elementskit-lite_get_help' ) ) ) {
			return;
		}

		wp_register_style( 'fontawesome', \ElementsKit_Lite::widget_url() . 'init/assets/css/font-awesome.min.css', false, \ElementsKit_Lite::version() );
		wp_register_style( 'elementskit-font-css-admin', \ElementsKit_Lite::module_url() . 'elementskit-icon-pack/assets/css/ekiticons.css', false, \ElementsKit_Lite::version() );
		wp_register_style( 'elementskit-init-css-admin', \ElementsKit_Lite::lib_url() . 'framework/assets/css/admin-style.css', false, \ElementsKit_Lite::version() );

		wp_enqueue_style( 'fontawesome' );
		wp_enqueue_style( 'elementskit-font-css-admin' );
		wp_enqueue_style( 'elementskit-init-css-admin' );

		wp_enqueue_script( 'ekit-admin-core', \ElementsKit_Lite::lib_url() . 'framework/assets/js/ekit-admin-core.js', array( 'jquery' ), \ElementsKit_Lite::version(), true );

		$data['rest_url'] = get_rest_url();
		$data['nonce']    = wp_create_nonce( 'wp_rest' );

		wp_localize_script( 'ekit-admin-core', 'rest_config', $data );

		wp_localize_script(
			'ekit-admin-core',
			'ekit_ajax_var',
			array(
				'nonce' => wp_create_nonce( 'ajax-nonce' ),
			)
		);
	}

	/**
	 * Control registrar.
	 *
	 * Register the custom controls for Elementor
	 * using `elementskit/widgets/widgets_registered` action.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_control( $widgets_manager ) {
		do_action( 'elementskit/widgets/widgets_registered', $widgets_manager );
	}


	/**
	 * Widget registrar.
	 *
	 * Retrieve all the registered widgets
	 * using `elementor/widgets/register` action.
	 *
	 * @since 1.0.0
	 * @access public
	 */
	public function register_widgets( $widgets_manager ) {
		do_action( 'elementskit/widgets/widgets_registered', $widgets_manager );
	}

	/**
	 * Excluding ElementsKit template and megamenu content from search engine.
	 * See - https://wordpress.org/support/topic/google-is-indexing-elementskit-content-as-separate-pages/
	 *
	 * @since 1.4.5
	 * @access public
	 */
	public function add_meta_for_search_excluded() {
		if (
			! is_admin() &&
			is_singular() &&
			in_array(
				get_post_type(),
				array( 'elementskit_widget', 'elementskit_template', 'elementskit_content' ),
				true
			)
		) {
			header( 'X-Robots-Tag: noindex', true );
		}
	}

	/**
	 * Autoloader.
	 *
	 * ElementsKit autoloader loads all the classes needed to run the plugin.
	 *
	 * @since 1.0.0
	 * @access private
	 */
	public static function registrar_autoloader() {
		require_once \ElementsKit_Lite::plugin_dir() . '/autoloader.php';
		Autoloader::run();
	}

	/**
	 * Instance.
	 *
	 * Ensures only one instance of the plugin class is loaded or can be loaded.
	 *
	 * @since 1.0.0
	 * @access public
	 * @static
	 *
	 * @return Plugin An instance of the class.
	 */
	public static function instance() {
		if ( is_null( self::$instance ) ) {

			do_action( 'elementskit_lite/before_loaded' );

			// Fire when ElementsKit instance.
			self::$instance = new self();

			do_action( 'elementskit/loaded' ); // legacy support
			do_action( 'elementskit_lite/after_loaded' );
		}

		return self::$instance;
	}
}
