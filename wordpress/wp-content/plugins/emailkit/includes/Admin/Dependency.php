<?php
namespace EmailKit\Admin;

use EmailKit;

defined("ABSPATH") || exit;

class Dependency {

    const INACTIVE = 'inactive';
    const ACTIVE = 'active';
    const NEED_INSTALL = 'install';


    public static function check(string $plugin) {

        
        $dependency = self::dependency_list($plugin);
        if($dependency){
            if(!empty($dependency['status']) && $dependency['status'] == self::INACTIVE) {
                return $dependency['active'];
            } else if(!empty($dependency['status']) && $dependency['status'] == self::NEED_INSTALL) {
                return $dependency['install'];
            }
        }
       
        return true;
    }


    public static function dependency_list(string $dependency = ''): array {


        if(!function_exists('is_plugin_active')){
              // Include necessary WordPress files
          require_once ABSPATH . 'wp-admin/includes/plugin.php';

        }

        $dependency_list = [
            'wordpress' => [
                'status' => self::ACTIVE, // by default wordpress is active
                'install' => [
                    'label' => '',
                    'url' => '',
                ],
                'active' => [
                    'label' => '',
                    'url' => '',
                ]
            ],
            'saved-templates' => [
                'status' => self::ACTIVE, // save templates have dependency
                'install' => [
                    'label' => '',
                    'url' => '',
                ],
                'active' => [
                    'label' => '',
                    'url' => '',
                ]
            ],
            'woocommerce' => [
                'status' => (file_exists(WP_PLUGIN_DIR.'/woocommerce/woocommerce.php') ? (is_plugin_active('woocommerce/woocommerce.php') == false ? self::INACTIVE : self::ACTIVE) : self::NEED_INSTALL),
                'install' => [
                    'label' => esc_html__('Install WooCommerce', 'emailkit'),
                    // 'url' => wp_nonce_url(self_admin_url('update.php?action=install-plugin&plugin=woocommerce'), 'install-plugin_woocommerce'),
                    'url' => self_admin_url('plugin-install.php?s=woocommerce&tab=search&type=term'),
                ],
                'active' => [
                    'label' => esc_html__('Activate WooCommerce', 'emailkit'),
                    'url' => ('plugins.php?plugin=woocommerce'),
                ]
            ],
            'metform' => [
                'status' => (file_exists(WP_PLUGIN_DIR.'/metform/metform.php') ? (is_plugin_active('metform/metform.php') == false ? self::INACTIVE : self::ACTIVE) : self::NEED_INSTALL),
                'install' => [
                    'label' => esc_html__('Install Metform', 'emailkit'),
                    'url' => self_admin_url('plugin-install.php?s=metform&tab=search&type=term'),
                ],
                'active' => [
                    'label' => esc_html__('Activate Metform', 'emailkit'),
                    'url' => ('plugins.php?plugin=metform'),
                ]
            ],
        ];

        return $dependency_list[$dependency] ?? [];
    }
}