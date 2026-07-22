<?php
/**
 * Cron Handler Class
 *
 * Handles scheduled tasks for currency rate updates and cleanup.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Cron_Handler class.
 *
 * @since 1.0.0
 */
class Cron_Handler {

	/**
	 * Settings instance.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Cache Manager instance.
	 *
	 * @var Cache_Manager
	 */
	private $cache;

	/**
	 * Currency Manager instance.
	 *
	 * @var Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Rate Fetcher service.
	 *
	 * Handles provider instantiation, crypto-base bridging, and fallbacks.
	 * Injected here so Cron_Handler does not need its own provider factory.
	 *
	 * @var Rate_Fetcher
	 */
	private $rate_fetcher;

	/**
	 * @param Settings         $settings         Settings instance.
	 * @param Cache_Manager    $cache            Cache Manager instance.
	 * @param Currency_Manager $currency_manager Currency Manager instance.
	 * @param Rate_Fetcher     $rate_fetcher     Rate Fetcher service.
	 */
	public function __construct( $settings, $cache, $currency_manager, $rate_fetcher ) {
		$this->settings         = $settings;
		$this->cache            = $cache;
		$this->currency_manager = $currency_manager;
		$this->rate_fetcher     = $rate_fetcher;

		$this->init_hooks();

		// One-time migration: fix the cron schedule if the stored interval
		// does not match the WP-registered schedule (runs only once via transient).
		$this->maybe_fix_cron_schedule();

		// Ensure all required cron events are registered.
		$this->ensure_cron_scheduled();
	}

	/**
	 * Register action/filter hooks.
	 *
	 * @since 1.0.0
	 */
	private function init_hooks() {
		add_action( 'swiftcurrency_update_rates',        array( $this, 'update_exchange_rates' ) );
		add_action( 'swiftcurrency_update_crypto_rates', array( $this, 'update_crypto_rates' ) );
		add_action( 'swiftcurrency_cleanup',             array( $this, 'cleanup_old_data' ) );

		// Reschedule cron events when settings change.
		add_action( 'update_option_swiftcurrency_settings', array( $this, 'maybe_reschedule_events' ), 10, 2 );

		// Register custom WP-Cron schedules.
		add_filter( 'cron_schedules', array( $this, 'add_custom_cron_schedules' ) );
	}

	// -------------------------------------------------------------------------
	// Public cron callbacks
	// -------------------------------------------------------------------------

	/**
	 * Fetch and store updated fiat exchange rates.
	 *
	 * Existing cached rates are preserved if the fetch fails, so the site
	 * always serves the most recent successful rates.
	 *
	 * @since 1.0.0
	 */
	public function update_exchange_rates() {
		$fiat_provider   = $this->settings->get( 'rates', 'provider', 'ecb' );
		$crypto_provider = $this->settings->get( 'rates', 'crypto_provider', 'coingecko' );

		$this->log( 'Starting scheduled exchange rate update.', 'info' );

		$base_currency = $this->get_base_currency();

		// Delegate to Rate_Fetcher — handles the crypto-base bridge automatically.
		$new_rates = $this->rate_fetcher->fetch_fiat_rates( $fiat_provider, $base_currency, $crypto_provider );

		if ( empty( $new_rates ) ) {
			$this->log( 'Failed to fetch fiat rates. Keeping existing cache.', 'error' );
			return;
		}

		$this->log( sprintf( 'Fetched %d exchange rates.', count( $new_rates ) ), 'info' );

		$saved = $this->save_rates_to_database( $new_rates, $base_currency, $fiat_provider );
		$this->log( sprintf( 'Saved %d rates to database.', $saved ), 'info' );

		$this->update_rate_cache( $new_rates, $base_currency );
		update_option( 'swiftcurrency_last_rate_update', current_time( 'mysql' ) );

		/**
		 * Fires after exchange rates have been successfully updated.
		 *
		 * @since 1.0.0
		 * @param array  $new_rates     New exchange rates.
		 * @param string $fiat_provider Provider used.
		 */
		do_action( 'swiftcurrency_rates_updated', $new_rates, $fiat_provider );

		$this->log( 'Exchange rate update completed successfully.', 'info' );
	}

