<?php
namespace MetForm\Core\Admin;

use MetForm\Core\Integrations\Onboard\Onboard;
use MetForm_Pro\Base\Package;
use MetForm\Utils\Util;

defined( 'ABSPATH' ) || exit;

/**
 * Metform settings related all functionalities.
 *
 * @version 1.1.8
 */
class Base {
    use \MetForm\Traits\Singleton;
    private $key_settings_option;

    public function __construct(){
        $this->key_settings_option = 'metform_option__settings';
    }

    public static function parent_slug(){
        return 'metform-menu';
    }

    public function init(){
        add_action('admin_menu', [$this, 'register_settings'], 999);
        add_action('admin_init', [$this, 'register_actions'], 999);
        add_action('wp_ajax_metform_admin_settings', [$this, 'mf_setting_data_save']);
    }

    /**
     * Save settings data via ajax.
     * 
     * @since 3.9.9
     * @return void
     */
    public function mf_setting_data_save(){
        
        if ( ! current_user_can( 'manage_options' ) || ! isset( $_SERVER['HTTP_X_WP_NONCE'] ) || ! wp_verify_nonce( $_SERVER['HTTP_X_WP_NONCE'], 'wp_rest' ) ) {
            
            wp_send_json_error('You are not allowed to do this.');
            wp_die();
        }

        $request = isset($_POST['form_data']) ? $_POST['form_data'] : [];
        $fields_in_form = isset($_POST['fields_in_form']) ? $_POST['fields_in_form'] : [];

        if (empty($request)) {
            wp_send_json_error('No data provided');
            wp_die();
        }

        //get existing settings
        $settings = get_option($this->key_settings_option, []);

        $checkboxes = array('mf_save_progress', 'mf_field_name_show', 'mf_paypal_sandbox', 'mf_enable_entry_file_delete', 'mf_stripe_sandbox', 'mf_enable_form_analytics');

        //if checkbox is in the submitted form but not set, unset it from settings that was set previously.
        foreach ($checkboxes as $key) {
            if (in_array($key, $fields_in_form) && !isset($request[$key])) {
                if ($key === 'mf_enable_form_analytics') {
                    $request[$key] = '0';
                    continue;
                }

                if (isset($settings[$key])) {
                    unset($settings[$key]);
                }
            }
        }

        $settings = is_array($request) ? array_merge($settings, $request) : $settings;
        $status = \MetForm\Core\Forms\Action::instance()->store( -1, $settings);
        
        wp_send_json_success($status);
        exit;
    }

    public function register_settings(){
        add_submenu_page( self::parent_slug(), esc_html__( 'Settings', 'metform' ), esc_html__( 'Settings', 'metform' ), 'manage_options', self::parent_slug().'-settings', [$this, 'register_settings_contents__settings'], 11);
    }

