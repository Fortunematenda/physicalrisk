<?php
/**
 * Price Converter Class
 *
 * Handles accurate price conversion between currencies.
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
 * Price Converter class.
 *
 * @class Price_Converter
 * @version 1.0.0
 */
class Price_Converter {

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
	 * Constructor.
	 *
	 * @param Settings      $settings Settings instance.
	 * @param Cache_Manager $cache    Cache Manager instance.
	 */
	public function __construct( $settings, $cache ) {
		$this->settings = $settings;
		$this->cache    = $cache;
	}

	/**
	 * Convert amount from one currency to another.
	 *
	 * @param float  $amount        Amount to convert.
	 * @param string $from_currency Source currency code.
	 * @param string $to_currency   Target currency code.
	 * @return float|false Converted amount or false on failure.
	 */
	public function convert( $amount, $from_currency, $to_currency ) {
		// If same currency, return original amount.
		if ( $from_currency === $to_currency ) {
			return (float) $amount;
		}

		/**
		 * Action hook before price conversion.
		 *
		 * @since 1.0.0
		 * @param float  $amount        Amount to convert.
		 * @param string $from_currency Source currency.
		 * @param string $to_currency   Target currency.
		 */
		do_action( 'swiftcurrency_before_price_convert', $amount, $from_currency, $to_currency );

		// Get exchange rate.
		$rate = $this->get_conversion_rate( $from_currency, $to_currency );

		if ( false === $rate ) {
			return false;
		}

		// Convert with 8 decimal precision.
		$converted = $amount * $rate;

		/**
		 * Filter converted price.
		 *
		 * @since 1.0.0
		 * @param float  $converted     Converted amount.
		 * @param float  $amount        Original amount.
		 * @param string $from_currency Source currency.
		 * @param string $to_currency   Target currency.
		 */
		$converted = apply_filters( 'swiftcurrency_converted_price', $converted, $amount, $from_currency, $to_currency );

		/**
		 * Action hook after price conversion.
		 *
		 * @since 1.0.0
		 * @param float  $converted     Converted amount.
		 * @param float  $amount        Original amount.
		 */
		do_action( 'swiftcurrency_after_price_convert', $converted, $amount );

		return $converted;
	}

	/**
	 * Convert with rounding applied.
	 *
	 * @param float  $amount        Amount to convert.
	 * @param string $from_currency Source currency code.
	 * @param string $to_currency   Target currency code.
	 * @return float|false Converted and rounded amount or false on failure.
	 */
	public function convert_with_rounding( $amount, $from_currency, $to_currency ) {
		$converted = $this->convert( $amount, $from_currency, $to_currency );

		if ( false === $converted ) {
			return false;
		}

		return $this->apply_rounding( $converted, $to_currency );
	}

	/**
	 * Apply rounding to a price.
	 *
	 * @param float  $amount   Amount to round.
	 * @param string $currency Currency code.
	 * @return float Rounded amount.
	 */
	public function apply_rounding( $amount, $currency ) {
		$currency_manager = swiftcurrency()->get_currency_manager();
		$is_crypto        = $currency_manager ? $currency_manager->is_crypto( $currency ) : false;

		if ( $is_crypto ) {
			$mode     = $this->settings->get( 'pricing', 'crypto_rounding_mode', 'nearest' );
			$decimals = (int) $this->settings->get( 'pricing', 'crypto_decimal_places', 8 );
		} else {
			$mode     = $this->settings->get( 'pricing', 'rounding_mode', 'nearest' );
			$decimals = (int) $this->settings->get( 'pricing', 'decimal_places', 2 );
		}

		/**
		 * Filter rounding mode.
		 *
		 * @since 1.0.0
		 * @param string $mode     Rounding mode.
		 * @param string $currency Currency code.
		 */
		$mode = apply_filters( 'swiftcurrency_rounding_mode', $mode, $currency );

		switch ( $mode ) {
			case 'up':
				$rounded = $this->round_up( $amount, $decimals );
				break;

			case 'down':
				$rounded = $this->round_down( $amount, $decimals );
				break;

			case 'nearest':
			default:
				$rounded = round( $amount, $decimals );
				break;
		}

		// Apply charm pricing if enabled.
		if ( $is_crypto ) {
			if ( $this->settings->get( 'pricing', 'enable_crypto_charm_pricing', false ) ) {
				$rounded = $this->apply_charm_pricing( $rounded, true );
			}
		} else {
			if ( $this->settings->get( 'pricing', 'enable_charm_pricing', false ) ) {
				$rounded = $this->apply_charm_pricing( $rounded, false );
			}
		}

		return $rounded;
	}

