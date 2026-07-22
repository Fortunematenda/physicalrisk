<?php
/**
 * Exchange Rate Provider Interface
 *
 * Interface for all exchange rate providers.
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
 * Rate Provider Interface.
 *
 * @interface Rate_Provider_Interface
 * @version 1.0.0
 */
interface Rate_Provider_Interface {

	/**
	 * Fetch exchange rates from the provider.
	 *
	 * @param string $base_currency Base currency code.
	 * @return array|false Array of rates or false on failure.
	 */
	public function fetch_rates( $base_currency );

	/**
	 * Check if the provider is available and configured.
	 *
	 * @return bool
	 */
	public function is_available();

	/**
	 * Get the provider name.
	 *
	 * @return string
	 */
	public function get_provider_name();

	/**
	 * Check if the provider requires an API key.
	 *
	 * @return bool
	 */
	public function requires_api_key();

	/**
	 * Get the last error message.
	 *
	 * @return string|null
	 */
	public function get_last_error();
}
