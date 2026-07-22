<?php

namespace GenieAi\App\ProLabel;

use GenieAi\App\ProLabel\GenieBanner;
use GenieAi\App\ProLabel\GenieNotice;
use GenieAi\App\ProLabel\GenieRating;

class ProLabelInit
{
    private $filterString = '';

    public function __construct()
    {
        add_action('wp_loaded', function () {

            $this->filterString = self::active_plugins();
            \GenieAi\App\ProLabel\GenieNotice::init();

            // $this->initStories();
            if($this->is_user_consent_yes()){
                $this->initBanner();
                $this->initRating();
            }
        });
    }

    /**
     * Check if user consent is yes
     * 
     * @return boolean
     */
    public function is_user_consent_yes(){

        $admin_config = get_option('getgenie_admin_dashboard_config', []);

        if( !get_option('getgenie_site_token', false) || !isset($admin_config['user_consent']) ){
            return true;
        }

        return isset($admin_config['user_consent']) && $admin_config['user_consent'] == '1';
    }


    public static function active_plugins()
    {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
        $apl           = get_option('active_plugins');
        $plugins       = get_plugins();
        $filter_string = '';
        foreach ($apl as $p) {
            if (isset($plugins[$p]) && isset($plugins[$p]['TextDomain'])) {
                $filter_string .= ',' . $plugins[$p]['TextDomain'];
            }
        }
        return ltrim($filter_string, ',');
    }

    private function initBanner()
    {
        /**
         * Show Genie banner (codename: jhanda)
         */
        $slug = 'getgenie';
        $subscriptionStatistics = get_option('getgenie_subscription_statistics', []);
        if (
            isset($subscriptionStatistics['subscription_type'])
            && $subscriptionStatistics['subscription_type'] == 'pro'
        ) {
            $slug = 'getgenie-pro';
        }

        GenieBanner::instance($slug)
            // ->is_test(true)
            ->set_filter($this->filterString)
            ->set_api_url('https://api.wpmet.com/public/jhanda')
            ->set_plugin_screens('toplevel_page_getgenie')
            ->call();

        // show notice if getgenie license is not activated.
        if (!get_option('getgenie_site_token')) {

            $banner_msg = "Just one step left! Click below and activate your license to start unlocking GetGenie's full potential instantly.";
            
            //if after 24 hours of plugin activation the message will be changed.
            $activation_time = get_option('getgenie_install_date', false);
            if($activation_time) {
                $activation_timestamp = strtotime($activation_time);
                if($activation_timestamp !== false && (time() - $activation_timestamp) > (3600 * 24)){
                    $banner_msg = "Struggling with writer's block or spending hours on drafts?&nbsp;<a href='https://getgenie.ai/' target='_blank'>GetGenie</a>&nbsp;helps you plan, write, and optimize content in minutes, all inside WordPress.";
                }
            }

            GenieNotice::instance('getgenie', 'go-pro-noti2ce')                                       # @plugin_slug @notice_name
                ->set_dismiss('global', (3600 * 24 * 300))                                          # @global/user @time_period
                ->set_type('warning')                                                                 # @notice_type
                ->set_plugin_screens(array('toplevel_page_getgenie', 'dashboard'))                   # @restrict_to_getgenie_and_dashboard_pages
                ->set_force_show_on_screens(true)                                                    # @always_show_on_getgenie_page_regardless_of_dismissal
                ->set_html(
                    "
                        <div class='getgenie-notice'>
                            <p class='notice-message'>
                                <img src='" . GETGENIE_URL . "/assets/dist/admin/images/genie-head.svg" . "' class='notice-icon' />
                                ".$banner_msg."
                            </p>
                            <div class='notice-link'>
                                <a href='https://app.getgenie.ai/license/?product=free-trial' target='_blank'>Claim Your Free License</a>
                                <a href='" . admin_url('admin.php?page=' .  GETGENIE_TEXTDOMAIN) . "#license'>Finish License Activation</a>
                            </div>
                        </div>
                        "
                )                                                                                     # @notice_massage_html
                ->call();
        }
    }

    private function initRating()
    {
        /**
         * Show GenieAi rating (codename: rating)
         */
        GenieRating::instance('getgenie')
            ->set_plugin('GetGenie', 'https://wordpress.org/support/plugin/getgenie/reviews/')
            ->set_plugin_logo('https://ps.w.org/getgenie/assets/icon-256x256.gif?rev=2798355', 'width:150px !important')
            ->set_allowed_screens('toplevel_page_getgenie')
            ->set_priority(10)
            ->set_first_appear_day(7)
            ->set_condition(true)
            ->call();
    }
}