	/**
	 * Fetch and store updated crypto exchange rates.
	 *
	 * @since 1.0.0
	 */
	public function update_crypto_rates() {
		$crypto_provider = $this->settings->get( 'rates', 'crypto_provider', 'coingecko' );

		$this->log( "Starting scheduled crypto rate update via {$crypto_provider}.", 'info' );

		$base_currency = $this->get_base_currency();

		// Delegate entirely to Rate_Fetcher.
		$new_rates = $this->rate_fetcher->fetch_crypto_rates( $crypto_provider, $base_currency );

		if ( empty( $new_rates ) ) {
			$this->log( "Failed to fetch crypto rates via {$crypto_provider}.", 'error' );
			return;
		}

		$this->log( sprintf( 'Fetched %d crypto rates.', count( $new_rates ) ), 'info' );

		$saved = $this->save_rates_to_database( $new_rates, $base_currency, $crypto_provider );
		$this->log( sprintf( 'Saved %d crypto rates to database.', $saved ), 'info' );

		$this->update_rate_cache( $new_rates, $base_currency );
		update_option( 'swiftcurrency_last_crypto_rate_update', current_time( 'mysql' ) );
	}

	/**
	 * Clean up old logs and rate history.
	 *
	 * @since 1.0.0
	 */
	public function cleanup_old_data() {
		global $wpdb;

		$this->log( 'Starting scheduled cleanup.', 'info' );

		$log_retention = (int) $this->settings->get( 'advanced', 'log_retention_days', 30 );

		if ( $log_retention > 0 ) {
			$table   = $wpdb->prefix . 'swiftcurrency_logs';
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$deleted = $wpdb->query(
				$wpdb->prepare(
					// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					'DELETE FROM `' . esc_sql( $table ) . '` WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)',
					$log_retention
				)
			);
			$this->log( sprintf( 'Deleted %d old log entries.', $deleted ), 'info' );
		}

		// Rate history is kept for 1 year (not user-configurable).
		$history_table = $wpdb->prefix . 'swiftcurrency_rate_history';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$deleted = $wpdb->query(
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			'DELETE FROM `' . esc_sql( $history_table ) . '` WHERE created_at < DATE_SUB(NOW(), INTERVAL 365 DAY)'
		);
		$this->log( sprintf( 'Deleted %d old rate history entries.', $deleted ), 'info' );

		delete_expired_transients();

		$this->log( 'Cleanup completed successfully.', 'info' );
	}

	/**
	 * Register custom WP-Cron schedules used by this plugin.
	 *
	 * @since 1.0.0
	 * @param array $schedules Existing WP-Cron schedules.
	 * @return array Modified schedules.
	 */
	public function add_custom_cron_schedules( $schedules ) {
		$schedules['sixhourly'] = array(
			'interval' => 6 * HOUR_IN_SECONDS,
			'display'  => __( 'Every 6 Hours', 'swift-currency' ),
		);

		$schedules['twelvehourly'] = array(
			'interval' => 12 * HOUR_IN_SECONDS,
			'display'  => __( 'Every 12 Hours', 'swift-currency' ),
		);

		if ( ! isset( $schedules['weekly'] ) ) {
			$schedules['weekly'] = array(
				'interval' => WEEK_IN_SECONDS,
				'display'  => __( 'Once Weekly', 'swift-currency' ),
			);
		}

		return $schedules;
	}