	/**
	 * Round up to specified decimals.
	 *
	 * @param float $amount   Amount to round.
	 * @param int   $decimals Number of decimal places.
	 * @return float
	 */
	private function round_up( $amount, $decimals ) {
		$multiplier = pow( 10, $decimals );
		return ceil( $amount * $multiplier ) / $multiplier;
	}

	/**
	 * Round down to specified decimals.
	 *
	 * @param float $amount   Amount to round.
	 * @param int   $decimals Number of decimal places.
	 * @return float
	 */
	private function round_down( $amount, $decimals ) {
		$multiplier = pow( 10, $decimals );
		return floor( $amount * $multiplier ) / $multiplier;
	}

	/**
	 * Apply charm pricing.
	 *
	 * @param float $amount Amount to apply charm pricing to.
	 * @return float
	 */
	public function apply_charm_pricing( $amount, $is_crypto = false ) {
		if ( $is_crypto ) {
			$charm_value = $this->settings->get( 'pricing', 'crypto_charm_value', 0.99 );
		} else {
			$charm_value = $this->settings->get( 'pricing', 'charm_value', 0.99 );
		}

		// Get the integer part.
		$integer = floor( $amount );

		// Apply charm value.
		return $integer + $charm_value;
	}

	/**
	 * Get conversion rate between two currencies.
	 *
	 * @param string $from_currency Source currency code.
	 * @param string $to_currency   Target currency code.
	 * @return float|false Exchange rate or false on failure.
	 */
	public function get_conversion_rate( $from_currency, $to_currency ) {
		global $wpdb;

		// Same currency = rate 1.0.
		if ( $from_currency === $to_currency ) {
			return 1.0;
		}

		// Try cache first.
		$cached_rate = $this->cache->get_rate( $from_currency, $to_currency );

		if ( false !== $cached_rate ) {
			return (float) $cached_rate;
		}

		// Get rates from database.
		$table_name = $wpdb->prefix . 'swiftcurrency_rates';

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Rate lookup; cached above via transient/object cache.
		$from_rate = $wpdb->get_var(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name is derived from $wpdb->prefix, safe.
				'SELECT exchange_rate FROM `' . esc_sql( $table_name ) . '` WHERE currency_code = %s',
				$from_currency
			)
		);

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Rate lookup; cached above via transient/object cache.
		$to_rate = $wpdb->get_var(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name is derived from $wpdb->prefix, safe.
				'SELECT exchange_rate FROM `' . esc_sql( $table_name ) . '` WHERE currency_code = %s',
				$to_currency
			)
		);

		$base_currency = $this->settings->get( 'general', 'base_currency', ( function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD' ) );

		// If from_currency not in database, assume it's base currency (1.0)
		if ( null === $from_rate ) {
			if ( $from_currency === $base_currency ) {
				$from_rate = 1.0;
			} else {
				return false;
			}
		}

		// If to_currency not in database, assume it's base currency (1.0)
		if ( null === $to_rate ) {
			if ( $to_currency === $base_currency ) {
				$to_rate = 1.0;
			} else {
				return false;
			}
		}

		// Calculate cross rate.
		$rate = $to_rate / $from_rate;

		/**
		 * Filter exchange rate.
		 *
		 * @since 1.0.0
		 * @param float  $rate          Exchange rate.
		 * @param string $from_currency Source currency.
		 * @param string $to_currency   Target currency.
		 */
		$rate = apply_filters( 'swiftcurrency_exchange_rate', $rate, $from_currency, $to_currency );

		// Cache the rate.
		$cache_duration = $this->settings->get( 'advanced', 'cache_duration', 3600 );
		$this->cache->set_rate( $from_currency, $to_currency, $rate, $cache_duration );

		return (float) $rate;
	}

	/**
	 * Bulk convert multiple amounts.
	 *
	 * @param array  $amounts       Array of amounts to convert.
	 * @param string $from_currency Source currency code.
	 * @param string $to_currency   Target currency code.
	 * @return array Array of converted amounts.
	 */
	public function bulk_convert( array $amounts, $from_currency, $to_currency ) {
		// Get rate once for all conversions.
		$rate = $this->get_conversion_rate( $from_currency, $to_currency );

		if ( false === $rate ) {
			return array_fill( 0, count( $amounts ), false );
		}

		$converted = array();
		foreach ( $amounts as $key => $amount ) {
			$converted[ $key ] = $amount * $rate;
		}

		return $converted;
	}

	/**
	 * Clear conversion cache.
	 *
	 * @return bool
	 */
	public function clear_cache() {
		return $this->cache->clear_rates();
	}
}
