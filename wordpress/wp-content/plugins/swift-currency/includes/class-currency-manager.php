<?php

/**
 * Currency Manager Class
 *
 * Manages currency data, operations, and formatting.
 *
 * @package SwiftCurrency
 * @since   1.0.0
 */

namespace Codeies\SwiftCurrency;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Currency Manager class.
 *
 * @class   Currency_Manager
 * @version 1.0.0
 */
class Currency_Manager {

	/**
	 * Settings instance.
	 *
	 * @var Settings|null
	 */
	private $settings;

	/**
	 * Currencies available for this instance (base set + custom).
	 *
	 * @var array<string, array>
	 */
	private $currencies = array();

	/**
	 * Process-level cache for the decoded currencies JSON.
	 * Populated once per PHP process to avoid repeated file I/O and json_decode calls.
	 *
	 * @var array<string, array>|null
	 */
	private static $currency_data = null;

	// -------------------------------------------------------------------------
	// Boot
	// -------------------------------------------------------------------------

	/**
	 * Constructor.
	 *
	 * @param Settings|null $settings Settings instance.
	 */
	public function __construct( $settings ) {
		$this->settings = $settings;
		$this->load_currencies();
	}

	/**
	 * Load currencies from the JSON file, merging in any site-specific custom
	 * currencies stored in the database.
	 *
	 * The JSON is parsed only once per PHP process (static cache).
	 */
	private function load_currencies(): void {
		if ( null === self::$currency_data ) {
			$file = SWIFTCURRENCY_PLUGIN_DIR . 'includes/data/currencies.json';

			if ( file_exists( $file ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
				$decoded = json_decode( file_get_contents( $file ), true );
				self::$currency_data = ( is_array( $decoded ) && $decoded ) ? $decoded : null;
			}

			if ( null === self::$currency_data ) {
				self::$currency_data = $this->get_fallback_currencies();
			}
		}

		$this->currencies = self::$currency_data;

		// Merge site-specific custom currencies stored in the DB.
		$custom = get_option( 'swiftcurrency_custom_currencies', array() );
		if ( is_array( $custom ) && $custom ) {
			foreach ( $custom as $code => $data ) {
				$code = strtoupper( $code );
				if ( $this->validate_currency_code( $code ) && is_array( $data ) ) {
					$this->currencies[ $code ] = $data;
				}
			}
		}

		/**
		 * Filter available currencies.
		 *
		 * @since 1.0.0
		 * @param array<string, array> $currencies Array of currency data keyed by code.
		 */
		$this->currencies = apply_filters( 'swiftcurrency_available_currencies', $this->currencies );
	}

	// -------------------------------------------------------------------------
	// Read – currencies
	// -------------------------------------------------------------------------

	/**
	 * Get all available currencies.
	 *
	 * @return array<string, array>
	 */
	public function get_all_currencies(): array
	{
		return $this->currencies;
	}

	/**
	 * Get enabled currencies.
	 *
	 * Free version supports up to 3 currencies (soft limit - no enforcement).
	 *
	 * @return array<string, array>
	 */
	public function get_enabled_currencies(): array {
		if ( ! $this->settings ) {
			return array();
		}

		$enabled_codes = $this->settings->get( 'general', 'enabled_currencies', array() );

		$enabled = array();
		foreach ( $enabled_codes as $code ) {
			$code = strtoupper( $code );
			if ( isset( $this->currencies[ $code ] ) ) {
				$enabled[ $code ] = $this->currencies[ $code ];
			}
		}

		/**
		 * Filter enabled currencies.
		 *
		 * @since 1.0.0
		 * @param array<string, array> $enabled Enabled currencies keyed by code.
		 */
		$enabled = apply_filters( 'swiftcurrency_enabled_currencies', $enabled );

		return $enabled;
	}

	/**
	 * Get data for a specific currency.
	 *
	 * @param  string $code Currency code (case-insensitive).
	 * @return array|null   Currency data array, or null if not found.
	 */
	public function get_currency(string $code): ?array
	{
		$code = strtoupper($code);
		return $this->currencies[$code] ?? null;
	}

	/**
	 * Check whether a currency exists in the available set.
	 *
	 * @param  string $code Currency code (case-insensitive).
	 * @return bool
	 */
	public function currency_exists(string $code): bool
	{
		return isset($this->currencies[strtoupper($code)]);
	}

	/**
	 * Check whether a currency is currently enabled.
	 *
	 * @param  string $code Currency code (case-insensitive).
	 * @return bool
	 */
	public function is_currency_enabled(string $code): bool
	{
		return isset($this->get_enabled_currencies()[strtoupper($code)]);
	}

	// -------------------------------------------------------------------------
	// Base / current currency
	// -------------------------------------------------------------------------

	/**
	 * Get the configured base currency code.
	 *
	 * Falls back to the WooCommerce currency, then 'USD'.
	 *
	 * @return string
	 */
	public function get_base_currency(): string {
		if ( $this->settings ) {
			$base = $this->settings->get( 'general', 'base_currency', '' );
			if ( $base ) {
				return $base;
			}
		}

		return function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD';
	}

	/**
	 * Set the base currency.
	 *
	 * @param  string $code Currency code.
	 * @return bool         True on success, false if the currency does not exist
	 *                      or settings are unavailable.
	 */
	public function set_base_currency( string $code ): bool {
		if ( ! $this->settings || ! $this->currency_exists( $code ) ) {
			return false;
		}

		return $this->settings->set( 'general', 'base_currency', strtoupper( $code ) );
	}

	/**
	 * Get the currency currently selected by the user.
	 *
	 * Priority: cookie › WC session › base currency.
	 *
	 * The cookie is the authoritative source of the user's persistent preference.
	 * The WC session acts as a fallback for the very first visit (cookie not yet set).
	 *
	 * @return string Current currency code.
	 */
	public function get_current_currency(): string {
		$currency = $this->get_base_currency();

		// --- Cookie (persistent user preference) ---
		if ( isset( $_COOKIE['swiftcurrency_selected'] ) ) {
			// Sanitize and enforce the ISO 4217 format before any further processing.
			$cookie = strtoupper( sanitize_text_field( wp_unslash( $_COOKIE['swiftcurrency_selected'] ) ) );
			if ( $this->validate_currency_code( $cookie ) && $this->is_currency_enabled( $cookie ) ) {
				$currency = $cookie;
			}
		}
		// --- WC session fallback ---
		elseif ( function_exists( 'WC' ) && WC()->session ) {
			$session = WC()->session->get( 'swiftcurrency_current' );
			if ( $session && $this->is_currency_enabled( $session ) ) {
				$currency = $session;
			}
		}

		/**
		 * Filter the current active currency code.
		 *
		 * @since 1.0.4
		 * @param string $currency Current currency code.
		 */
		return apply_filters( 'swiftcurrency_current_currency', $currency );
	}

	// -------------------------------------------------------------------------
	// Currency meta helpers
	// -------------------------------------------------------------------------

	/**
	 * Get the display symbol for a currency.
	 *
	 * @param  string $code Currency code.
	 * @return string       Symbol, or the code itself if no symbol is defined.
	 */
	public function get_currency_symbol(string $code): string
	{
		$currency = $this->get_currency($code);
		return $currency['symbol'] ?? $code;
	}

	/**
	 * Get the human-readable name for a currency.
	 *
	 * @param  string $code Currency code.
	 * @return string       Name, or the code itself if no name is defined.
	 */
	public function get_currency_name(string $code): string
	{
		$currency = $this->get_currency($code);
		return $currency['name'] ?? $code;
	}

	/**
	 * Check whether a currency is a cryptocurrency.
	 *
	 * @param  string $code Currency code.
	 * @return bool
	 */
	public function is_crypto(string $code): bool
	{
		$currency = $this->get_currency($code);
		return isset($currency['type']) && 'crypto' === $currency['type'];
	}

	/**
	 * Get the number of decimal places for a currency.
	 *
	 * Crypto currencies use the 'crypto_decimal_places' setting; fiat currencies
	 * use 'decimal_places'. Falls back to the value stored in the currency data.
	 *
	 * @since 1.0.0
	 * @param  string $code Currency code.
	 * @return int
	 */
	public function get_currency_decimals(string $code): int
	{
		$currency = $this->get_currency($code);
		$is_crypto = isset($currency['type']) && 'crypto' === $currency['type'];

		if ($this->settings) {
			$setting_key = $is_crypto ? 'crypto_decimal_places' : 'decimal_places';
			$default     = $is_crypto ? 8 : 2;
			$decimals    = (int) $this->settings->get('pricing', $setting_key, $default);
		} else {
			$decimals = isset($currency['decimals']) ? (int) $currency['decimals'] : 2;
		}

		/**
		 * Filter currency decimal places.
		 *
		 * @param int    $decimals Decimal places.
		 * @param string $code     Currency code.
		 */
		return (int) apply_filters('swiftcurrency_currency_decimals', $decimals, $code);
	}

	/**
	 * Get the thousands separator for a currency.
	 *
	 * @param  string $code Currency code.
	 * @return string
	 */
	public function get_thousand_separator(string $code): string
	{
		$currency = $this->get_currency($code);
		return $currency['thousand_separator'] ?? ',';
	}

	/**
	 * Get the decimal separator for a currency.
	 *
	 * @param  string $code Currency code.
	 * @return string
	 */
	public function get_decimal_separator(string $code): string
	{
		$currency = $this->get_currency($code);
		return $currency['decimal_separator'] ?? '.';
	}

	// -------------------------------------------------------------------------
	// Formatting
	// -------------------------------------------------------------------------

	/**
	 * Format an amount for a specific currency.
	 *
	 * @param  float  $amount         Amount to format.
	 * @param  string $currency_code  Currency code.
	 * @param  bool   $include_symbol Whether to prepend/append the currency symbol.
	 * @return string                 Formatted price string.
	 */
	public function format_price( float $amount, string $currency_code, bool $include_symbol = true ): string {
		$currency = $this->get_currency( $currency_code );

		if ( ! $currency ) {
			return number_format( $amount, 2 );
		}

		$formatted = number_format(
			$amount,
			$this->get_currency_decimals( $currency_code ),
			$this->get_decimal_separator( $currency_code ),
			$this->get_thousand_separator( $currency_code )
		);

		if ( $include_symbol ) {
			$symbol   = $this->get_currency_symbol( $currency_code );
			$position = $currency['symbol_position'] ?? 'left';

			$formatted = match ( $position ) {
				'left_space'  => $symbol . ' ' . $formatted,
				'right'       => $formatted . $symbol,
				'right_space' => $formatted . ' ' . $symbol,
				default       => $symbol . $formatted,   // 'left' and any unknown value
			};
		}

		/**
		 * Filter the formatted price string.
		 *
		 * @since 1.0.0
		 * @param string $formatted     Formatted price string.
		 * @param float  $amount        Original amount.
		 * @param string $currency_code Currency code.
		 */
		return apply_filters( 'swiftcurrency_formatted_price', $formatted, $amount, $currency_code );
	}

	// -------------------------------------------------------------------------
	// Write – currencies
	// -------------------------------------------------------------------------

	/**
	 * Add a custom currency to the available set for this request.
	 *
	 * The currency is NOT persisted to the database here; persistence is handled
	 * by the caller (e.g. via update_option( 'swiftcurrency_custom_currencies' )).
	 *
	 * @param  string               $code Currency code (will be uppercased).
	 * @param  array<string, mixed> $data Currency data. Required keys: name, symbol, decimals.
	 * @return bool                       True on success, false on validation failure.
	 */
	public function add_currency( string $code, array $data ): bool {
		$code = strtoupper( $code );

		if ( ! $this->validate_currency_code( $code ) ) {
			return false;
		}

		foreach ( array( 'name', 'symbol', 'decimals' ) as $field ) {
			if ( ! isset( $data[ $field ] ) ) {
				return false;
			}
		}

		$this->currencies[ $code ] = wp_parse_args(
			$data,
			array(
				'decimal_separator'  => '.',
				'thousand_separator' => ',',
				'symbol_position'    => 'left',
			)
		);

		/**
		 * Fires after a currency is added to the available set.
		 *
		 * @since 1.0.0
		 * @param string               $code Currency code.
		 * @param array<string, mixed> $data Currency data.
		 */
		do_action( 'swiftcurrency_currency_added', $code, $this->currencies[ $code ] );

		return true;
	}

	/**
	 * Remove a currency from the available set.
	 *
	 * The base currency cannot be removed.
	 *
	 * @param  string $code Currency code.
	 * @return bool         True on success, false if the currency was not found
	 *                      or is the base currency.
	 */
	public function remove_currency( string $code ): bool {
		$code = strtoupper( $code );

		if ( $code === $this->get_base_currency() || ! isset( $this->currencies[ $code ] ) ) {
			return false;
		}

		unset( $this->currencies[ $code ] );

		/**
		 * Fires after a currency is removed from the available set.
		 *
		 * @since 1.0.0
		 * @param string $code Currency code.
		 */
		do_action( 'swiftcurrency_currency_removed', $code );

		return true;
	}

	/**
	 * Enable a currency.
	 *
	 * @param  string $code Currency code.
	 * @return bool
	 */
	public function enable_currency( string $code ): bool {
		$code = strtoupper( $code );

		if ( ! $this->settings || ! $this->validate_currency_code( $code ) || ! $this->currency_exists( $code ) ) {
			return false;
		}

		$enabled = $this->settings->get( 'general', 'enabled_currencies', array() );

		if ( in_array( $code, $enabled, true ) ) {
			return true; // Already enabled.
		}

		$enabled[] = $code;
		return $this->settings->set( 'general', 'enabled_currencies', $enabled );
	}

	/**
	 * Disable a currency.
	 *
	 * The base currency cannot be disabled.
	 *
	 * @param  string $code Currency code.
	 * @return bool
	 */
	public function disable_currency( string $code ): bool {
		$code = strtoupper( $code );

		if ( ! $this->settings || $code === $this->get_base_currency() ) {
			return false;
		}

		$enabled = $this->settings->get( 'general', 'enabled_currencies', array() );
		$key     = array_search( $code, $enabled, true );

		if ( false === $key ) {
			return true; // Already disabled.
		}

		unset( $enabled[ $key ] );
		return $this->settings->set( 'general', 'enabled_currencies', array_values( $enabled ) );
	}

	// -------------------------------------------------------------------------
	// Exchange rates
	// -------------------------------------------------------------------------

	/**
	 * Get the exchange rate between two currencies.
	 *
	 * Both rates are fetched relative to the base currency. When either
	 * currency is the base, its rate is implicitly 1.0.
	 *
	 * Cross-pair formula:  rate = to_rate / from_rate
	 *
	 * @param  string $from Source currency code.
	 * @param  string $to   Target currency code.
	 * @return float        Exchange rate (1.0 on same-currency or missing data).
	 */
	public function get_exchange_rate(string $from, string $to): float
	{
		$from = strtoupper($from);
		$to   = strtoupper($to);

		if ($from === $to) {
			return 1.0;
		}

		$base      = $this->get_base_currency();
		$from_rate = $this->fetch_stored_rate($from, $base);
		$to_rate   = $this->fetch_stored_rate($to, $base);

		$calculated = (null !== $from_rate && null !== $to_rate && $from_rate > 0.0)
			? $to_rate / $from_rate
			: 1.0;

		/**
		 * Filter the calculated exchange rate.
		 *
		 * @since 1.0.0
		 * @param float  $calculated Calculated rate.
		 * @param string $from       Source currency code.
		 * @param string $to         Target currency code.
		 */
		return (float) apply_filters('swiftcurrency_exchange_rate', $calculated, $from, $to);
	}

	/**
	 * Fetch a single stored exchange rate from the database.
	 *
	 * Returns 1.0 when $code is the base currency (its rate is always 1 by
	 * definition), or null when no row exists for the given code.
	 *
	 * The table name is constructed entirely from $wpdb->prefix (a trusted
	 * WordPress internal) plus a hard-coded string suffix — no user-supplied
	 * data ever touches the table name, so no escaping is needed there.
	 * The currency code is bound safely via a %s placeholder in prepare().
	 *
	 * @param  string $code The currency code to look up.
	 * @param  string $base The site's base currency code.
	 * @return float|null   Stored rate, 1.0 for base, or null if not found.
	 */
	private function fetch_stored_rate(string $code, string $base): ?float
	{
		if ($code === $base) {
			return 1.0;
		}

		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$value = $wpdb->get_var(
			$wpdb->prepare(
				'SELECT exchange_rate FROM ' . $wpdb->prefix . 'swiftcurrency_rates WHERE currency_code = %s',
				$code
			)
		);

		return (null !== $value) ? (float) $value : null;
	}

	// -------------------------------------------------------------------------
	// Validation
	// -------------------------------------------------------------------------

	/**
	 * Validate that a string is a well-formed ISO 4217 currency code.
	 *
	 * A valid code is exactly 3 uppercase ASCII letters (A–Z).
	 *
	 * @param  string $code Value to validate.
	 * @return bool
	 */
	public function validate_currency_code(string $code): bool
	{
		return (bool) preg_match('/^[A-Z]{3}$/', $code);
	}

	// -------------------------------------------------------------------------
	// Fallback data
	// -------------------------------------------------------------------------

	/**
	 * Minimal hard-coded currency set used when the JSON data file is missing.
	 *
	 * @return array<string, array>
	 */
	private function get_fallback_currencies(): array
	{
		return array(
			'USD' => array(
				'name'               => 'US Dollar',
				'symbol'             => '$',
				'decimals'           => 2,
				'decimal_separator'  => '.',
				'thousand_separator' => ',',
				'symbol_position'    => 'left',
			),
			'EUR' => array(
				'name'               => 'Euro',
				'symbol'             => '€',
				'decimals'           => 2,
				'decimal_separator'  => ',',
				'thousand_separator' => '.',
				'symbol_position'    => 'left',
			),
			'GBP' => array(
				'name'               => 'British Pound',
				'symbol'             => '£',
				'decimals'           => 2,
				'decimal_separator'  => '.',
				'thousand_separator' => ',',
				'symbol_position'    => 'left',
			),
			'JPY' => array(
				'name'               => 'Japanese Yen',
				'symbol'             => '¥',
				'decimals'           => 0,
				'decimal_separator'  => '.',
				'thousand_separator' => ',',
				'symbol_position'    => 'left',
			),
			'AUD' => array(
				'name'               => 'Australian Dollar',
				'symbol'             => 'A$',
				'decimals'           => 2,
				'decimal_separator'  => '.',
				'thousand_separator' => ',',
				'symbol_position'    => 'left',
			),
			'CAD' => array(
				'name'               => 'Canadian Dollar',
				'symbol'             => 'C$',
				'decimals'           => 2,
				'decimal_separator'  => '.',
				'thousand_separator' => ',',
				'symbol_position'    => 'left',
			),
		);
	}
}
