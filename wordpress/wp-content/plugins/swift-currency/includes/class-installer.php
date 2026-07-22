<?php

/**
 * Installer Class
 *
 * Handles plugin activation, deactivation, and uninstallation.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency;

// Exit if accessed directly.
if (! defined('ABSPATH')) {
	exit;
}

/**
 * Installer class.
 *
 * @class Installer
 * @version 1.0.0
 */
class Installer
{

	/**
	 * Plugin activation.
	 */
	public static function activate()
	{
		// Check WordPress version.
		if (version_compare(get_bloginfo('version'), '5.8', '<')) {
			deactivate_plugins(SWIFTCURRENCY_PLUGIN_BASENAME);
			wp_die(
				esc_html__('SwiftCurrency requires WordPress 5.8 or higher.', 'swift-currency'),
				esc_html__('Plugin Activation Error', 'swift-currency'),
				array('back_link' => true)
			);
		}

		// Check PHP version.
		if (version_compare(PHP_VERSION, '7.4', '<')) {
			deactivate_plugins(SWIFTCURRENCY_PLUGIN_BASENAME);
			wp_die(
				esc_html__('SwiftCurrency requires PHP 7.4 or higher.', 'swift-currency'),
				esc_html__('Plugin Activation Error', 'swift-currency'),
				array('back_link' => true)
			);
		}

		// WooCommerce is optional — no hard requirement on activation.

		// Create database tables.
		self::create_tables();

		// Set default options.
		self::set_default_options();

		// Schedule cron events.
		self::schedule_cron_events();

		// Set activation flag.
		set_transient('swiftcurrency_activated', true, 60);

		// Update database version.
		update_option('swiftcurrency_db_version', SWIFTCURRENCY_VERSION);

		/**
		 * Action hook fired after plugin activation.
		 *
		 * @since 1.0.0
		 */
		do_action('swiftcurrency_activated');
	}

	/**
	 * Plugin deactivation.
	 */
	public static function deactivate()
	{
		// Clear scheduled cron events.
		self::clear_cron_events();

		// Clear cache.
		self::clear_cache();

		/**
		 * Action hook fired after plugin deactivation.
		 *
		 * @since 1.0.0
		 */
		do_action('swiftcurrency_deactivated');
	}

	/**
	 * Create database tables.
	 */
	private static function create_tables()
	{
		global $wpdb;

		$charset_collate = $wpdb->get_charset_collate();
		$table_prefix    = $wpdb->prefix;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		// Exchange Rates Table.
		$sql_rates = "CREATE TABLE IF NOT EXISTS `{$table_prefix}swiftcurrency_rates` (
			`id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			`currency_code` varchar(3) NOT NULL COMMENT 'ISO 4217 currency code',
			`currency_name` varchar(100) NOT NULL COMMENT 'Full currency name',
			`exchange_rate` decimal(20,8) NOT NULL DEFAULT 1.00000000 COMMENT 'Exchange rate relative to base',
			`base_currency` varchar(3) NOT NULL DEFAULT 'USD' COMMENT 'Base currency for this rate',
			`provider` varchar(50) DEFAULT NULL COMMENT 'Rate provider',
			`is_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Currency enabled status',
			`last_updated` datetime DEFAULT NULL COMMENT 'Last rate update time',
			`created_at` datetime NOT NULL,
			`updated_at` datetime DEFAULT NULL,
			PRIMARY KEY (`id`),
			UNIQUE KEY `currency_code` (`currency_code`),
			KEY `base_currency` (`base_currency`),
			KEY `is_enabled` (`is_enabled`),
			KEY `last_updated` (`last_updated`),
			KEY `provider` (`provider`)
		) $charset_collate;";

