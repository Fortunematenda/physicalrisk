<?php
/**
 * CoinGecko Rate Provider
 *
 * Free cryptocurrency rate provider.
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
 * CoinGecko Provider class.
 *
 * @class CoinGecko
 * @version 1.0.0
 */
class CoinGecko implements Rate_Provider_Interface {

	/**
	 * API endpoint URL.
	 *
	 * @var string
	 */
	const API_URL = 'https://api.coingecko.com/api/v3/simple/price';

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

		$ids = array();
		$symbol_to_id = $this->get_id_mapping();

		foreach ( $crypto_currencies as $symbol ) {
			if ( isset( $symbol_to_id[ $symbol ] ) ) {
				$ids[] = $symbol_to_id[ $symbol ];
			}
		}

		if ( empty( $ids ) ) {
			return array();
		}

		$response = wp_remote_get(
			add_query_arg(
				array(
					'ids'            => implode( ',', $ids ),
					'vs_currencies' => strtolower( $base_currency ),
				),
				self::API_URL
			),
			array( 'timeout' => 15 )
		);

		if ( is_wp_error( $response ) ) {
			$this->last_error = $response->get_error_message();
			return false;
		}

		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );

		if ( empty( $data ) ) {
			$this->last_error = __( 'Invalid response from CoinGecko.', 'swift-currency' );
			return false;
		}

		$rates = array();
		$vs_key = strtolower( $base_currency );
		$id_to_symbol = array_flip( $symbol_to_id );

		foreach ( $data as $id => $prices ) {
			if ( isset( $prices[ $vs_key ] ) && isset( $id_to_symbol[ $id ] ) ) {
				$price = (float) $prices[ $vs_key ];
				if ( $price > 0 ) {
					// Normalize to 1 Base = X Target (Invert)
					$rates[ $id_to_symbol[ $id ] ] = 1 / $price;
				}
			}
		}

		if ( empty( $rates ) ) {
			$this->last_error = sprintf(
				/* translators: %s: base currency */
				__( 'No valid price pairs found on CoinGecko for %s.', 'swift-currency' ),
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
	 * Get mapping of symbols to CoinGecko IDs.
	 *
	 * @return array
	 */
	private function get_id_mapping() {
		return apply_filters( 'swiftcurrency_coingecko_id_mapping', array(
			'BTC'  => 'bitcoin',
			'ETH'  => 'ethereum',
			'USDT' => 'tether',
			'BNB'  => 'binancecoin',
			'SOL'  => 'solana',
			'ADA'  => 'cardano',
			'XRP'  => 'ripple',
			'DOT'  => 'polkadot',
			'DOGE' => 'dogecoin',
			'AVAX' => 'avalanche-2',
			'MATIC' => 'matic-network',
			'LTC'  => 'litecoin',
			'SHIB' => 'shiba-inu',
			'TRX'  => 'tron',
			'WBTC' => 'wrapped-bitcoin',
		) );
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
		return __( 'CoinGecko (Crypto)', 'swift-currency' );
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
