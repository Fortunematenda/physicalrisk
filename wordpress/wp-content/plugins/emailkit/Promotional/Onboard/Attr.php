<?php 
namespace EmailKit\Promotional\Onboard;

use EmailKit\Promotional\Onboard\Classes\Utils;
use EmailKit\Plugin;
use EmailKit\Traits\Singleton;

defined( 'ABSPATH' ) || exit;

class Attr{

    use Singleton;
    
    public $utils;

    public static function get_dir(){
        return EMAILKIT_DIR . "Promotional/Onboard/";
    }

    public static function get_url(){
        return EMAILKIT_URL. 'Promotional/Onboard/';
    }

    public function __construct() {

        $this->utils = Utils::instance();

        add_action( 'admin_enqueue_scripts', [$this, 'enqueue_scripts'] );
    }

    public function enqueue_scripts() {

        wp_register_style( 'emailkit-onboard-icon', self::get_url() . 'assets/css/onboard-icon.css' );
        wp_register_style( 'emailkit-init-css-admin', self::get_url() . 'assets/css/admin-style.css' );
        wp_register_style( 'emailkit-steps-css-steps', self::get_url() . 'assets/css/steps-style.css' );
        
        wp_enqueue_style( 'emailkit-onboard-icon' );

        wp_enqueue_style( 'emailkit-init-css-admin' );

        wp_enqueue_script( 'emailkit-admin-core', self::get_url() . 'assets/js/emailkit-onboard.js', ['jquery'], '', true );

        $data['rest_url']   = get_rest_url();
	    $data['nonce']      = wp_create_nonce('wp_rest');

	    wp_localize_script('emailkit-admin-core', 'rest_config', $data);

        wp_localize_script('emailkit-admin-core', 'mf_ajax_var', array(
            'nonce' => wp_create_nonce('ajax-nonce'),
            'plugin_redirect_url' => admin_url('edit.php?post_type=emailkit', '') ,
        ));
    }
}
