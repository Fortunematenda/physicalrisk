<?php
// Exit if accessed directly
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

/**
 * Uninstall class for Popup Builder Block
 */
class PopupBuilderBlock_Uninstaller {
    
    /**
     * Run the uninstall process
     */
    public static function uninstall() {
        // Get the uninstall setting value
        $uninstall_data = get_option('pbb-settings-tabs', []);
        $uninstall = $uninstall_data['uninstall-data'] ?? [];

        // Check if 'status' is set to 'active'
        if (isset($uninstall['status']) && $uninstall['status'] === 'active') {
            self::delete_options();
            self::delete_tables();
            self::delete_transients();
            self::delete_usermeta();
            self::delete_post();
        }
    }

    /**
     * Delete plugin options
     */
    private static function delete_options() {
        global $wpdb;

        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->options}
                WHERE option_name LIKE %s
                    OR option_name LIKE %s
                    OR option_name LIKE %s",
                'popupkit%',
                'popup-builder-block%',
                'pbb%'
            )
        );
    }

    /**
     * Delete custom database tables
     */
    private static function delete_tables() {
        global $wpdb;

        $tables_to_delete = [
            $wpdb->prefix . 'pbb_log_browsers',
            $wpdb->prefix . 'pbb_log_countries',
            $wpdb->prefix . 'pbb_log_referrers',
            $wpdb->prefix . 'pbb_logs',
            $wpdb->prefix . 'pbb_subscribers',
            $wpdb->prefix . 'pbb_browsers',
            $wpdb->prefix . 'pbb_countries',
            $wpdb->prefix . 'pbb_referrers',
            $wpdb->prefix . 'pbb_ab_test_variants',
            $wpdb->prefix . 'pbb_ab_tests',
        ];

        foreach ($tables_to_delete as $table) {
            $wpdb->query( sprintf( 'DROP TABLE IF EXISTS `%s`', esc_sql( $table ) ) );
        }
    }

    /**
     * Delete transients
     */
    private static function delete_transients() {
        $transients_to_delete = [
            // some transients
        ];

        foreach ($transients_to_delete as $transient) {
            delete_transient($transient);
            delete_site_transient($transient); // For multisite
        }
    }

    /**
     * Delete usermeta
     */
    private static function delete_usermeta() {
        global $wpdb;

        $usermeta_keys_to_delete = [
            // some usermeta keys
        ];

        foreach ($usermeta_keys_to_delete as $meta_key) {
            $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->usermeta} WHERE meta_key = %s", $meta_key));
        }
    }

    /**
     * Delete posts
     */
    private static function delete_post() {
        global $wpdb;

        $post_ids = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s",
                'popupkit-campaigns'
            )
        );

        foreach ( $post_ids as $post_id ) {
            wp_delete_post( $post_id, true );
        }
    }
}

// Execute uninstall
PopupBuilderBlock_Uninstaller::uninstall();
