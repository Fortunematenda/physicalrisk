<?php

/**
 * Plugin Name: EmailKit
 * Plugin URI:  https://wpmet.com/plugin/emailkit/
 * Description: EmailKit is the most-complete drag-and-drop Email template builder.
 * Author: wpmet
 * Author URI: https://wpmet.com
 * Version: 1.6.7
 * Text Domain: emailkit
 * License:  GPLv3
 * License URI: https://www.gnu.org/licenses/gpl-3.0.txt
 */
if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/traits/singleton.php';

/**
 * The main plugin class
 */
final class EmailKit
{

    /**
     * Plugin version
     *
     * @var string
     */

    /**
     * Class constructor
     */
    private function __construct()
    {
        $this->define_constants();
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this,'deactivate_emailkit']);

        add_action('plugins_loaded', [$this, 'init_plugin'], 112);
        add_action( 'admin_enqueue_scripts',[$this, 'emailkit_global_assets'] );
    }

    /**
     * Initializes a singleton instance
     *
     * @return \EmailKit
     */
    public static function init()
    {

        static $instance = false;

        if (!$instance) {
            $instance = new self();
        }

        return $instance;
    }


    /**
     * Define the required plugin constants
     *
     * @return void
     */
    public function define_constants()
    {
        define('EMAILKIT_VERSION', '1.6.7');
        define('EMAILKIT_TEXTDOMAIN', 'emailkit');
        define('EMAILKIT_FILE', __FILE__);
        define('EMAILKIT_PATH', __DIR__);
        define('EMAILKIT_URL', trailingslashit(plugin_dir_url(EMAILKIT_FILE)));
        define('EMAILKIT_DIR', trailingslashit(plugin_dir_path(__FILE__)));
        define('EMAILKIT_INC', EMAILKIT_URL . 'includes/');
        define('EMAILKIT_ADMIN', EMAILKIT_INC . 'Admin/');
        define('EMAILKIT_ASSETS', EMAILKIT_URL . 'assets');
        define('EMAILKIT_CONFIG', []);
    }


    /**
     * Initialize the plugin
     *
     * @return void
     */
    public function init_plugin()
    {
        do_action('emailkit/before_loaded');

        new EmailKit\Admin();
        (new EmailKit\Promotional\Promotional())->init();

        do_action('emailkit/after_loaded');
    }

    public function emailkit_global_assets()
    {
        wp_enqueue_style('emailkit-admin-style', EMAILKIT_URL . 'assets/admin/css/emailkit-global.css', [], EMAILKIT_VERSION);
    }

    /**
     * Do stuff upon plugin activation
     */
    public function activate()
    {
        /**
         * Save plugin installation time.
         */

        $installed = get_option('emailkit_installed');
        if (!$installed) {
            update_option('emailkit_installed', time());
        }

        /**
         * Update plugin version.
         * 
         * @param string $option
         */
        update_option('emailkit_version', EMAILKIT_VERSION);
       
        // After Active Plugin CPT menu for EmailKit
        $cpt = new EmailKit\Admin\CPT();
        $cpt->postType();
        $cpt->add_role();
    
        flush_rewrite_rules();
       
    }

    // Deactivate plugin  
    function deactivate_emailkit() {
    }

   
}
/**.
 * Initializes the main plugin
 *
 * @return \EmailKit
 */

EmailKit::init();
