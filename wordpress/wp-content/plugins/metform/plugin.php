<?php

namespace MetForm;

use MetForm\Core\Integrations\Onboard\Attr;
use MetForm\Core\Integrations\Emailkit_Builder;
use MetForm\Core\Integrations\Onboard\Onboard;

defined('ABSPATH') || exit;

final class Plugin {

    private static $instance;

    private $entries;
    private $global_settings;

    public function __construct()
    {
        Autoloader::run();
	   add_action( 'wp_head', array( $this, 'add_meta_for_search_excluded' ) );
       add_action( 'init', array ($this, 'metform_permalink_setup'));
       add_action("metform/pro_awareness/before_grid_contents", ['\MetForm\Utils\Util', 'banner_consent']);
       add_action( 'wp_ajax_metform_admin_action', ['\MetForm\Utils\Util', 'metform_admin_action'] );
       add_action( 'admin_head', array( $this, 'hide_other_plugin_notices' ), 1 );

       /** Adds a global CSS class to the body tag in the editor.**/
       add_filter('admin_body_class', fn($classes) => $classes . ' metform-admin' );
    }

    public function version()
    {
        return '4.1.7';
    }

    public function package_type()
    {
        return apply_filters( 'metform/core/package_type', 'free' );
    }

    public function plugin_url()
    {
        return trailingslashit(plugin_dir_url(__FILE__));
    }

    public function plugin_dir()
    {
        return trailingslashit(plugin_dir_path(__FILE__));
    }

    public function core_url()
    {
        return $this->plugin_url() . 'core/';
    }

    public function core_dir()
    {
        return $this->plugin_dir() . 'core/';
    }

    public function base_url()
    {
        return $this->plugin_url() . 'base/';
    }

    public function base_dir()
    {
        return $this->plugin_dir() . 'base/';
    }

    public function utils_url()
    {
        return $this->plugin_url() . 'utils/';
    }

    public function utils_dir()
    {
        return $this->plugin_dir() . 'utils/';
    }

    public function widgets_url()
    {
        return $this->plugin_url() . 'widgets/';
    }

    public function widgets_dir()
    {
        return $this->plugin_dir() . 'widgets/';
    }

    public function public_url()
    {
        return $this->plugin_url() . 'public/';
    }

    public function public_dir()
    {
        return $this->plugin_dir() . 'public/';
    }

    public function account_url(){
		return 'https://account.wpmet.com';
	}


