<?php

namespace PopupBuilderBlock\Hooks;

defined( 'ABSPATH' ) || exit;

use PopupBuilderBlock\Helpers\DataBase;

class DatabaseUpdater {
    /**
     * class constructor.
     *
     * @return void
     * @since 2.1.2
     */
    public function __construct() {
        add_action( 'admin_init', array( $this, 'on_admin_init' ) );
    }

    /**
     * Single admin_init entry point.
     *
     * Both routines run once per request behind their own early-return guards,
     * so they are dispatched from one hook to avoid registering multiple callbacks.
     *
     * @return void
     */
    public function on_admin_init() {
        $this->update_database();
        $this->maybe_set_installed_time();
    }

    /**
     * Backfill the install timestamp for users who installed before it was tracked.
     *
     * The activation hook only fires on (re)activation, so existing installs would
     * otherwise never get `popupkit_installed_time`. This runs once on admin_init
     * and estimates the install date from the oldest popup campaign, falling back
     * to the current time when no campaigns exist.
     *
     * @return void
     */
    public function maybe_set_installed_time() {
        if ( get_option( 'popupkit_installed_time' ) ) {
            return; // Already recorded (fresh install via activation hook, or previously backfilled).
        }

        $installed_time = time();

        $oldest = get_posts(
            array(
                'post_type'      => 'popupkit-campaigns',
                'post_status'    => 'any',
                'posts_per_page' => 1,
                'orderby'        => 'date',
                'order'          => 'ASC',
                'fields'         => 'ids',
                'no_found_rows'  => true,
            )
        );

        if ( ! empty( $oldest ) ) {
            $post_time = get_post_time( 'U', true, $oldest[0] );

            if ( $post_time ) {
                $installed_time = (int) $post_time;
            }
        }

        update_option( 'popupkit_installed_time', $installed_time );
    }

    /**
     * Update database if required
     *
     * @return void
     * @since 2.1.2
     */
    public function update_database() {
        $installed_version = get_option( DataBase::$DATABASE_KEY );
        $current_version   = DataBase::$DATABASE_VERSION;

        if ( $installed_version === $current_version ) {
            return; // Already up to date
        }

        // New table added in 1.1.0
        if ( version_compare( $installed_version, '1.1.0', '<' ) ) {
            DataBase::createABTestTables();

            // Update the version in the database
            update_option( DataBase::$DATABASE_KEY, $current_version );
        }
    }
}