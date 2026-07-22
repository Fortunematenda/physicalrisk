<?php
/**
 * European Central Bank (ECB) Rate Provider
 *
 * Free exchange rate provider, no API key required.
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
 * ECB Provider class.
 *
 * @class ECB
 * @version 1.0.0
 */
class ECB implements Rate_Provider_Interface {

	/**
	 * API endpoint URL.
	 *
	 * @var string
	 */
	const API_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

	/**
	 * Last error message.
	 *
	 * @var string|null
	 */
	private $last_error = null;

	/**
	 * Fetch exchange rates.
	 *
	 * @param string $base_currency Base currency code.
	 * @return array|false
	 */
	public function fetch_rates( $base_currency ) {
		$this->last_error = null;

		// ECB only provides EUR-based rates.
		// We'll fetch them and convert if needed.
		$response = wp_remote_get(
			self::API_URL,
			array(
				'timeout' => 15,
				'headers' => array(
					'Accept' => 'application/xml',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			$this->last_error = $response->get_error_message();
			return false;
		}

		$body = wp_remote_retrieve_body( $response );
		if ( empty( $body ) ) {
			$this->last_error = __( 'Empty response from ECB.', 'swift-currency' );
			return false;
		}

		// Parse XML.
		$rates = $this->parse_xml( $body );

		if ( false === $rates ) {
			return false;
		}

		// ECB provides EUR-based rates, add EUR itself.
		$rates['EUR'] = 1.0;

		// If base currency is not EUR, convert all rates.
		if ( 'EUR' !== $base_currency ) {
			$rates = $this->convert_base( $rates, $base_currency );
		}

		return $rates;
	}

	/**
	 * Parse XML response.
	 *
	 * @param string $xml XML string.
	 * @return array|false
	 */
	private function parse_xml( $xml ) {
		// Suppress XML errors.
		libxml_use_internal_errors( true );

		$data = simplexml_load_string( $xml );

		if ( false === $data ) {
			$this->last_error = __( 'Failed to parse XML response.', 'swift-currency' );
			libxml_clear_errors();
			return false;
		}

		$rates = array();

		// Register namespaces
		$data->registerXPathNamespace( 'gesmes', 'http://www.gesmes.org/xml/2002-08-01' );
		$data->registerXPathNamespace( 'ecb', 'http://www.ecb.int/vocabulary/2002-08-01/eurofxref' );

		// Use XPath to get all Cube elements with currency attribute
		$currency_nodes = $data->xpath( '//ecb:Cube[@currency]' );

		if ( $currency_nodes ) {
			foreach ( $currency_nodes as $node ) {
				$currency = (string) $node['currency'];
				$rate = (float) $node['rate'];
				if ( ! empty( $currency ) && $rate > 0 ) {
					$rates[ $currency ] = $rate;
				}
			}
		}

		if ( empty( $rates ) ) {
			$this->last_error = __( 'No rates found in response.', 'swift-currency' );
			return false;
		}

		return $rates;
	}

	/**
	 * Convert rates to different base currency.
	 *
	 * @param array  $rates         EUR-based rates.
	 * @param string $base_currency Target base currency.
	 * @return array|false
	 */
	private function convert_base( $rates, $base_currency ) {
		if ( ! isset( $rates[ $base_currency ] ) ) {
			$this->last_error = sprintf(
				/* translators: %s: currency code */
				__( 'Base currency %s not found in ECB rates.', 'swift-currency' ),
				$base_currency
			);
			return false;
		}

		$base_rate = $rates[ $base_currency ];
		$converted = array();

		foreach ( $rates as $currency => $rate ) {
			$converted[ $currency ] = $rate / $base_rate;
		}

		return $converted;
	}

	/**
	 * Check if provider is available.
	 *
	 * @return bool
	 */
	public function is_available() {
		// ECB is always available (no API key needed).
		return true;
	}

	/**
	 * Get provider name.
	 *
	 * @return string
	 */
	public function get_provider_name() {
		return __( 'European Central Bank (ECB)', 'swift-currency' );
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