    public function register_settings_contents__settings(){
        
        if(isset($_GET['met-onboard-steps']) && $_GET['met-onboard-steps'] == 'loaded' && isset($_GET['met-onboard-steps-nonce'])  && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['met-onboard-steps-nonce'])),'met-onboard-steps-action')) {
            Onboard::instance()->views();
        } else {
            $code = '';
            $disabledAttr = '';
            $selectTheTab= false;

            if(did_action('xpd_metform_pro/plugin_loaded')) {
                #Must be pro loaded....

                if(!empty($_REQUEST['access_token']) && !empty($_REQUEST['refresh_token']) && !empty($_REQUEST['not_hubspot'])) {
                    

                    $code   = isset($_REQUEST['code']) ? sanitize_text_field(wp_unslash($_REQUEST['code'])) : '';
                    $nonce  = isset($_REQUEST['state']) ? sanitize_text_field(wp_unslash($_REQUEST['state'])): '';
                    $option = get_option(\MetForm_Pro\Core\Integrations\Aweber::NONCE_VERIFICATION_KEY);

                    $accessToken                    =   [];
                    $accessToken['retrieved']       =   time();
                    $accessToken['token_type']      =   isset($_REQUEST['token_type'])? sanitize_text_field( wp_unslash( $_REQUEST['token_type'] )) : '';
                    $accessToken['expires_in']      =   isset($_REQUEST['expires_in'])? sanitize_text_field( wp_unslash( $_REQUEST['expires_in'] )) : '';
                    $accessToken['refresh_token']   =   isset($_REQUEST['refresh_token'])? sanitize_text_field( wp_unslash( $_REQUEST['refresh_token'] )) : '';
                    $accessToken['access_token']    =   isset($_REQUEST['access_token'])? sanitize_text_field( wp_unslash( $_REQUEST['access_token'] )) : '';
    
    
                    set_transient('mf_aweber_token_transient',  $accessToken['access_token'], $accessToken['expires_in'] - 20 );
                    update_option(\MetForm_Pro\Core\Integrations\Aweber::ACCESS_TOKEN_KEY, $accessToken);
                    ?>

                    <script type="text/javascript">
                        // redirect to newsletter section
                        location.href = '<?php echo esc_url(admin_url('admin.php?page=metform-menu-settings#mf-newsletter_integration')); ?>';
                    </script>

                    <?php

                    $option = get_option(\MetForm_Pro\Core\Integrations\Aweber::ACCESS_TOKEN_KEY);

                    
                    if($option) {
                        $code  = $option;
                    }

                    $disabledAttr = 'disabled';
                    $selectTheTab = true;

                } else {

                    $code = get_option(\MetForm_Pro\Core\Integrations\Aweber::ACCESS_TOKEN_KEY);

                    $disabledAttr = empty($code)? '': 'disabled';
                }
                if (class_exists(Package::class) && class_exists('\MetForm_Pro\Core\Integrations\Dropbox\Dropbox_Access_Token')  && (Util::is_mid_tier() || Util::is_top_tier())) {
                    /**
                     * Handle Dropbox disconnect request
                     */
                    if(!empty($_REQUEST['mf_dropbox_disconnect'])) {
                        delete_option('mf_dropbox_access_token');
                        delete_transient('mf_dropbox_token');
                        
                        ?>
                        <script type="text/javascript">
                            // redirect to general settings section
                            location.href = '<?php echo esc_url(admin_url('admin.php?page=metform-menu-settings#mf-general_options')); ?>';
                        </script>
                        <?php
                    }

                    /**
                     * Checks if the current request is from Dropbox OAuth callback
                     * 
                     * Validates that the request contains a 'code' parameter (Dropbox authorization code),
                     * does not have a 'state' parameter, does not have a 'scope' parameter set,
                     * and the scope does not contain 'googleapis' (to distinguish from Google OAuth)
                     * 
                     * @var bool $is_dropbox True if request appears to be from Dropbox OAuth flow, false otherwise
                     */
                    $is_dropbox = !empty($_REQUEST['code']) && empty($_REQUEST['state']) && (!isset($_REQUEST['scope']) || strpos($_REQUEST['scope'], 'googleapis') === false);  
                    if($is_dropbox ){
                        $dropbox = new \MetForm_Pro\Core\Integrations\Dropbox\Dropbox_Access_Token;
                        $access_code = $dropbox->get_access_token();
                        
                        if(isset($access_code['body'])){
                            // Save access token and set transient
                            $expire_time = isset(json_decode($access_code['body'], true)['expires_in'] ) ? json_decode($access_code['body'], true)['expires_in'] : '';
                            update_option( 'mf_dropbox_access_token', $access_code['body'] );
                            set_transient( 'mf_dropbox_token', $access_code['body'] , $expire_time - 20 );
                            
                            ?>
                            <script type="text/javascript">
                                // redirect to general settings section
                                location.href = '<?php echo esc_url(admin_url('admin.php?page=metform-menu-settings#mf-general_options')); ?>';
                            </script>
                            <?php
                        }
                    }
                }
                if(!empty($_REQUEST['mf_google_disconnect'])) {
                    delete_option('wf_google_access_token');
                    delete_transient('mf_google_sheet_token');
                    
                    ?>
                    <script type="text/javascript">
                        // redirect to google sheet integration section
                        location.href = '<?php echo esc_url(admin_url('admin.php?page=metform-menu-settings#mf-google_sheet_integration')); ?>';
                    </script>
                    <?php
                }
                if( !empty($_REQUEST['code']) && empty($_REQUEST['state']) ) {
                    $google = new \MetForm_Pro\Core\Integrations\Google_Sheet\Google_Access_Token;
                    $access_code = $google->get_access_token();
                    
                    if(isset($access_code['body'])){
                        $expire_time = isset(json_decode($access_code['body'], true)['expires_in'] ) ? json_decode($access_code['body'], true)['expires_in'] : '';
                        update_option( 'wf_google_access_token', $access_code['body'] );
                        set_transient( 'mf_google_sheet_token', $access_code['body'] , $expire_time - 20 );
                    }
                }
            }
            
            #Let check if this is returned from aweber..
            #Give state check

            include( 'views/settings.php' );
        }
    }

    public function get_settings_option($key = null , $default = null){
        if($key != null){
            $this->key_settings_option = $key;
        }
        return get_option($this->key_settings_option);
    }

    public function set_option($key, $default = null){
    }

    public function register_actions(){

        if(isset( $_POST['mf_settings_page_action'])) {
            // run a quick security check
            if( !check_admin_referer('metform-settings-page', 'metform-settings-page')){
                return;
            }
            $request = $_POST;

            $status = \MetForm\Core\Forms\Action::instance()->store( -1, $request);

            return $status;

        }
    }
}
