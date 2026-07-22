<?php
/**
 * Rate Provider Factory
 *
 * Creates rate provider instances by slug. Centralised here so that
 * Admin_Settings, Cron_Handler, and Rates_Page all use the same factory
 * instead of each duplicating a switch statement.
 *
 * @package SwiftCurrency
 * @since   1.0.0
 */

namespace Codeies\SwiftCurrency\Providers;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Rate_Provider_Factory class.
 *
 * @since 1.0.0
 */
class Rate_Provider_Factory {

	/**
	 * Settings instance (passed to providers that need an API key).
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * @param \Codeies\SwiftCurrency\Settings $settings Settings instance.
	 */
	public function __construct( $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Create and return a rate provider by slug.
	 *
	 * Built-in slugs: 'ecb', 'manual', 'binance', 'coingecko'.
	 * The filter `swiftcurrency_get_rate_provider` lets the Pro addon register
	 * its own providers without touching this class.
	 *
	 * @since  1.0.0
	 * @param  string $slug Provider slug.
	 * @return object|null Provider instance, or null if unknown.
	 */
	public function make( $slug ) {
		$provider = null;

		switch ( $slug ) {
			case 'ecb':
				$provider = new ECB();
				break;

			case 'manual':
				$provider = new Manual_Rates( $this->settings );
				break;

			case 'binance':
				$provider = new Binance( $this->settings );
				break;

			case 'coingecko':
				$provider = new CoinGecko( $this->settings );
				break;
		}

		/**
		 * Filter the rate provider instance.
		 *
		 * Use this to register additional providers from a Pro add-on:
		 *
		 *   add_filter( 'swiftcurrency_get_rate_provider', function( $provider, $slug, $settings ) {
		 *       if ( 'myprovider' === $slug ) {
		 *           return new My_Provider( $settings );
		 *       }
		 *       return $provider;
		 *   }, 10, 3 );
		 *
		 * @since 1.0.0
		 * @param object|null $provider      Provider instance (null if unrecognised).
		 * @param string      $slug          Provider slug.
		 * @param object      $settings      Settings instance.
		 */
		return apply_filters( 'swiftcurrency_get_rate_provider', $provider, $slug, $this->settings );
	}
}
