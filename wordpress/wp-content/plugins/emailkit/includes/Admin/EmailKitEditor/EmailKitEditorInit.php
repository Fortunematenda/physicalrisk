<?php
namespace EmailKit\Admin\EmailKitEditor;

use EmailKit\Admin\MetaField\StyleLoad;

defined('ABSPATH') || exit('No direct script access allowed!');

/**
 * EmailKitEditorInit
 *
 * @since 1.0.0
 */

class EmailKitEditorInit
{

    public function __construct()
    {
        if(!current_user_can( 'manage_options' )){
            return;
        }

        $post_id = isset($_GET['post']) ? sanitize_text_field(wp_unslash($_GET['post'])) : ''; //phpcs:ignore WordPress.Security.NonceVerification -- Nonce can't be added in CPT edit page URL
        $action  = isset($_GET['action']) ? sanitize_text_field(wp_unslash($_GET['action'])) : ''; //phpcs:ignore WordPress.Security.NonceVerification -- Nonce can't be added in CPT edit page URL
        $post_type = get_post_type($post_id);

        if (empty($post_id) || $action != 'emailkit-builder' || $post_type != 'emailkit') {
            return;
        }
        add_action('init', function () use($post_id) {
            $dep = \EmailKit\Admin\Dependency::check(get_post_meta($post_id,'emailkit_email_type', true));
          
            if(true !== $dep){
                wp_die("Need to " . esc_html($dep['label']??'') . "<a href='" . esc_url($dep['url']??'') . "'>  Check here </a>", 'Need to activate plugin');
            }
        });

        new StyleLoad();
        add_action('wp_loaded', [$this, 'add_editor_template']);
    }

    
    public function add_editor_template()
    {

        if(is_plugin_active('uafrica-shipping/uafrica-shipping.php') || ( get_template() == 'entry' )){
         // Check if WooCommerce is active and initialize session if needed
            if (class_exists('WooCommerce') && function_exists('WC')) {
                if (is_null(WC()->session) && !headers_sent()) {
                    WC()->session = new \WC_Session_Handler();
                    WC()->session->init();
                }
            }
        }
        ?>
        <!DOCTYPE html>
        <html>
        <head>
        <?php wp_head(); ?>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <meta name="next-head-count" content="2" />
        </head>

        <body class="<?php
            // Temporarily remove all body_class filters so third-party plugins that call
            // admin-only functions (e.g. get_current_screen) cannot cause fatal errors
            // in this custom editor context. WordPress core classes are still applied.
            global $wp_filter;
            $saved_body_class_filter = isset( $wp_filter['body_class'] ) ? clone $wp_filter['body_class'] : null;
            remove_all_filters( 'body_class' );
            body_class( [ 'post-' . get_the_ID() ] );
            if ( $saved_body_class_filter !== null ) {
                $wp_filter['body_class'] = $saved_body_class_filter;
            }
        ?>">

        <?php 
            require_once EMAILKIT_PATH . '/dist/editor.php'; 
            wp_footer();
            ?>

        </body>
        </html>
        <?php
        exit();
    }
}
