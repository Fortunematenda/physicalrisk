<?php
namespace EmailKit\Promotional;
defined( 'ABSPATH' ) || exit;
use \Wpmet\UtilityPackage\Stories\Stories;
use \Wpmet\UtilityPackage\Notice\Notice;
use \Wpmet\UtilityPackage\Banner\Banner;
use \Wpmet\UtilityPackage\Rating\Rating;
use \Wpmet\UtilityPackage\Plugins\Plugins;

use \EmailKit\Promotional\ProAwareness\ProAwareness;
use \EmailKit\Promotional\Onboard\Onboard;
use \EmailKit\Promotional\Onboard\Attr;
class Promotional{
    
    function init(){
        
        /**
         * Show Eamilkit Notice
         */
        Notice::init();

        if( !class_exists( 'EmailKitPro' ) ){
            Notice::instance( 'emailkit', 'go-pro-notice' )   # @plugin_slug @notice_name
            ->set_dismiss( 'global', ( 3600 * 24 * 300 ) )                                          # @global/user @time_period
            ->set_type( 'warning' )                                                                 # @notice_type
            ->set_html(
                    '
                    <div class="ekit-go-pro-notice">
                        <strong>Thank you for using EmailKit .</strong> To get more amazing 
                        features and the outstanding pro ready-made templates, please get the 
                        <a style="color: #FCB214;" target="_blank" 
                        href="https://wpmet.com/emailkit-pricing">Premium Version</a>.
                    </div>
                '
                )                                                                                     # @notice_massage_html
            ->call();
        }

        if( \EmailKit\Promotional\Util::get_settings( 'emailkit_user_consent_for_banner', 'yes' ) == 'yes' ){


            /**
			 * MetForm get free templates promotional class initialization
			 *
			 */
			if( !did_action('metform/after_load') && did_action('elementor/loaded') && class_exists('\EmailKit\Promotional\MetformPromoBanner\MetformPromoBanner') ) {
	
                new \EmailKit\Promotional\MetformPromoBanner\MetformPromoBanner();
			}

            /**
             * Show WPMET stories widget in the dashboard
             */
            
            $filter_string = ''; // elementskit,metform-pro
            $filter_string .= ((!in_array('elementskit/elementskit.php', apply_filters('active_plugins', get_option('active_plugins')))) ? '' : ',elementskit');
            $filter_string .= (!class_exists('\MetForm\Plugin') ? '' : ',metform');
            $filter_string .= (!class_exists('\MetForm_Pro\Plugin') ? '' : ',metform-pro');

            Stories::instance( 'metform' )   # @plugin_slug
            // ->is_test(true)                                                      # @check_interval
            ->set_filter( $filter_string )                                          # @active_plugins
            ->set_plugin( 'EmailKit', 'https://wpmet.com/plugin/metform/' )  # @plugin_name  @plugin_url
            ->set_api_url( 'https://api.wpmet.com/public/stories/' )                # @api_url_for_stories
            ->call();
            
            /**
             * Show WPMET banner (codename: jhanda)
             */
            
            Banner::instance( 'emailkit' )     # @plugin_slug
            // ->is_test(true)                                                      # @check_interval
            ->set_filter( ltrim( $filter_string, ',' ) )                            # @active_plugins
            ->set_api_url( 'https://api.wpmet.com/public/jhanda' )                  # @api_url_for_banners
            ->set_plugin_screens( 'edit-elementskit_template' )                     # @set_allowed_screen
            ->set_plugin_screens( 'toplevel_page_elementskit' )                     # @set_allowed_screen
            ->call();
        
            /**
             * Ask for Ratings 
             */            
            Rating::instance('emailkit')                    # @plugin_slug
            ->set_message('Creating custom emails with a no-code solution - <strong>EmailKit?</strong> 📩 </br> 
            We would love to hear your thoughts! Share a <strong>5-star</strong> review to keep us motivated. 🙌')
            ->set_plugin_logo('https://ps.w.org/emailkit/assets/icon-128x128.png')       # @plugin_logo_url
            ->set_plugin('EmailKit', 'https://wpmet.com/wordpress.org/rating/emailkit')   # @plugin_name  @plugin_url
            ->set_rating_url('https://wordpress.org/support/plugin/emailkit/reviews/#new-post')
            ->set_support_url('https://wpmet.com/support-ticket')
            ->set_allowed_screens('edit-emailkit')                                 # @set_allowed_screen
            ->set_allowed_screens('edit-emailkit')                                  # @set_allowed_screen
            ->set_allowed_screens('emailkit_page_emailkit_get_help')                      # @set_allowed_screen
            ->set_priority(30)                                                          # @priority
            ->set_first_appear_day(7)                                                   # @time_interval_days
            ->set_condition(true)                                                       # @check_conditions
            ->call();
        }
        
        /**
         * Show our plugins menu for others wpmet plugins
         */
        
        Plugins::instance()->init('emailkit')                # @text_domain
        ->set_parent_menu_slug('emailkit-menu')                                      # @plugin_slug
        ->set_submenu_name('Our Plugins')
        ->set_section_title('Get More out of Your WordPress Website!')
        ->set_section_description('Revamp your website with other top plugins from us. And guess what, they\'re absolutely free!')                         # @section_description (optional)
        ->set_items_per_row(4)                                                      # @items_per_row (optional- default: 6)
        ->set_plugins(                                                              # @plugins
        [
            'elementskit-lite/elementskit-lite.php' => [
                'name' => 'ElementsKit Elementor addons',
                'url'  => 'https://wordpress.org/plugins/elementskit-lite/',
                'icon' => 'https://ps.w.org/elementskit-lite/assets/icon-256x256.gif?rev=2518175',
                'desc' => 'All-in-one Elementor addon trusted by 1 Million+ users, makes your website builder process easier with ultimate freedom.',
                'docs' => 'https://wpmet.com/docs/elementskit/',
            ],
            'getgenie/getgenie.php' => [
                'name' => 'GetGenie',
                'url'  => 'https://wordpress.org/plugins/getgenie/',
                'icon' => 'https://ps.w.org/getgenie/assets/icon-256x256.gif?rev=2798355',
                'desc' => 'Your personal AI assistant for content and SEO. Write content that ranks on Google with NLP keywords and SERP analysis data.',
                'docs' => 'https://getgenie.ai/docs/',
            ],
            'gutenkit-blocks-addon/gutenkit-blocks-addon.php' => [
                'name' => 'GutenKit',
                'url'  => 'https://wordpress.org/plugins/gutenkit-blocks-addon/',
                'icon' => 'https://ps.w.org/gutenkit-blocks-addon/assets/icon-128x128.gif?rev=3116270',
                'desc' => 'Gutenberg blocks, patterns, and templates that extend the page-building experience using the WordPress block editor.',
                'docs' => 'https://wpmet.com/doc/gutenkit/',
            ],
            'shopengine/shopengine.php' => [
                'name' =>'Shopengine',
                'url'  => 'https://wordpress.org/plugins/shopengine/',
                'icon' => 'https://ps.w.org/shopengine/assets/icon-256x256.gif?rev=2505061',
                'desc' => 'Complete WooCommerce solution for Elementor to fully customize any pages including cart, checkout, shop page, and so on.',
                'docs' => 'https://wpmet.com/doc/shopengine/',
            ],
            'metform/metform.php' => [
                'name' => 'MetForm',
                'url'  => 'https://wordpress.org/plugins/metform/',
                'icon' => 'https://ps.w.org/metform/assets/icon-256x256.png',
                'desc' => 'Drag & drop form builder for Elementor to create contact forms, multi-step forms, and more — smoother, faster, and better!',
                'docs' => 'https://wpmet.com/doc/metform/',
            ],

            'wp-social/wp-social.php' => [
                'name' => 'WP Social',
                'url'  => 'https://wordpress.org/plugins/wp-social/',
                'icon' => 'https://ps.w.org/wp-social/assets/icon-256x256.png?rev=2544214',
                'desc' => 'Add social share, login, and engagement counter — unified solution for all social media with tons of different styles for your website.',
                'docs' => 'https://wpmet.com/doc/wp-social/',
            ],
            
            'wp-ultimate-review/wp-ultimate-review.php' => [
                'name' => 'WP Ultimate Review',
                'url'  => 'https://wordpress.org/plugins/wp-ultimate-review/',
                'icon' => 'https://ps.w.org/wp-ultimate-review/assets/icon-256x256.png?rev=2544187',
                'desc' =>  'Collect and showcase reviews on your website to build brand credibility and social proof with the easiest solution.',
                'docs' => 'https://wpmet.com/doc/wp-ultimate-review/',
            ],

            'wp-fundraising-donation/wp-fundraising.php' => [
                'name' =>  'FundEngine',
                'url'  => 'https://wordpress.org/plugins/wp-fundraising-donation/',
                'icon' => 'https://ps.w.org/wp-fundraising-donation/assets/icon-256x256.png?rev=2544150',
                'desc' => 'Create fundraising, crowdfunding, and donation websites with PayPal and Stripe payment gateway integration.',
                
                'docs' => 'https://wpmet.com/doc/fundengine/',
            ],
            'blocks-for-shopengine/shopengine-gutenberg-addon.php' => [
                'name' => 'Blocks for ShopEngine',
                'url'  => 'https://wordpress.org/plugins/blocks-for-shopengine/',
                'icon' => 'https://ps.w.org/blocks-for-shopengine/assets/icon-256x256.gif?rev=2702483',
                'desc' => 'All in one WooCommerce solution for Gutenberg! Build your WooCommerce pages in a block editor with full customization.',
                'docs' => 'https://wpmet.com/doc/shopengine/shopengine-gutenberg/',
            ],
            'genie-image-ai/genie-image-ai.php' => [
                'name' => 'Genie Image',
                'url'  => 'https://wordpress.org/plugins/genie-image-ai/',
                'icon' => 'https://ps.w.org/genie-image-ai/assets/icon-256x256.png?rev=2977297',
                'desc' => 'AI-powered text-to-image generator for WordPress with OpenAI’s DALL-E 2 technology to generate high-quality images in one click.',
                'docs' => 'https://getgenie.ai/docs/',
            ],
            
        ]
        )
        ->call();
       
        $is_pro_active = '';

        if (!in_array('emailkit-pro/emailkit-pro.php', apply_filters('active_plugins', get_option('active_plugins')))) {
            $is_pro_active = 'Go Premium';
        }

        $pro_awareness = ProAwareness::instance('emailkit');
        $pro_awareness
            ->set_parent_menu_slug('emailkit-menu')
            ->set_pro_link(
                (in_array('emailkit-pro/emailkit-pro.php', apply_filters('active_plugins', get_option('active_plugins')))) ? '' :
                    'https://wpmet.com/emailkit-pricing'
            )
            ->set_plugin_file('emailkit/EmailKit.php')
            ->set_default_grid_thumbnail(EMAILKIT_URL . '/Promotional/ProAwareness/assets/images/support.png')
            ->set_page_grid([
                'url' => 'https://wpmet.com/fb-group',
                'title' => 'Join the Community',
                'thumbnail' => EMAILKIT_URL . '/Promotional/ProAwareness/assets/images/community.png',
                'description' => 'Join our Facebook group to get 20% discount coupon on premium products. Follow us to get more exciting offers.'

            ])
            ->set_page_grid([
                'url' => 'https://www.youtube.com/watch?v=Fz_1M-s_Faw&list=PL3t2OjZ6gY8O0ul4d9KROcQMyoSaTad6N',
                'title' =>'Video Tutorials',
                'thumbnail' => EMAILKIT_URL . '/Promotional/ProAwareness/assets/images/videos.png',
                'description' => 'Learn the step by step process for developing your site easily from video tutorials.'
            ])
            ->set_page_grid([
                'url' => 'https://wpmet.com/plugin/emailkit/roadmaps#ideas',
                'title' =>'Request a feature',
                'thumbnail' => EMAILKIT_URL . '/Promotional/ProAwareness/assets/images/request.png',
                'description' => 'Have any special feature in mind? Let us know through the feature request.'
            ])
            ->set_page_grid([
                    'url'       => 'https://wpmet.com/doc/emailkit/',
                    'title'     =>  'Documentation',
                    'thumbnail' => EMAILKIT_URL . '/Promotional/ProAwareness/assets/images/documentation.png',
                    'description' => 'Detailed documentation to help you understand the functionality of each feature.'
            ])
            ->set_page_grid([
                    'url'       => 'https://wpmet.com/plugin/emailkit/roadmaps/',
                    'title'     => 'Public Roadmap',
                    'thumbnail' => EMAILKIT_URL . '/Promotional/ProAwareness/assets/images/roadmaps.png',
                    'description' => 'Check our upcoming new features, detailed development stories and tasks'
            ])

            ->set_plugin_row_meta('Documentation', 'https://help.wpmet.com/docs-cat/emailkit/', ['target' => '_blank'])
            ->set_plugin_row_meta('Facebook Community', 'https://wpmet.com/fb-group', ['target' => '_blank'])
            ->set_plugin_row_meta('Rate the plugin ★★★★★', 'https://wordpress.org/support/plugin/emailkit/reviews/#new-post', ['target' => '_blank'])
            ->set_plugin_action_link('Settings', admin_url() . 'admin.php?page=emailkit-menu-settings')
            ->set_plugin_action_link($is_pro_active, 'https://wpmet.com/plugin/emailkit/pricing/', ['target' => '_blank', 'style' => 'color: #FCB214; font-weight: bold;'])
            ->call();
            
            if( ! $this->already_onboarded_other() ){

                Onboard::instance()->init();

                if(isset($_GET['emailkit-onboard-steps']) && isset($_GET['emailkit-onboard-steps-nonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['emailkit-onboard-steps-nonce'])),'emailkit-onboard-steps-action')) {
                    Attr::instance();                    
                }
            }
            
            add_action('emailkit-settings', function(){

                if( ! $this->already_onboarded_other() ){
                
                    if(isset($_GET['emailkit-onboard-steps']) && $_GET['emailkit-onboard-steps'] == 'loaded' && isset($_GET['emailkit-onboard-steps-nonce'])  && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['emailkit-onboard-steps-nonce'])),'emailkit-onboard-steps-action')) {
                        wp_enqueue_style( 'emailkit-steps-css-steps' ); // needed when onboardning
                        Onboard::instance()->views();
                        return; // Exit early during onboarding to prevent showing ProConsent form
                    }
                }

                // Only show ProConsent form when not in onboarding mode
                (new \EmailKit\Promotional\ProConsent())->get_consent_form();
            }
        );
    }

    /**
     * Check if user already onboarded for any of the plugins (elements_kit, met_form or shopengine).
     * 
     * @return bool
     * 
     * @since 1.5.4
     */
    public function already_onboarded_other() {

        return get_option( 'elements_kit_onboard_status' ) == 'onboarded' || get_option( 'met_form_onboard_status' ) == 'onboarded' || get_option( 'shopengine_onboard_status' ) == '1';
    }

}