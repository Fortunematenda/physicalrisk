<?php
/**
 * Binance Rate Provider
 *
 * Free cryptocurrency rate provider from Binance.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency\Providers;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Binance Provider class.
 *
 * @class Binance
 * @version 1.0.0
 */
class Binance implements Rate_Provider_Interface {

	/**
	 * API endpoint URL.
	 *
	 * @var string
	 */
	const API_URL = 'https://api.binance.com/api/v3/ticker/price';

	/**
	 * Last error message.
	 *
	 * @var string|null
	 */
	private $last_error = null;

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * Constructor.
	 *
	 * @param \Codeies\SwiftCurrency\Settings $settings Settings instance.
	 */
	public function __construct( $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Fetch cryptocurrency exchange rates.
	 *
	 * @param string $base_currency Base currency code.
	 * @return array|false
	 */
	public function fetch_rates( $base_currency ) {
		$this->last_error = null;

		$crypto_currencies = $this->get_enabled_cryptos();
		if ( empty( $crypto_currencies ) ) {
			return array();
		}

		$response = wp_remote_get( self::API_URL, array( 'timeout' => 15 ) );

		if ( is_wp_error( $response ) ) {
			$this->last_error = $response->get_error_message();
			return false;
		}

		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );

		if ( ! is_array( $data ) ) {
			$this->last_error = __( 'Invalid response from Binance.', 'swift-currency' );
			return false;
		}

		// Group by symbol for faster lookup.
		$all_prices = array();
		foreach ( $data as $ticker ) {
			$all_prices[ $ticker['symbol'] ] = (float) $ticker['price'];
		}

		$rates = array();
		foreach ( $crypto_currencies as $symbol ) {
			// Try direct pair first (e.g. BTCUSD, BTCPKR).
			$pair = $symbol . $base_currency;
			$calculated_rate = null;

			if ( isset( $all_prices[ $pair ] ) ) {
				$calculated_rate = $all_prices[ $pair ];
			} else {
				// Try USDT pair and convert to base (standard for many cryptos).
				$usdt_pair = $symbol . 'USDT';
				$base_usdt = $base_currency . 'USDT';
				$usdt_base = 'USDT' . $base_currency;

				if ( isset( $all_prices[ $usdt_pair ] ) ) {
					if ( 'USDT' === $base_currency ) {
						$calculated_rate = $all_prices[ $usdt_pair ];
					} elseif ( isset( $all_prices[ $base_usdt ] ) && $all_prices[ $base_usdt ] > 0 ) {
						// BTCUSDT / PKRUSDT = BTCPKR
						$calculated_rate = $all_prices[ $usdt_pair ] / $all_prices[ $base_usdt ];
					} elseif ( isset( $all_prices[ $usdt_base ] ) && $all_prices[ $usdt_base ] > 0 ) {
						// BTCUSDT * USDTPKR = BTCPKR
						$calculated_rate = $all_prices[ $usdt_pair ] * $all_prices[ $usdt_base ];
					}
				}
			}
			if ( $calculated_rate && $calculated_rate > 0 ) {
				$rates[ $symbol ] = 1 / $calculated_rate;
			}
		}

		if ( empty( $rates ) ) {
			$this->last_error = sprintf(
				/* translators: %s: base currency */
				__( 'No valid price pairs found on Binance for %s.', 'swift-currency' ),
				$base_currency
			);
			return false;
		}

		return $rates;
	}

	/**
	 * Get enabled crypto currencies.
	 *
	 * @return array
	 */
	private function get_enabled_cryptos() {
		$enabled = $this->settings->get( 'general', 'enabled_currencies', array() );
		$cryptos = array();

		foreach ( $enabled as $code ) {
			$data = swiftcurrency_get_currency_data( $code );
			if ( isset( $data['type'] ) && 'crypto' === $data['type'] ) {
				$cryptos[] = $code;
			}
		}

		return $cryptos;
	}

	/**
	 * Check if provider is available.
	 *
	 * @return bool
	 */
	public function is_available() {
		return true;
	}

	/**
	 * Get provider name.
	 *
	 * @return string
	 */
	public function get_provider_name() {
		return __( 'Binance (Crypto)', 'swift-currency' );
	}

	/**
	 * Check if requires API key.
	 *
	 * @return bool
	 */
	public function requires_api_key() {
		return false;
	}

	/**
	 * Get last error.
	 *
	 * @return string|null
	 */
	public function get_last_error() {
		return $this->last_error;
	}
}
