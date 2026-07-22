<?php 

namespace EmailKit;

defined('ABSPATH') || exit;

use EmailKit\Admin as EmailKitAdmin;

/**
 * The admin class
 */
class Admin
{


    /**
     * Initialize the class
     */
    public function __construct()
    {
      $this->load_emailkit(); // Load emailkit classes
      $this->run_apis(); // Run api classes
      $this->run_wc_mails(); // Check if WooCommerce is active then run run wocommerce class
      $this->run_wp_mails(); // Run wordpress emails class
      add_action('admin_menu', [$this, 'admin_menu']);// Register main admin menu
      add_action('admin_menu', [$this, 'register_settings'], 999); //register settings submenu

    }

    protected function load_emailkit(){
      
      new Admin\CPT();
      new Admin\AssetsLoader();
      new Admin\AssetConflictManager();
      new Admin\EmailKitAjax();
      new Admin\EmailKitHooks();
      new Admin\Hooks();
      new Admin\MetaBox();
      new Admin\EmailKitEditor\EmailKitEditorInit();
      new \EmailKit\Promotional\Onboard\Classes\Ajax();
  
    $metform_version = class_exists( '\MetForm\Plugin' ) ? \MetForm\Plugin::instance()->version() : '0.0.0';
    
    if ( did_action( 'metform/after_load' ) && version_compare( $metform_version, '4.0.0', '>=' ) ) {

      new Admin\EmailSettings\MetformEmailSettings();
      new Admin\EmailSettings\MetformShortcodes();
    }
      
      return true;
    }

    /**
     * Check if the woocommerce plugin is active run woocommerce class
     *
     * @return boolean
     */
     protected function run_wc_mails(){
      
      if(!function_exists('is_plugin_active')){
        // Include necessary WordPress files
        require_once ABSPATH . 'wp-admin/includes/plugin.php';

      }

      if(is_plugin_active('woocommerce/woocommerce.php')){
        

        new Admin\Emails\Woocommerce\NewOrder();
        new Admin\Emails\Woocommerce\ProcessingOrder();
        new Admin\Emails\Woocommerce\CancelledOrder();
        new Admin\Emails\Woocommerce\FailedOrder();
        new Admin\Emails\Woocommerce\FailedOrderCustomer();
        new Admin\Emails\Woocommerce\OrderOnHold();
        new Admin\Emails\Woocommerce\CompletedOrder();
        new Admin\Emails\Woocommerce\RefundOrder();
        new Admin\Emails\Woocommerce\CustomerNote();
        new Admin\Emails\Woocommerce\InvoiceOrder();
        new Admin\Emails\Woocommerce\ResetPassword();
        new Admin\Emails\Woocommerce\NewAccount();
        new Admin\Emails\Woocommerce\BackOrder();
        new Admin\Emails\Woocommerce\LowStock();
        new Admin\Emails\Woocommerce\NoStock();
        new Admin\Emails\Woocommerce\PartialRefund();
        new Admin\Emails\Woocommerce\PaymentGatewayEnabled();
        new Admin\EmailSettings\WcEmailSettings();
        
        return true;

      }

      return false;

    }
     protected function run_wp_mails(){
      
      //Wordpress Emails class 
      new Admin\Emails\WordPress\NewUserRegister();
      new Admin\Emails\WordPress\ResetAccount();
      return true;

    }


    /**
     * run api classes
     * @return boolean true
     */
    public static function run_apis()
    {

        new Admin\Api\TemplateData();
        new Admin\Api\FetchData();
        new Admin\Api\UpdateData();
        new Admin\Api\TestEmail();
        new Admin\Api\ShortCodeData();
        new Admin\Api\TemplateStatus();
        new Admin\Api\OrderItem();
        new Admin\Api\TemplateTypesData();
        new Admin\Api\CheckForm();
       
        return true;
     
    }

    function admin_menu()
    {
      if (current_user_can('manage_options')) {
        add_menu_page(
            esc_html__('EmailKit', 'emailkit'),
            esc_html__('EmailKit', 'emailkit'),
            'read',
            'emailkit-menu',
            '',
           'dashicons-email-alt',
            35
        );
      }
    }

      public function register_settings(){
        if (current_user_can('manage_options')) {
          
          add_submenu_page( 'emailkit-menu', esc_html__( 'Settings', 'emailkit' ), esc_html__( 'Settings', 'emailkit' ), 'manage_options', 'emailkit-menu-settings', [$this, 'register_settings_contents__settings'], 11);
        }
      }
  
      public function register_settings_contents__settings(){
        ?>
        <div class="wrap">
          <h1 class="wp-heading-inline"> EmailKit Settings </h1>
            <?php   do_action('emailkit-settings');  ?>
          <div class="clear"></div>
        </div>
        <?php
        
      }
}