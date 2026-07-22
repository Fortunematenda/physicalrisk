<?php
/**
 * Manual Rates Provider
 *
 * Fallback provider using manually configured rates.
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
 * Manual Rates Provider class.
 *
 * @class Manual_Rates
 * @version 1.0.0
 */
class Manual_Rates implements Rate_Provider_Interface {

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
	 * Fetch exchange rates.
	 *
	 * @param string $base_currency Base currency code.
	 * @return array|false
	 */
	public function fetch_rates( $base_currency ) {
		$this->last_error = null;

		$manual_rates = $this->settings->get( 'rates', 'fallback_rates', array() );

		if ( empty( $manual_rates ) ) {
			$this->last_error = __( 'No manual rates configured.', 'swift-currency' );
			return false;
		}

		// Check if we have rates for the base currency.
		if ( ! isset( $manual_rates[ $base_currency ] ) ) {
			$this->last_error = sprintf(
				/* translators: %s: currency code */
				__( 'No manual rates configured for base currency %s.', 'swift-currency' ),
				$base_currency
			);
			return false;
		}

		$base_rates = $manual_rates[ $base_currency ];

		// Add base currency itself.
		$base_rates[ $base_currency ] = 1.0;

		return $base_rates;
	}

	/**
	 * Check if provider is available.
	 *
	 * @return bool
	 */
	public function is_available() {
		$manual_rates = $this->settings->get( 'rates', 'fallback_rates', array() );
		return ! empty( $manual_rates );
	}

	/**
	 * Get provider name.
	 *
	 * @return string
	 */
	public function get_provider_name() {
		return __( 'Manual Rates', 'swift-currency' );
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