	/**
	 * Reschedule cron events when the settings option is updated.
	 *
	 * @since 1.0.0
	 * @param array $old_value Previous settings array.
	 * @param array $new_value New settings array.
	 */
	public function maybe_reschedule_events( $old_value, $new_value ) {
		$old_fiat   = isset( $old_value['rates']['update_interval'] )        ? $old_value['rates']['update_interval']        : '86400';
		$new_fiat   = isset( $new_value['rates']['update_interval'] )        ? $new_value['rates']['update_interval']        : '86400';
		$old_crypto = isset( $old_value['rates']['crypto_update_interval'] ) ? $old_value['rates']['crypto_update_interval'] : 'hourly';
		$new_crypto = isset( $new_value['rates']['crypto_update_interval'] ) ? $new_value['rates']['crypto_update_interval'] : 'hourly';

		if ( $old_fiat !== $new_fiat ) {
			wp_clear_scheduled_hook( 'swiftcurrency_update_rates' );

			if ( 'manual' === $new_fiat ) {
				$this->log( 'Rate updates set to manual; schedule cleared.', 'info' );
			} else {
				$wp_interval = $this->map_interval_to_wp_schedule( $new_fiat, 'daily' );
				wp_schedule_event( time(), $wp_interval, 'swiftcurrency_update_rates' );
				$this->log( "Rescheduled fiat updates: {$old_fiat} -> {$new_fiat} ({$wp_interval})", 'info' );
			}
		}

		if ( $old_crypto !== $new_crypto ) {
			wp_clear_scheduled_hook( 'swiftcurrency_update_crypto_rates' );

			if ( 'manual' === $new_crypto ) {
				$this->log( 'Crypto rate updates set to manual; schedule cleared.', 'info' );
			} else {
				$wp_interval = $this->map_interval_to_wp_schedule( $new_crypto, 'hourly' );
				wp_schedule_event( time(), $wp_interval, 'swiftcurrency_update_crypto_rates' );
				$this->log( "Rescheduled crypto updates: {$old_crypto} -> {$new_crypto} ({$wp_interval})", 'info' );
			}
		}
	}

