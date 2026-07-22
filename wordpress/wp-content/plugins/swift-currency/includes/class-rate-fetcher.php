<?php
/**
 * Rate Fetcher Service
 *
 * Handles fetching of fiat and crypto exchange rates,
 * including crypto-base fallback bridge with provider-agnostic handling.
 *
 * @package SwiftCurrency
 * @since   1.0.0
 */

namespace Codeies\SwiftCurrency;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Rate_Fetcher {

	/**
	 * Currency Manager instance.
	 *
	 * @var Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Rate provider factory.
	 *
	 * @var Providers\Rate_Provider_Factory
	 */
	private $factory;

	public function __construct( $currency_manager, $factory ) {
		$this->currency_manager = $currency_manager;
		$this->factory          = $factory;
	}

	/**
	 * Fetch fiat rates.
	 */
	public function fetch_fiat_rates( $fiat_provider_slug, $base_currency, $crypto_provider_slug ) {
		$fiat_provider = $this->factory->make( $fiat_provider_slug );

		if ( ! $fiat_provider || ! $fiat_provider->is_available() ) {
			return false;
		}

		// Normal case: fiat base
		if ( ! $this->currency_manager->is_crypto( $base_currency ) ) {
			return $fiat_provider->fetch_rates( $base_currency );
		}

		// Crypto base → use bridge
		return $this->fetch_fiat_rates_via_crypto_bridge(
			$fiat_provider,
			$base_currency,
			$crypto_provider_slug
		);
	}

	/**
	 * Fetch crypto rates.
	 */
	public function fetch_crypto_rates( $crypto_provider_slug, $base_currency ) {
		$provider = $this->factory->make( $crypto_provider_slug );

		if ( ! $provider || ! $provider->is_available() ) {
			return false;
		}

		return $provider->fetch_rates( $base_currency );
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Bridge: fiat rates when base is crypto.
	 */
	private function fetch_fiat_rates_via_crypto_bridge( $fiat_provider, $base_currency, $crypto_provider_slug ) {
		$fallback_base = 'USD';

		// Step 1: Get USD-based fiat rates
		$fiat_rates = $fiat_provider->fetch_rates( $fallback_base );

		if ( ! is_array( $fiat_rates ) || empty( $fiat_rates ) ) {
			return $fiat_rates;
		}

		// Step 2: Get crypto → USD rate
		$crypto_provider = $this->factory->make( $crypto_provider_slug );

		if ( ! $crypto_provider || ! $crypto_provider->is_available() ) {
			return false;
		}

		$crypto_rates = $crypto_provider->fetch_rates( $fallback_base );

		if ( ! is_array( $crypto_rates ) || empty( $crypto_rates[ $base_currency ] ) ) {
			return false;
		}

		// ✅ Normalize to: USD per BASE
		$base_to_usd = $this->normalize_base_to_usd( $crypto_rates[ $base_currency ] );

		if ( ! $base_to_usd ) {
			return false;
		}

		$converted_rates = array();

		// Step 3: Convert fiat → crypto base
		foreach ( $fiat_rates as $code => $rate ) {
			$converted_rates[ $code ] = $base_to_usd * (float) $rate;
		}

		// Add USD itself
		$converted_rates[ $fallback_base ] = $base_to_usd;

		return $converted_rates;
	}

	/**
	 * Normalize crypto rate to USD per BASE.
	 *
	 * Handles:
	 * - USD per BASE (e.g. 60000) ✅
	 * - BASE per USD (e.g. 0.000016) ❌
	 */
	private function normalize_base_to_usd( $raw_rate ) {
		$rate = (float) $raw_rate;

		if ( $rate <= 0 ) {
			return false;
		}

		/**
		 * Heuristic:
		 * - If < 1 → likely BASE per USD → invert
		 * - If > 1 → likely USD per BASE
		 *
		 * Works for most providers like CoinGecko.
		 */
		if ( $rate < 1 ) {
			return 1 / $rate;
		}

		return $rate;
	}
}