    public function init()
    {
        /**
         * ----------------------------------------
         *  Ask for rating ⭐⭐⭐⭐⭐
         *  A rating notice will appear depends on
         *  @set_first_appear_day methods
         * ----------------------------------------
         */
        if( ! isset($_GET['redirect_from']) || ! $_GET['redirect_from'] == 'mf_promo_banner'){

            Onboard::instance()->init();
    
            if(isset($_GET['met-onboard-steps']) && isset($_GET['met-onboard-steps-nonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['met-onboard-steps-nonce'])),'met-onboard-steps-action')) {
                Attr::instance();
            }
        }

        if( get_option('rewrite_rules') == '' && isset($_GET['redirect_from']) && $_GET['redirect_from'] == 'mf_promo_banner'){
            
            add_action('init', function() {
                Utils\Util::change_permalink();
            });
        }

        //  Load Text Domain Just In Time error Notice issue fix

        $filter_string = ''; // elementskit,metform-pro
        $filter_string .= ((!in_array('elementskit/elementskit.php', apply_filters('active_plugins', get_option('active_plugins')))) ? '' : ',elementskit');
        $filter_string .= (!class_exists('\MetForm\Plugin') ? '' : ',metform');
        $filter_string .= (!class_exists('\MetForm_Pro\Plugin') ? '' : ',metform-pro');

        if ( is_admin() && \MetForm\Utils\Util::get_settings( 'metform_user_consent_for_banner', 'yes' ) == 'yes' ) {
      
            //Rating notice
            \Wpmet\Libs\Rating::instance('metform')
            ->set_plugin_logo('https://ps.w.org/metform/assets/icon-128x128.png')
            ->set_plugin('Metform', 'https://wpmet.com/wordpress.org/rating/metform')
            ->set_allowed_screens('edit-metform-entry')
            ->set_allowed_screens('edit-metform-form')
            ->set_allowed_screens('metform_page_metform_get_help')
            ->set_priority(30)
            ->set_first_appear_day(7)
            ->set_condition(true)
            ->call();

            // banner
            \Wpmet\Libs\Banner::instance('metform')
                ->set_filter(ltrim($filter_string, ','))
                ->set_api_url('https://api.wpmet.com/public/jhanda')
                ->set_plugin_screens('edit-metform-form')
                ->set_plugin_screens('edit-metform-entry')
                ->set_plugin_screens('metform_page_metform-menu-settings')
                ->call();

            /**
             * Show WPMET stories widget in dashboard
             */
            \Wpmet\Libs\Stories::instance('metform')

                ->set_filter($filter_string)
                ->set_plugin('Metform', 'https://wpmet.com/plugin/metform/')
                ->set_api_url('https://api.wpmet.com/public/stories/')
                ->call();

        }


    
        if( class_exists('WooCommerce') && !class_exists('EmailKit') && !did_action('edit_with_emailkit_loaded') && class_exists('\Wpmet\Libs\Emailkit') && \MetForm\Utils\Util::get_settings( 'metform_user_consent_for_banner', 'yes' ) == 'yes') {
            new \Wpmet\Libs\Emailkit();        
        }

        // Check if Elementor installed and activated.
        if (!did_action('elementor/loaded')) {
            $this->missing_elementor();
            return;
        }
        // Check for required Elementor version.
        if (!version_compare(ELEMENTOR_VERSION, '3.0.1', '>=')) {
            $this->failed_elementor_version();
            // add_action('admin_notices', array($this, 'failed_elementor_version'));
            return;
        }

        if (current_user_can('manage_options')) {
            add_action('admin_menu', [$this, 'admin_menu']);
        }

        // Initialize deactivation feedback modal
        new Utils\Feedback\Plugin_Unsubscribe();

        add_action('elementor/editor/before_enqueue_scripts', [$this, 'edit_view_scripts']);
	    add_action( 'elementor/editor/after_enqueue_scripts', [$this, 'metform_editor_script'] );

        add_action('init', [$this, 'metform_load_textdomain_on_init'], 9);

        add_action('admin_enqueue_scripts', [$this, 'js_css_admin']);
        add_action('wp_enqueue_scripts', [$this, 'js_css_public']);

        $my_theme = wp_get_theme();
        if(current_user_can('manage_options') && $my_theme->get('Name') == 'Cleano'){
            add_action( 'admin_enqueue_scripts', [$this, 'cleanoThemeConflict'], 100 );
        }
        
        add_action('elementor/frontend/before_enqueue_scripts', [$this, 'elementor_js']);

        add_action('elementor/editor/before_enqueue_styles', [$this, 'elementor_css']);

        add_action('admin_footer', [$this, 'footer_data']);

       
        Controls\Base::instance()->init();

        Widgets\Manifest::instance()->init();

        // settings page
        Core\Admin\Base::instance()->init();

        Core\Forms\Auto_Increment_Entry::instance();

        if( class_exists( 'EmailKit' ) ){
            //metform confirmation to user email template edit with emailkit
            Emailkit_Builder::instance()->init();
        }


        /*
        * Fix for conflict with Enhanced Tooltip Glossary plugin which is not allowing our script to load in the frontend and causing js error.
        * It is due to the way they are handling the content and parsing the scripts from it. So we are applying a fix for that by using regex to extract our scripts and replace them back after their parsing.
        * This is a temporary fix until they provide a proper solution for this conflict.
        */

        if ( ! function_exists( 'is_plugin_active' ) ) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        
        if ( is_plugin_active( 'enhanced-tooltipglossary/enhanced-tooltipglossary.php' ) ) {
            add_filter( 'the_content', function( $content ) {
                global $cmtt_metform_scripts;
                $cmtt_metform_scripts = [];
                $result = preg_replace_callback(
                    '#<script[^>]+class=["\'][^"\']*mf-template[^"\']*["\'][^>]*>[\s\S]*?</script>#i',
                    function( $matches ) {
                        global $cmtt_metform_scripts;
                        $key = 'METFORM_TPL_' . count( $cmtt_metform_scripts );
                        $cmtt_metform_scripts[ $key ] = $matches[0];
                        return '<!--' . $key . '-->';
                    },
                    $content
                );
                return $result ?? $content;
            }, 19999 );

            add_filter( 'the_content', function( $content ) {
                global $cmtt_metform_scripts;
                if ( ! empty( $cmtt_metform_scripts ) ) {
                    foreach ( $cmtt_metform_scripts as $key => $script ) {
                        $content = str_replace( '<!--' . $key . '-->', $script, $content );
                    }
                    $cmtt_metform_scripts = [];
                }
                return $content;
            }, 20002 );
        }
    }

    function metform_load_textdomain_on_init(){

        $apps_img_path = $this->public_url() . 'assets/img/apps-page/';

        /**
         * Show apps menu for others wpmet plugins
         */
        \Wpmet\Libs\Apps::instance()->init('metform')
        ->set_parent_menu_slug('metform-menu')
        ->set_submenu_name(__('Our Plugins', 'metform'))
        ->set_section_title(__('Unleash the Full Potential of Elementor and WordPress!', 'metform'))
        ->set_section_description(__('Install other plugins from us and take your website to the next level for absolutely free!', 'metform'))
        ->set_items_per_row(4)
        ->set_plugins(
        [
            'elementskit-lite/elementskit-lite.php' => [
                'name' => esc_html__('ElementsKit', 'metform'),
                'url'  => 'https://wordpress.org/plugins/elementskit-lite/',
                'icon' => $apps_img_path. 'elementskit.gif',
                'desc' => esc_html__('All-in-one Elementor addon trusted by 1 Million+ users, makes your website builder process easier with ultimate freedom.', 'metform'),
                'docs' => 'https://wpmet.com/doc/elementskit/',
            ],
            'gutenkit-blocks-addon/gutenkit-blocks-addon.php' => [
                'name' => esc_html__('GutenKit', 'metform'),
                'url'  => 'https://wordpress.org/plugins/gutenkit-blocks-addon/',
                'icon' => $apps_img_path. 'guten-kit.png',
                'desc' => esc_html__('Gutenberg blocks, patterns, and templates that extend the page-building experience using the WordPress block editor.', 'metform'),
                'docs' => 'https://wpmet.com/doc/gutenkit/',
            ],
            'rox-dynamic-cpt-fields-engine/rox-dynamic-cpt-fields-engine.php' => [
                'name' => esc_html__('Rox Dynamic CPT Fields', 'metform'),
                'url'  => 'https://wordpress.org/plugins/rox-dynamic-cpt-fields-engine/',
                'icon' => 'https://ps.w.org/rox-dynamic-cpt-fields-engine/assets/icon-256x256.jpeg?rev=3538537',
                'desc' => esc_html__('Build custom post types, fields, taxonomies, and dynamic frontend layouts for WordPress, with zero coding and full AI-generated schema.', 'metform'),
                'docs' => 'https://wpmet.com/doc/rox-dynamic-cpt-fields-engine/',
            ],
             'rox-appointment-booking/rox-appointment-booking.php' => [
                'name' => esc_html__('Rox Appointment Booking', 'metform'),
                'url'  => 'https://wordpress.org/plugins/rox-appointment-booking/',
                'icon' => 'https://ps.w.org/rox-appointment-booking/assets/icon-256x256.png?rev=3575641',
                'desc' => esc_html__('Manage bookings, agents, payments, and calendars from one dashboard! A complete appointment and scheduling solution for WordPress.', 'metform'),
                'docs' => 'https://wpmet.com/doc/rox-appointment-booking/',
            ],
            'shopengine/shopengine.php' => [
                'name' => esc_html__('ShopEngine', 'metform'),
                'url'  => 'https://wordpress.org/plugins/shopengine/',
                'icon' => $apps_img_path. 'shopengine.gif',
                'desc' => esc_html__('Complete WooCommerce solution for Elementor to fully customize any pages including cart, checkout, shop page, and so on.
                ', 'metform'),
                'docs' => 'https://wpmet.com/doc/shopengine/',
            ],
            'popup-builder-block/popup-builder-block.php' => [
                'name' => esc_html__('PopupKit', 'metform'),
                'url'  => 'https://wordpress.org/plugins/popup-builder-block/',
                'icon' => 'https://ps.w.org/popup-builder-block/assets/icon-256x256.png?rev=3316844',
                'desc' => esc_html__('Design popups that convert, right in your WordPress dashboard.', 'metform'),
                'docs' => 'https://wpmet.com/doc/popupkit/',
            ],
            'table-builder-block/table-builder-block.php' => [
                'name' => esc_html__('TableKit', 'metform'),
                'url'  => 'https://wordpress.org/plugins/table-builder-block/',
                'icon' => 'https://ps.w.org/table-builder-block/assets/icon-256x256.png?rev=3509972',
                'desc' => esc_html__('Fully Customizable. Multi-Media Integration. Synch Any Data Files. All Within Block Editor.', 'metform'),
                'docs' => 'https://wpmet.com/doc/tablekit/',
            ],
            'getgenie/getgenie.php' => [
                'name' => esc_html__('GetGenie', 'metform'),
                'url'  => 'https://wordpress.org/plugins/getgenie/',
                'icon' => $apps_img_path.'getgenie.gif',
                'desc' => esc_html__('Your personal AI assistant for content and SEO. Write content that ranks on Google with NLP keywords and SERP analysis data.', 'metform'),
                'docs' => 'https://getgenie.ai/docs/',
            ],
            'emailkit/EmailKit.php' => [
                'name' => esc_html__('EmailKit', 'metform'),
                'url'  => 'https://wordpress.org/plugins/emailkit/',
                'icon' => $apps_img_path . 'emailkit.png',
                'desc' => esc_html__('Advanced email customizer for WooCommerce and WordPress. Build, customize, and send emails from WordPress to boost your sales!', 'metform'),
                'docs' => 'https://wpmet.com/doc/emailkit/',
            ],
            'wp-social/wp-social.php' => [
                'name' => esc_html__('Wp Social', 'metform'),
                'url'  => 'https://wordpress.org/plugins/wp-social/',
                'icon' => $apps_img_path . 'wp-social.png',
                'desc' => esc_html__('Add social share, login, and engagement counter — unified solution for all social media with tons of different styles for your website.', 'metform'),
                'docs' => 'https://wpmet.com/doc/wp-social/',
            ],
            'blocks-for-shopengine/shopengine-gutenberg-addon.php' => [
                'name' => esc_html__('Blocks for ShopEngine', 'metform'),
                'url'  => 'https://wordpress.org/plugins/blocks-for-shopengine/',
                'icon' => $apps_img_path . 'shopengine.gif',
                'desc' => esc_html__('All in one WooCommerce solution for Gutenberg! Build your WooCommerce pages in a block editor with full customization.', 'metform'),
                'docs' => 'https://wpmet.com/doc/shopengine/',
            ],
           
        ]
        )
        ->call();
        

         /**
         * Pro awareness feature;
         */

        $is_pro_active = '';

        if (!in_array('metform-pro/metform-pro.php', apply_filters('active_plugins', get_option('active_plugins')))) {
            $is_pro_active = __('Go Premium', 'metform');
        }

		$pro_awareness = \Wpmet\Libs\Pro_Awareness::instance('metform');
		if(version_compare($pro_awareness->get_version(), '1.2.0', '>=')) {
			$pro_awareness
			    ->set_parent_menu_slug('metform-menu')
			    ->set_pro_link(
			        (in_array('metform-pro/metform-pro.php', apply_filters('active_plugins', get_option('active_plugins')))) ? '' :
			            'https://wpmet.com/metform-pricing'
			    )
			    ->set_plugin_file('metform/metform.php')
			    ->set_default_grid_thumbnail($this->utils_url() . '/pro-awareness/assets/images/support.png')
			    ->set_page_grid([
			        'url' => 'https://wpmet.com/fb-group',
			        'title' => esc_html__( 'Join the Community', 'metform' ),
			        'thumbnail' => $this->utils_url() . '/pro-awareness/assets/images/community.png',
					'description' => esc_html__( 'Join our Facebook group to get 20% discount coupon on premium products. Follow us to get more exciting offers.', 'metform' )

			    ])
			    ->set_page_grid([
			        'url' => 'https://www.youtube.com/playlist?list=PL3t2OjZ6gY8NoB_48DwWKUDRtBEuBOxSc',
			        'title' => esc_html__( 'Video Tutorials', 'metform' ),
			        'thumbnail' => $this->utils_url() . '/pro-awareness/assets/images/videos.png',
					'description' => esc_html__( 'Learn the step by step process for developing your site easily from video tutorials.', 'metform' )
			    ])
			    ->set_page_grid([
			        'url' => 'https://wpmet.com/plugin/metform/roadmaps#ideas',
			        'title' => esc_html__( 'Request a feature', 'metform' ),
			        'thumbnail' => $this->utils_url() . '/pro-awareness/assets/images/request.png',
					'description' => esc_html__( 'Have any special feature in mind? Let us know through the feature request.', 'metform' )
			    ])
			    ->set_page_grid([
					'url'       => 'https://wpmet.com/doc/metform/',
					'title'     => esc_html__( 'Documentation', 'metform' ),
					'thumbnail' => $this->utils_url() . 'pro-awareness/assets/images/documentation.png',
					'description' => esc_html__( 'Detailed documentation to help you understand the functionality of each feature.', 'metform' )
				])
				->set_page_grid([
					'url'       => 'https://wpmet.com/plugin/metform/roadmaps/',
					'title'     => esc_html__( 'Public Roadmap', 'metform' ),
					'thumbnail' => $this->utils_url() . 'pro-awareness/assets/images/roadmaps.png',
					'description' => esc_html__( 'Check our upcoming new features, detailed development stories and tasks', 'metform' )
				])

			    ->set_plugin_row_meta(__('Documentation', 'metform'), 'https://help.wpmet.com/docs-cat/metform/', ['target' => '_blank'])
			    ->set_plugin_row_meta(__('Facebook Community', 'metform'), 'https://wpmet.com/fb-group', ['target' => '_blank'])
			    ->set_plugin_row_meta(__('Rate the plugin ★★★★★', 'metform'), 'https://wordpress.org/support/plugin/metform/reviews/#new-post', ['target' => '_blank'])
			    ->set_plugin_action_link(__('Settings', 'metform'), admin_url() . 'admin.php?page=metform-menu-settings')
			    ->set_plugin_action_link($is_pro_active, 'https://wpmet.com/plugin/metform/pricing/', ['target' => '_blank', 'style' => 'color: #FCB214; font-weight: bold;'])
			    ->call();
		}

        Core\Forms\Base::instance()->init();
        Core\Analytics\Base::instance()->init();
        $this->entries = Core\Entries\Base::instance();
        
     }

    function metform_editor_script(){
	    	wp_enqueue_script('metform-editor-panel-script', $this->public_url() . '/assets/js/editor-panel.js', ['jquery'], $this->version(), true);
    }

    function js_css_public()
    {
        $this->global_settings = \MetForm\Core\Admin\Base::instance()->get_settings_option();
        $is_form_cpt = ('metform-form' === get_post_type());

        wp_register_style('metform-ui', $this->public_url() . 'assets/css/metform-ui.css', false, $this->version());

        wp_register_style('metform-style', $this->public_url() . 'assets/css/style.css', false, $this->version());

        wp_register_style('text-editor-style', $this->public_url() . 'assets/css/text-editor.css', false, $this->version());

        wp_register_script('htm', $this->public_url() . 'assets/js/htm.js', null, $this->version(), true);

        wp_register_script('metform-app', $this->public_url() . 'assets/js/app.js', ['htm', 'jquery', 'wp-element'], $this->version(), true);
        wp_register_script('mf-widget-frontend', $this->public_url() . 'assets/js/widget-forntend.js', ['metform-app'], $this->version(), true);

        wp_localize_script('metform-app', 'mf', [
            'postType' => get_post_type(),
            'restURI' => get_rest_url(null, 'metform/v1/forms/views/'),
            'minMsg1' => __("Minimum length should be ","metform"),
            'Msg2' => __(" character long.","metform"),
            'maxMsg1' => __("Maximum length should be ","metform"),
            'maxNum' => __("Maximum number should be ","metform"),
            'minNum' => __("Minimum number should be ","metform"),
        ]);

        // Recaptcha Support Script.
        wp_register_script( 'recaptcha-support', $this->public_url() . 'assets/js/recaptcha-support.js', ['jquery'], $this->version(), true );


        // begins pro feature
        // begins for mf-simple-repeater
        wp_register_style('asRange', $this->public_url() . 'assets/css/asRange.min.css', false, $this->version());
        wp_register_script('asRange', $this->public_url() . 'assets/js/jquery-asRange.min.js', [], $this->version(), true);
        wp_enqueue_script('cute-alert', $this->public_url() . 'assets/lib/cute-alert/cute-alert.js', [], $this->version(), true);
        wp_register_style('mf-select2', $this->public_url() . 'assets/css/select2.min.css', false, $this->version());
        wp_register_script('mf-select2', $this->public_url() . 'assets/js/select2.min.js', [], $this->version(), true);
        // ends for mf-simple-repeater

        wp_register_script('recaptcha-v2', 'https://google.com/recaptcha/api.js?render=explicit', [], null, true);

        if (isset($this->global_settings['mf_recaptcha_version']) && ($this->global_settings['mf_recaptcha_version'] == 'recaptcha-v3') && isset($this->global_settings['mf_recaptcha_site_key_v3']) && ($this->global_settings['mf_recaptcha_site_key_v3'] != '')) {
            wp_register_script('recaptcha-v3', 'https://www.google.com/recaptcha/api.js?render=' . $this->global_settings['mf_recaptcha_site_key_v3'], [], $this->version(), false);
        }

        if (isset($this->global_settings['mf_google_map_api_key']) && ($this->global_settings['mf_google_map_api_key'] != '')) {
            wp_register_script('maps-api', 'https://maps.googleapis.com/maps/api/js?key=' . $this->global_settings['mf_google_map_api_key'] . '&libraries=places&&callback=mfMapLocation', [], '', true);
        }

        // for date, time, simple repeater
        wp_deregister_style('flatpickr'); // flatpickr stylesheet
        wp_register_style('flatpickr', $this->public_url() . 'assets/css/flatpickr.min.css', false, $this->version()); // flatpickr stylesheet
        wp_enqueue_style('cute-alert', $this->public_url() . 'assets/lib/cute-alert/style.css', false, $this->version());
        // ends pro feature


        wp_enqueue_style('text-editor-style');
        
        if($is_form_cpt){
            wp_enqueue_style('metform-ui');
            wp_enqueue_style('metform-style');
            wp_enqueue_script('htm');
            wp_enqueue_script('metform-app');
            wp_enqueue_script('mf-widget-frontend');
        } 

        do_action('metform/onload/enqueue_scripts');
    }

   

    public function edit_view_scripts()
    {
        wp_enqueue_style('metform-ui', $this->public_url() . 'assets/css/metform-ui.css', false, $this->version());
        wp_enqueue_style('metform-icon', $this->public_url() . 'assets/mf-icon/mf-icon.css', false, $this->version());
        wp_enqueue_style('metform-admin-style', $this->public_url() . 'assets/css/admin-style.css', false, $this->version());

        wp_enqueue_script('metform-ui', $this->public_url() . 'assets/js/ui.min.js', [], $this->version(), true);
        wp_enqueue_script('metform-admin-script', $this->public_url() . 'assets/js/admin-script.js', [], null, true);

        wp_add_inline_script('metform-admin-script', "
            var metform_api = {
                resturl: '" . get_rest_url() . "'
            }
        ");
    }

    public function elementor_js()
    {
    }

    public function elementor_css()
    {
        if ('metform-form' == get_post_type()) {
            wp_enqueue_style('metform-category-top', $this->public_url() . 'assets/css/category-top.css', false, $this->version());
        }
    }



    /**
     * @function - {cleanoThemeConflict}
     * @description - this function is used to remove conflict of bootstrap between metform & cleano theme.
     */
    function cleanoThemeConflict() {

        $screen = get_current_screen();
        if(in_array($screen->id, ['edit-metform-form', 'metform_page_mt-form-settings', 'metform-entry', 'metform_page_metform-menu-settings'])){
            wp_dequeue_script( 'bootstrap' );
        }
     }


    function js_css_admin()
    {


        wp_enqueue_style( 'mf-wp-dashboard', $this->core_url() . 'admin/css/mf-wp-dashboard.css', [], $this->version() );

        $screen = get_current_screen();

        if (in_array($screen->id, ['edit-metform-form', 'metform_page_mt-form-settings', 'metform-entry', 'metform_page_metform-menu-settings'])) {
            wp_enqueue_style('metform-admin-fonts', $this->public_url() . 'assets/admin-fonts.css', false, $this->version());
            wp_enqueue_style('metform-ui', $this->public_url() . 'assets/css/metform-ui.css', false, $this->version());
            wp_enqueue_style('metform-admin-style', $this->public_url() . 'assets/css/admin-style.css', false, $this->version());

            wp_enqueue_script('metform-ui', $this->public_url() . 'assets/js/ui.min.js', [], $this->version(), true);
            wp_enqueue_script('metform-admin-script', $this->public_url() . 'assets/js/admin-script.js', [], null, true);
            wp_localize_script('metform-admin-script', 'metform_api', ['resturl' => get_rest_url(), 'admin_url' => get_admin_url()]);

            wp_localize_script('metform-admin-script', 'metform_emailkit_config', [
                'is_emailkit_active' => class_exists('EmailKit'),
                'is_emailkit_pro_active' => class_exists('EmailKitPro'),
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('metform_emailkit_nonce'),
            ]);
        }

        if (in_array($screen->id, ['edit-metform-entry', 'metform-entry', 'edit-metform-form'])) {
            wp_enqueue_style('admin-form-list-style', $this->public_url() . 'assets/css/admin-form-list-style.css', [], $this->version());
        }

        if ($screen->id == 'edit-metform-entry' || $screen->id == 'metform-entry') {
            wp_enqueue_style('metform-ui', $this->public_url() . 'assets/css/metform-ui.css', false, $this->version());
            wp_enqueue_style('metform-admin-entries-view', $this->public_url() . 'assets/css/admin-entries-view.css', false, $this->version());
            wp_enqueue_script('metform-entry-script', $this->public_url() . 'assets/js/admin-entry-script.js', [], $this->version(), true);
        }

        if ($screen->id == 'edit-metform-form') {
            wp_enqueue_style('metform-admin-entries-view', $this->public_url() . 'assets/css/admin-entries-view.css', [], $this->version());
            wp_enqueue_script('metform-form-script', $this->public_url() . 'assets/js/admin-form-script.js', ['jquery'], $this->version(), true);
        }
    }

    /**
	 * Excluding Metform form from search engine.
	 *
	 */
	public function add_meta_for_search_excluded() {
       


		if ( in_array(get_post_type(), ['metform-form']) ) {
			echo '<meta name="robots" content="noindex,nofollow" />', "\n";
		}
	}

    public function footer_data()
    {

        $screen = get_current_screen();

        if ($screen->id == 'edit-metform-entry') {
            $args = [
                'post_type'   => 'metform-form',
                'post_status' => 'publish',
                'numberposts' => -1,
            ];

            $forms = get_posts($args);
            //phpcs:ignore WordPress.Security.NonceVerification -- Nonce can't be added in CPT URL
            $get_form_id = isset($_GET['form_id']) ? sanitize_key($_GET['form_id']) : '';
?>
            <div id='metform-formlist' style='display:none;'><select name='mf_form_id' id='metform-form_id'>
                <option value='all' <?php echo esc_attr(((($get_form_id == 'all') || ($get_form_id == '')) ? 'selected=selected' : '')); ?>><?php echo esc_html__('All', 'metform'); ?></option>
                <?php

                foreach ($forms as $form) {
                    $form_list[$form->ID] = $form->post_title;
                    ?>
                    <option value="<?php echo esc_attr($form->ID); ?>" <?php echo esc_attr(($get_form_id == $form->ID) ? 'selected=selected' : ''); ?>><?php echo esc_html($form->post_title); ?></option>
        <?php
                }
            echo "</select></div>";
        }
    }

    function admin_menu()
    {
        add_menu_page(
            esc_html__('MetForm', 'metform'),
            esc_html__('MetForm', 'metform'),
            'read',
            'metform-menu',
            '',
            $this->core_url() . 'admin/images/icon-menu.png',
            5
        );
    }

    public function missing_elementor()
    {
        //phpcs:disable WordPress.Security.NonceVerification -- Can't set nonce. Cause it's fire on 'plugins_loaded' hook
        if (isset($_GET['activate'])) {
            unset($_GET['activate']);
        }
        //phpcs:enable
        if (file_exists(WP_PLUGIN_DIR . '/elementor/elementor.php')) {
            $btn['text'] = esc_html__('Activate Elementor', 'metform');
            $btn['id'] = 'unsupported-elementor-version';
            $btn['class'] = 'button-primary';
            $btn['url'] = wp_nonce_url('plugins.php?action=activate&plugin=elementor/elementor.php&plugin_status=all&paged=1', 'activate-plugin_elementor/elementor.php');
        } else {
            $btn['id'] = 'unsupported-elementor-version';
            $btn['class'] = 'button-primary';
            $btn['text'] = esc_html__('Install Elementor', 'metform');
            $btn['url'] = wp_nonce_url(self_admin_url('update.php?action=install-plugin&plugin=elementor'), 'install-plugin_elementor');
        }
        // translators: MetForm plugin version requirement. %s is the required Elementor version.
        $message = sprintf(esc_html__('MetForm requires Elementor version %1$s+, which is currently NOT RUNNING.', 'metform'), '2.6.0');

        \Oxaim\Libs\Notice::instance('metform', 'unsupported-elementor-version')
            ->set_dismiss('global', (3600 * 24 * 15))
            ->set_message($message)
            ->set_button($btn)
            ->call();
    }

    public function failed_elementor_version()
    {

        $btn['text'] = esc_html__('Update Elementor', 'metform');
        // translators: MetForm plugin version requirement. %s is the required Elementor version.
        $btn['url'] = wp_nonce_url( self_admin_url( 'update.php?action=upgrade-plugin&plugin=elementor/elementor.php' ), 'upgrade-plugin_elementor/elementor.php' );
        $btn['class'] = 'button-primary';

        $message = sprintf(esc_html__('MetForm requires Elementor version %1$s+, which is currently NOT RUNNING.', 'metform'), '3.0.1');
        \Oxaim\Libs\Notice::instance('metform', 'unsupported-elementor-version')
            ->set_dismiss('global', (3600 * 24 * 15))
            ->set_message($message)
            ->set_button($btn)
            ->call();
    }

    public function flush_rewrites()
    {
        $form_cpt = new Core\Forms\Cpt();
        $form_cpt->flush_rewrites();
    }


    public static function instance()
    {
        if (!self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function metform_permalink_setup(){
       
        Utils\Util::permalink_setup();
    }

    /**
     * Hide other plugins/themes admin notices on MetForm pages
     * Only show MetForm's own notices
     */
    public function hide_other_plugin_notices() {
        $screen = get_current_screen();
        
        if (!$screen) {
            return;
        }
        
        // Check if current page is a MetForm page by screen ID
        $is_metform_page = (strpos($screen->id, 'metform') !== false);
        
        // Also check for post_type parameter
        if (!$is_metform_page && isset($_GET['post_type'])) {
            $post_type = sanitize_text_field($_GET['post_type']);
            $is_metform_page = (strpos($post_type, 'metform') !== false);
        }
        
        // Check if current page is a MetForm page
        if ($is_metform_page) {
            global $wp_filter;
            
            // Store MetForm notices before removing all
            $metform_notices = [];
            
            if (isset($wp_filter['admin_notices'])) {
                foreach ($wp_filter['admin_notices']->callbacks as $priority => $callbacks) {
                    foreach ($callbacks as $key => $callback) {
                        // Keep only MetForm and Oxaim (MetForm's namespace) notices
                        if (is_array($callback['function'])) {
                            $class = is_object($callback['function'][0]) ? get_class($callback['function'][0]) : $callback['function'][0];
                            if (strpos($class, 'MetForm') !== false || strpos($class, 'Oxaim') !== false) {
                                $metform_notices[$priority][$key] = $callback;
                            }
                        } elseif (is_string($callback['function']) && (strpos($callback['function'], 'metform') !== false || strpos($callback['function'], 'oxaim') !== false)) {
                            $metform_notices[$priority][$key] = $callback;
                        }
                    }
                }
            }
            
            // Remove all admin notices
            remove_all_actions('admin_notices');
            remove_all_actions('all_admin_notices');
            
            // Re-add only MetForm notices
            if (!empty($metform_notices)) {
                foreach ($metform_notices as $priority => $callbacks) {
                    foreach ($callbacks as $callback) {
                        add_action('admin_notices', $callback['function'], $priority, $callback['accepted_args']);
                    }
                }
            }
        }
    }


}
