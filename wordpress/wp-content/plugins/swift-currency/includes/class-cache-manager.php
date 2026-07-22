<?php
/**
 * Cache Manager Class
 *
 * Handles caching for exchange rates, prices, and geolocation data.
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
 * Cache Manager class.
 *
 * @class Cache_Manager
 * @version 1.0.0
 */
class Cache_Manager {

	/**
	 * Cache group prefix.
	 *
	 * @var string
	 */
	const CACHE_GROUP = 'swift-currency';

	/**
	 * Get cached value.
	 *
	 * @param string $key   Cache key.
	 * @param string $group Cache group.
	 * @return mixed|false
	 */
	public function get( $key, $group = '' ) {
		$cache_key = $this->get_cache_key( $key, $group );

		// Try object cache first.
		$value = wp_cache_get( $cache_key, self::CACHE_GROUP );

		if ( false !== $value ) {
			// Track cache hit
			if ( class_exists( '\\Codeies\\SwiftCurrency\\Performance\\Performance_Monitor' ) ) {
				\Codeies\SwiftCurrency\Performance\Performance_Monitor::track_cache_hit();
			}
			return $value;
		}

		// Try transient.
		$transient_value = get_transient( $cache_key );
		
		if ( false !== $transient_value ) {
			// Track cache hit
			if ( class_exists( '\\Codeies\\SwiftCurrency\\Performance\\Performance_Monitor' ) ) {
				\Codeies\SwiftCurrency\Performance\Performance_Monitor::track_cache_hit();
			}
			return $transient_value;
		}
		
		// Track cache miss
		if ( class_exists( '\\Codeies\\SwiftCurrency\\Performance\\Performance_Monitor' ) ) {
			\Codeies\SwiftCurrency\Performance\Performance_Monitor::track_cache_miss();
		}
		
		return false;
	}

	/**
	 * Set cached value.
	 *
	 * @param string $key        Cache key.
	 * @param mixed  $value      Value to cache.
	 * @param int    $expiration Expiration time in seconds.
	 * @param string $group      Cache group.
	 * @return bool
	 */
	public function set( $key, $value, $expiration = 3600, $group = '' ) {
		$cache_key = $this->get_cache_key( $key, $group );

		// Set in object cache.
		wp_cache_set( $cache_key, $value, self::CACHE_GROUP, $expiration );

		// Set in transient.
		return set_transient( $cache_key, $value, $expiration );
	}

	/**
	 * Delete cached value.
	 *
	 * @param string $key   Cache key.
	 * @param string $group Cache group.
	 * @return bool
	 */
	public function delete( $key, $group = '' ) {
		$cache_key = $this->get_cache_key( $key, $group );

		// Delete from object cache.
		wp_cache_delete( $cache_key, self::CACHE_GROUP );

		// Delete transient.
		return delete_transient( $cache_key );
	}

	/**
	 * Clear all cache.
	 *
	 * @param string $group Optional. Specific group to clear.
	 * @return bool
	 */
	public function clear_all( $group = '' ) {
		global $wpdb;

		if ( $group ) {
			$pattern = self::CACHE_GROUP . '_' . $group . '_%';
		} else {
			$pattern = self::CACHE_GROUP . '_%';
		}

		// Delete transients.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Bulk transient cleanup by pattern; no WP API alternative.
		$wpdb->query(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Uses $wpdb->options, a safe WP property.
				"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				'_transient_' . $pattern,
				'_transient_timeout_' . $pattern
			)
		);

		// Flush object cache.
		if ( function_exists( 'wp_cache_flush_group' ) ) {
			wp_cache_flush_group( self::CACHE_GROUP );
		}