	/**
	 * Ensure all required cron events are scheduled.
	 *
	 * Called on every request so the schedule is self-healing if an event
	 * is accidentally cleared.
	 *
	 * @since 1.0.0
	 */
	public function ensure_cron_scheduled() {
		// -- Fiat rates --
		$fiat_interval = $this->settings->get( 'rates', 'update_interval', '86400' );
		$this->schedule_event( 'swiftcurrency_update_rates', $fiat_interval, 'daily' );

		// -- Cleanup --
		if ( ! wp_next_scheduled( 'swiftcurrency_cleanup' ) ) {
			wp_schedule_event( time(), 'daily', 'swiftcurrency_cleanup' );
			$this->log( 'Scheduled daily cleanup.', 'info' );
		}

		// -- Crypto rates --
		$this->ensure_crypto_cron_scheduled();
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Return a map of all stored interval keys to their WP-Cron schedule slugs.
	 *
	 * Storing this in one place avoids duplicating the array across methods.
	 *
	 * @since 1.0.0
	 * @return array<string,string> Interval key => WP schedule slug.
	 */
	private function get_interval_map() {
		return array(
			// Numeric-second keys (as stored by the settings form).
			'900'    => 'fifteenminutes',
			'1800'   => 'thirtyminutes',
			'3600'   => 'hourly',
			'21600'  => 'sixhourly',
			'43200'  => 'twelvehourly',
			'86400'  => 'daily',
			'604800' => 'weekly',
			// Named-key aliases.
			'fifteenminutes' => 'fifteenminutes',
			'thirtyminutes'  => 'thirtyminutes',
			'hourly'         => 'hourly',
			'sixhourly'      => 'sixhourly',
			'twelvehourly'   => 'twelvehourly',
			'twicedaily'     => 'twicedaily',
			'daily'          => 'daily',
			'weekly'         => 'weekly',
		);
	}

	/**
	 * Map a stored interval key to a registered WP-Cron schedule slug.
	 *
	 * @since 1.0.0
	 * @param string $interval     Stored interval key.
	 * @param string $default_slug WP schedule slug to use as fallback.
	 * @return string WP-Cron schedule slug.
	 */
	private function map_interval_to_wp_schedule( $interval, $default_slug = 'daily' ) {
		$map = $this->get_interval_map();
		return isset( $map[ $interval ] ) ? $map[ $interval ] : $default_slug;
	}

	/**
	 * Read the currently registered WP-Cron schedule for a given hook name.
	 *
	 * Returns null when the hook is not scheduled or has no schedule key.
	 *
	 * @since 1.0.0
	 * @param string $hook WP-Cron hook name.
	 * @return string|null Current schedule slug, or null.
	 */
	private function get_scheduled_interval( $hook ) {
		$crons = _get_cron_array();

		foreach ( $crons as $cron ) {
			if ( isset( $cron[ $hook ] ) ) {
				foreach ( $cron[ $hook ] as $event ) {
					if ( isset( $event['schedule'] ) ) {
						return $event['schedule'];
					}
				}
			}
		}

		return null;
	}

	/**
	 * Schedule or reschedule a single cron event if needed.
	 *
	 * Skips scheduling when the interval is 'manual'. Clears and reschedules
	 * when the event is missing or its registered schedule no longer matches.
	 *
	 * @since 1.0.0
	 * @param string $hook         WP-Cron hook name.
	 * @param string $interval     Stored interval key.
	 * @param string $default_slug Fallback WP schedule slug.
	 */
	private function schedule_event( $hook, $interval, $default_slug = 'daily' ) {
		if ( 'manual' === $interval ) {
			wp_clear_scheduled_hook( $hook );
			return;
		}

		$wp_interval      = $this->map_interval_to_wp_schedule( $interval, $default_slug );
		$next_scheduled   = wp_next_scheduled( $hook );
		$current_interval = $next_scheduled ? $this->get_scheduled_interval( $hook ) : null;

		$needs_reschedule = ! $next_scheduled
			|| ( $current_interval && $current_interval !== $wp_interval );

		if ( $needs_reschedule ) {
			wp_clear_scheduled_hook( $hook );
			wp_schedule_event( time(), $wp_interval, $hook );
			$this->log( "Scheduled {$hook} with interval: {$wp_interval}", 'info' );
		}
	}

	/**
	 * Ensure the crypto rate update cron is scheduled correctly.
	 *
	 * @since 1.0.0
	 */
	private function ensure_crypto_cron_scheduled() {
		$interval = $this->settings->get( 'rates', 'crypto_update_interval', 'hourly' );
		$this->schedule_event( 'swiftcurrency_update_crypto_rates', $interval, 'hourly' );
	}

	/**
	 * One-time migration: fix the WP-Cron schedule if it does not match the
	 * configured interval.
	 *
	 * Uses a transient to ensure it only ever runs once per site.
	 *
	 * @since 1.0.0
	 */
	private function maybe_fix_cron_schedule() {
		if ( get_transient( 'swiftcurrency_cron_schedule_fixed' ) ) {
			return;
		}

		$stored_interval  = $this->settings->get( 'rates', 'update_interval', '86400' );
		$expected         = $this->map_interval_to_wp_schedule( $stored_interval, 'daily' );
		$current_interval = $this->get_scheduled_interval( 'swiftcurrency_update_rates' );

		if ( $current_interval && $current_interval !== $expected ) {
			$this->log( "Migration: fixing cron schedule {$current_interval} -> {$expected}", 'info' );
			wp_clear_scheduled_hook( 'swiftcurrency_update_rates' );
			wp_schedule_event( time(), $expected, 'swiftcurrency_update_rates' );
		}

		// Flag this migration so it never runs again.
		set_transient( 'swiftcurrency_cron_schedule_fixed', true, YEAR_IN_SECONDS );
	}

	/**
	 * Upsert exchange rates into the database.
	 *
	 * @since 1.0.0
	 * @param array  $rates         Exchange rates keyed by currency code.
	 * @param string $base_currency Base currency code.
	 * @param string $provider_name Provider slug.
	 * @return int Number of rows successfully inserted or updated.
	 */
	private function save_rates_to_database( $rates, $base_currency, $provider_name ) {
		global $wpdb;

		$table        = $wpdb->prefix . 'swiftcurrency_rates';
		$saved        = 0;
		$current_time = current_time( 'mysql' );

		foreach ( $rates as $currency_code => $rate ) {
			$rate          = swiftcurrency_normalize_rate( $rate, $currency_code, $base_currency );
			$currency_name = $this->get_currency_display_name( $currency_code );

			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			$exists = $wpdb->get_var(
				$wpdb->prepare(
					// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					'SELECT id FROM `' . esc_sql( $table ) . '` WHERE currency_code = %s',
					$currency_code
				)
			);

			if ( $exists ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
				$result = $wpdb->update(
					$table,
					array(
						'exchange_rate' => $rate,
						'base_currency' => $base_currency,
						'provider'      => $provider_name,
						'last_updated'  => $current_time,
						'updated_at'    => $current_time,
					),
					array( 'currency_code' => $currency_code ),
					array( '%f', '%s', '%s', '%s', '%s' ),
					array( '%s' )
				);
			} else {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
				$result = $wpdb->insert(
					$table,
					array(
						'currency_code' => $currency_code,
						'currency_name' => $currency_name,
						'exchange_rate' => $rate,
						'base_currency' => $base_currency,
						'provider'      => $provider_name,
						'is_enabled'    => 0,
						'last_updated'  => $current_time,
						'created_at'    => $current_time,
					),
					array( '%s', '%s', '%f', '%s', '%s', '%d', '%s', '%s' )
				);
			}

			if ( false !== $result ) {
				$saved++;
			}

			$this->save_rate_to_history( $currency_code, $base_currency, $rate, $provider_name );
		}

		return $saved;
	}

	/**
	 * Insert a row into the rate history table.
	 *
	 * @since 1.0.0
	 * @param string $currency_code Currency code.
	 * @param string $base_currency Base currency code.
	 * @param float  $rate          Exchange rate.
	 * @param string $provider_name Provider slug.
	 */
	private function save_rate_to_history( $currency_code, $base_currency, $rate, $provider_name ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->insert(
			$wpdb->prefix . 'swiftcurrency_rate_history',
			array(
				'currency_code' => $currency_code,
				'base_currency' => $base_currency,
				'exchange_rate' => $rate,
				'provider'      => $provider_name,
				'created_at'    => current_time( 'mysql' ),
			),
			array( '%s', '%s', '%f', '%s', '%s' )
		);
	}

	/**
	 * Write new rates to the object cache.
	 *
	 * Also pre-caches the inverse rate so reverse conversions avoid extra lookups.
	 *
	 * @since 1.0.0
	 * @param array  $rates         Exchange rates keyed by currency code.
	 * @param string $base_currency Base currency code.
	 */
	private function update_rate_cache( $rates, $base_currency ) {
		$cache_duration = (int) $this->settings->get( 'advanced', 'cache_duration', 3600 );

		foreach ( $rates as $currency_code => $rate ) {
			$this->cache->set_rate( $base_currency, $currency_code, $rate, $cache_duration );

			if ( $rate > 0 ) {
				$this->cache->set_rate( $currency_code, $base_currency, 1 / $rate, $cache_duration );
			}
		}
	}

	/**
	 * Get a human-readable currency name for a given code.
	 *
	 * Prefers data from Currency_Manager. Falls back to the currency code itself.
	 *
	 * @since 1.0.0
	 * @param string $code Currency code.
	 * @return string Currency name.
	 */
	private function get_currency_display_name( $code ) {
		$currency_data = $this->currency_manager->get_currency( $code );

		if ( $currency_data && ! empty( $currency_data['name'] ) ) {
			return $currency_data['name'];
		}

		return $code;
	}

	/**
	 * Get the configured base currency, falling back to the WC store currency.
	 *
	 * @since 1.0.0
	 * @return string
	 */
	private function get_base_currency() {
		return $this->settings->get(
			'general',
			'base_currency',
			function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD'
		);
	}

	/**
	 * Write a log entry via the plugin logger.
	 *
	 * @since 1.0.0
	 * @param string $message   Log message.
	 * @param string $log_level Log level: debug, info, warning, or error.
	 */
	private function log( $message, $log_level = 'info' ) {
		swiftcurrency_log( $message, $log_level, 'swiftcurrency-cron' );
	}
}