		// Custom Product Pricing Table.
		$sql_prices = "CREATE TABLE IF NOT EXISTS `{$table_prefix}swiftcurrency_custom_prices` (
			`id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			`product_id` bigint(20) UNSIGNED NOT NULL COMMENT 'WooCommerce product ID',
			`variation_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Product variation ID',
			`currency_code` varchar(3) NOT NULL COMMENT 'Currency for this price',
			`regular_price` decimal(20,2) DEFAULT NULL COMMENT 'Custom regular price',
			`sale_price` decimal(20,2) DEFAULT NULL COMMENT 'Custom sale price',
			`price_type` varchar(20) NOT NULL DEFAULT 'fixed' COMMENT 'fixed or percentage',
			`created_at` datetime NOT NULL,
			`updated_at` datetime DEFAULT NULL,
			PRIMARY KEY (`id`),
			UNIQUE KEY `product_variation_currency` (`product_id`, `variation_id`, `currency_code`),
			KEY `product_id` (`product_id`),
			KEY `variation_id` (`variation_id`),
			KEY `currency_code` (`currency_code`)
		) $charset_collate;";

		// Activity Logs Table.
		$sql_logs = "CREATE TABLE IF NOT EXISTS `{$table_prefix}swiftcurrency_logs` (
			`id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			`log_type` varchar(50) NOT NULL COMMENT 'Type: conversion, api_call, error',
			`log_level` varchar(20) NOT NULL DEFAULT 'info' COMMENT 'Level: debug, info, warning, error',
			`message` text NOT NULL COMMENT 'Log message',
			`context` longtext DEFAULT NULL COMMENT 'Additional data in JSON',
			`user_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'User ID if applicable',
			`ip_address` varchar(45) DEFAULT NULL COMMENT 'IP address',
			`created_at` datetime NOT NULL,
			PRIMARY KEY (`id`),
			KEY `log_type` (`log_type`),
			KEY `log_level` (`log_level`),
			KEY `created_at` (`created_at`),
			KEY `user_id` (`user_id`)
		) $charset_collate;";

		// Rate History Table.
		$sql_history = "CREATE TABLE IF NOT EXISTS `{$table_prefix}swiftcurrency_rate_history` (
			`id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			`currency_code` varchar(3) NOT NULL,
			`base_currency` varchar(3) NOT NULL,
			`exchange_rate` decimal(20,8) NOT NULL,
			`provider` varchar(50) DEFAULT NULL,
			`created_at` datetime NOT NULL,
			PRIMARY KEY (`id`),
			KEY `currency_code` (`currency_code`),
			KEY `created_at` (`created_at`),
			KEY `composite_history` (`currency_code`, `base_currency`, `created_at`)
		) $charset_collate;";

		// Execute table creation.
		dbDelta($sql_rates);
		dbDelta($sql_prices);
		dbDelta($sql_logs);
		dbDelta($sql_history);
	}

	/**
	 * Set default options.
	 */
	private static function set_default_options()
	{
		// Check if settings already exist.
		if (get_option('swiftcurrency_settings')) {
			return;
		}

		$default_base = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';

		$default_settings = array(
			'version' => SWIFTCURRENCY_VERSION,
			'general' => array(
				'base_currency'        => $default_base,
				'enabled_currencies'   => array($default_base),
				'save_user_preference' => true,
			),
			'rates'   => array(
				'provider'          => 'ecb',
				'api_key'           => '',
				'fallback_provider' => 'manual',
				'auto_update'       => true,
				'update_interval'   => 'daily',
				'fallback_rates'    => array(),
			),
			'display' => array(
				'switcher_position'    => 'header',
				'switcher_style'       => 'dropdown',
				'show_flags'           => true,
				'show_currency_code'   => true,
				'show_currency_symbol' => true,
				'show_currency_name'   => false,
			),
			'pricing' => array(
				'rounding_mode'       => 'nearest',
				'decimal_places'      => 2,
				'enable_charm_pricing' => false,
				'charm_value'         => 0.99,
				'price_format'        => '{symbol}{amount}',
			),
			'geolocation' => array(
				'enabled'         => false,
				'provider'        => 'ip-api',
				'cache_duration'  => 86400,
				'fallback_currency' => $default_base,
				'require_consent' => true,
			),
			'advanced' => array(
				'enable_logging'     => false,
				'log_retention_days' => 30,
				'cache_enabled'      => true,
				'cache_duration'     => 3600,
				'delete_on_uninstall'=> false,
			),
		);

		update_option('swiftcurrency_settings', $default_settings);

		// Insert base currency into rates table.
		self::insert_base_currency();
	}

	/**
	 * Insert base currency into rates table.
	 */
	private static function insert_base_currency()
	{
		global $wpdb;

		$base_currency = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';
		$base_currency = empty($base_currency) ? 'USD' : $base_currency;
		$table_name    = $wpdb->prefix . 'swiftcurrency_rates';

		// Check if base currency already exists.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Installer check; result not worth caching.
		$exists = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$wpdb->prefix}swiftcurrency_rates WHERE currency_code = %s",
				$base_currency
			)
		);

		if (! $exists) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Direct insert required for installer setup.
			$wpdb->insert(
				$table_name,
				array(
					'currency_code' => $base_currency,
					'currency_name' => self::get_currency_name($base_currency),
					'exchange_rate' => 1.00000000,
					'base_currency' => $base_currency,
					'provider'      => 'manual',
					'is_enabled'    => 1,
					'last_updated'  => current_time('mysql'),
					'created_at'    => current_time('mysql'),
				),
				array('%s', '%s', '%f', '%s', '%s', '%d', '%s', '%s')
			);
		}
	}

	/**
	 * Get currency name from code.
	 *
	 * @param string $code Currency code.
	 * @return string Currency name.
	 */
	private static function get_currency_name($code)
	{
		$currencies = array(
			'USD' => 'US Dollar',
			'EUR' => 'Euro',
			'GBP' => 'British Pound',
			'JPY' => 'Japanese Yen',
			'AUD' => 'Australian Dollar',
			'CAD' => 'Canadian Dollar',
			'CHF' => 'Swiss Franc',
			'CNY' => 'Chinese Yuan',
			'INR' => 'Indian Rupee',
		);

		return isset($currencies[$code]) ? $currencies[$code] : $code;
	}

	/**
	 * Schedule cron events.
	 */
	private static function schedule_cron_events()
	{
		// Schedule rate updates.
		if (! wp_next_scheduled('swiftcurrency_update_rates')) {
			wp_schedule_event(time(), 'daily', 'swiftcurrency_update_rates');
		}

		// Schedule cleanup.
		if (! wp_next_scheduled('swiftcurrency_cleanup')) {
			wp_schedule_event(time(), 'daily', 'swiftcurrency_cleanup');
		}

		// Schedule weekly license verification.
		if (! wp_next_scheduled('swiftcurrency_verify_license')) {
			wp_schedule_event(time(), 'weekly', 'swiftcurrency_verify_license');
		}

		// Schedule crypto rate updates.
		if (! wp_next_scheduled('swiftcurrency_update_crypto_rates')) {
			wp_schedule_event(time(), 'hourly', 'swiftcurrency_update_crypto_rates');
		}
	}

	/**
	 * Clear cron events.
	 */
	private static function clear_cron_events()
	{
		wp_clear_scheduled_hook('swiftcurrency_update_rates');
		wp_clear_scheduled_hook('swiftcurrency_update_crypto_rates');
		wp_clear_scheduled_hook('swiftcurrency_cleanup');
		wp_clear_scheduled_hook('swiftcurrency_verify_license');
	}

	/**
	 * Clear cache.
	 */
	private static function clear_cache()
	{
		global $wpdb;

		// Delete all transients.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Bulk transient cleanup; no WP API for pattern-based deletion.
		$wpdb->query(
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- No user input; uses $wpdb->options which is a safe WP property.
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_swiftcurrency_%' OR option_name LIKE '_transient_timeout_swiftcurrency_%'"
		);

		// Clear object cache if available.
		if (function_exists('wp_cache_flush')) {
			wp_cache_flush();
		}
	}
}