		return true;
	}

	/**
	 * Get exchange rate from cache.
	 *
	 * @param string $from_currency From currency code.
	 * @param string $to_currency   To currency code.
	 * @return float|false
	 */
	public function get_rate( $from_currency, $to_currency ) {
		$key = sprintf( 'rate_%s_%s', $from_currency, $to_currency );
		return $this->get( $key, 'rates' );
	}

	/**
	 * Set exchange rate in cache.
	 *
	 * @param string $from_currency From currency code.
	 * @param string $to_currency   To currency code.
	 * @param float  $rate          Exchange rate.
	 * @param int    $expiration    Expiration time in seconds.
	 * @return bool
	 */
	public function set_rate( $from_currency, $to_currency, $rate, $expiration = 3600 ) {
		$key = sprintf( 'rate_%s_%s', $from_currency, $to_currency );
		return $this->set( $key, $rate, $expiration, 'rates' );
	}

	/**
	 * Get converted price from cache.
	 *
	 * @param int    $product_id Product ID.
	 * @param string $currency   Currency code.
	 * @return float|false
	 */
	public function get_price( $product_id, $currency ) {
		$key = sprintf( 'price_%d_%s', $product_id, $currency );
		return $this->get( $key, 'prices' );
	}

	/**
	 * Set converted price in cache.
	 *
	 * @param int    $product_id Product ID.
	 * @param string $currency   Currency code.
	 * @param float  $price      Converted price.
	 * @param int    $expiration Expiration time in seconds.
	 * @return bool
	 */
	public function set_price( $product_id, $currency, $price, $expiration = 900 ) {
		$key = sprintf( 'price_%d_%s', $product_id, $currency );
		return $this->set( $key, $price, $expiration, 'prices' );
	}

	/**
	 * Get geolocation data from cache.
	 *
	 * @param string $ip_address IP address.
	 * @return array|false
	 */
	public function get_geolocation( $ip_address ) {
		$key = 'geo_' . md5( $ip_address );
		return $this->get( $key, 'geolocation' );
	}

	/**
	 * Set geolocation data in cache.
	 *
	 * @param string $ip_address IP address.
	 * @param array  $data       Geolocation data.
	 * @param int    $expiration Expiration time in seconds.
	 * @return bool
	 */
	public function set_geolocation( $ip_address, $data, $expiration = 86400 ) {
		$key = 'geo_' . md5( $ip_address );
		return $this->set( $key, $data, $expiration, 'geolocation' );
	}

	/**
	 * Clear rate cache.
	 *
	 * @return bool
	 */
	public function clear_rates() {
		return $this->clear_all( 'rates' );
	}

	/**
	 * Clear price cache.
	 *
	 * @return bool
	 */
	public function clear_prices() {
		return $this->clear_all( 'prices' );
	}

	/**
	 * Clear geolocation cache.
	 *
	 * @return bool
	 */
	public function clear_geolocation() {
		return $this->clear_all( 'geolocation' );
	}

	/**
	 * Get cache key.
	 *
	 * @param string $key   Base key.
	 * @param string $group Cache group.
	 * @return string
	 */
	private function get_cache_key( $key, $group = '' ) {
		if ( $group ) {
			return self::CACHE_GROUP . '_' . $group . '_' . $key;
		}
		return self::CACHE_GROUP . '_' . $key;
	}

	/**
	 * Get cache statistics.
	 *
	 * @return array
	 */
	public function get_stats() {
		global $wpdb;

		$stats = array(
			'total_cached_items' => 0,
			'rates_cached'       => 0,
			'prices_cached'      => 0,
			'geo_cached'         => 0,
		);

		// Count transients.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Count query on options table; no WP API for pattern-based counting.
		$total = $wpdb->get_var(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Uses $wpdb->options, a safe WP property.
				"SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s",
				'_transient_' . self::CACHE_GROUP . '_%'
			)
		);

		$stats['total_cached_items'] = (int) $total;

		// Count by group.
		foreach ( array( 'rates', 'prices', 'geolocation' ) as $group ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Count query on options table; no WP API for pattern-based counting.
			$count = $wpdb->get_var(
				$wpdb->prepare(
					// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Uses $wpdb->options, a safe WP property.
					"SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s",
					'_transient_' . self::CACHE_GROUP . '_' . $group . '_%'
				)
			);

			$stats[ $group . '_cached' ] = (int) $count;
		}

		return $stats;
	}

	/**
	 * Warm cache with frequently used data.
	 *
	 * @return bool
	 */
	public function warm_cache() {
		// This will be implemented when we have the rate provider.
		// For now, just return true.
		return true;
	}
}
