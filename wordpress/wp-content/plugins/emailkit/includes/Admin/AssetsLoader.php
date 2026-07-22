<?php

namespace EmailKit\Admin;

defined( 'ABSPATH' ) || exit;

class AssetsLoader
{

    public function __construct()
    {
       
		add_action('init', function () {
			add_action('admin_enqueue_scripts', [$this, 'addEnqueue']);
		});
    }
    
    public function addEnqueue($screen){
        
        if('edit-emailkit' === get_current_screen()->id){
            
        
            
            do_action('before_emailkit_asset_load', $screen);
            wp_enqueue_script("emailkit-admin-status-js" , EMAILKIT_URL . 'assets/admin/js/Status.js' , ['jquery'], EMAILKIT_VERSION, true);
            wp_enqueue_style('emailkit-admin-status-style', EMAILKIT_URL . 'assets/admin/css/status.css', [], EMAILKIT_VERSION);

            wp_enqueue_style('emailkit-admin-popup-style', EMAILKIT_URL . 'assets/admin/css/popup.css', [], EMAILKIT_VERSION);
            wp_enqueue_script("emailkit-admin-popup-js" , EMAILKIT_URL . 'assets/admin/js/popup.js' , ['jquery'], EMAILKIT_VERSION, true);
           
            wp_enqueue_style('emailkit-ui-style', EMAILKIT_URL . 'assets/admin/css/ui.min.css', [], EMAILKIT_VERSION);
            wp_enqueue_script("emailkit-ui-js" , EMAILKIT_URL . 'assets/admin/js/ui.min.js' , [], EMAILKIT_VERSION, true);

            wp_enqueue_style('emailkit-admin-select2-style', EMAILKIT_URL . 'assets/admin/css/select2.min.css', [], EMAILKIT_VERSION);
            class_exists('WFP_Fundraising') && wp_dequeue_script( 'select2' ); //fixed select2 conflict with fundraising plugin
            wp_enqueue_script("emailkit-admin-select2-js" , EMAILKIT_URL . 'assets/admin/js/select2.min.js' , ['jquery'], EMAILKIT_VERSION, true);
            // Pro Popup
            wp_enqueue_style('emailkit-admin-pro-popup', EMAILKIT_URL . 'assets/admin/css/pro-popup.css', [], EMAILKIT_VERSION);
            $is_emailkit_pro_active = is_plugin_active('emailkit-pro/emailkit-pro.php');
            wp_localize_script( 'emailkit-admin-popup-js', 'emailkit',
                array( 
                    'ajaxurl' => admin_url( 'admin-ajax.php' ),
                    'nonce' => wp_create_nonce('emailkit_nonce'),
                    'emailkit_pro_status' => ($is_emailkit_pro_active ? true : false),
                    'rest_url' => esc_url(get_rest_url(null, 'emailkit/v1/')),
                    'rest_nonce' => wp_create_nonce('wp_rest')
                )
            );
            do_action('after_emailkit_asset_load', $screen);

        }
    }

}
