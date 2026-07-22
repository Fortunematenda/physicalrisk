<?php

/**
 * Uninstall SwiftCurrency
 *
 * Handles plugin uninstallation and cleanup.
 *
 * @package SwiftCurrency
 * @since 1.0.2
 */

// Exit if accessed directly or not uninstalling.
if (! defined('WP_UNINSTALL_PLUGIN')) {
	exit;
}

function swiftcurrency_run_uninstall()
{
	$swiftcurrency_settings    = get_option('swiftcurrency_settings', array());
	$swiftcurrency_delete_data = ! empty($swiftcurrency_settings['advanced']['delete_on_uninstall']);

	if (! $swiftcurrency_delete_data) {
		return;
	}

	global $wpdb;

	delete_option('swiftcurrency_settings');
	delete_option('swiftcurrency_db_version');
	delete_option('swiftcurrency_last_rate_update');
	delete_option('swiftcurrency_last_crypto_rate_update');
	delete_option('swiftcurrency_custom_currencies');
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Uninstall cleanup must delete plugin transients directly; no WordPress API exists for bulk transient deletion by prefix.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
			'_transient_swiftcurrency_%',
			'_transient_timeout_swiftcurrency_%'
		)
	);

	$swiftcurrency_tables = array(
		$wpdb->prefix . 'swiftcurrency_rates',
		$wpdb->prefix . 'swiftcurrency_custom_prices',
		$wpdb->prefix . 'swiftcurrency_logs',
		$wpdb->prefix . 'swiftcurrency_rate_history',
	);

	foreach ($swiftcurrency_tables as $swiftcurrency_table) {
		$swiftcurrency_table = preg_replace('/[^A-Za-z0-9_]/', '', $swiftcurrency_table);

		if (empty($swiftcurrency_table)) {
			continue;
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange -- Uninstall cleanup must remove plugin-owned tables and no WordPress API exists for schema deletion.
		$wpdb->query('DROP TABLE IF EXISTS `' . esc_sql($swiftcurrency_table) . '`');
	}

	wp_clear_scheduled_hook('swiftcurrency_update_rates');
	wp_clear_scheduled_hook('swiftcurrency_update_crypto_rates');
	wp_clear_scheduled_hook('swiftcurrency_cleanup');
	wp_clear_scheduled_hook('swiftcurrency_verify_license');

	if (function_exists('wp_cache_flush')) {
		wp_cache_flush();
	}
}

swiftcurrency_run_uninstall();
