<?php

/**
 * Helper Functions
 *
 * Global helper functions for SwiftCurrency.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Get the main SwiftCurrency plugin instance.
 *
 * @since 1.0.0
 * @return \Codeies\SwiftCurrency\SwiftCurrency
 */
if ( ! function_exists( 'swiftcurrency' ) ) {
	/**
	 * Get the main SwiftCurrency plugin instance.
	 *
	 * @since 1.0.0
	 * @return \Codeies\SwiftCurrency\SwiftCurrency
	 */
	function swiftcurrency() {
		return \Codeies\SwiftCurrency\swiftcurrency();
	}
}

/**
 * Get the current active currency code.
 *
 * Falls back to the WooCommerce store currency when the plugin is not ready.
 *
 * @since 1.0.0
 * @return string Currency code (e.g. 'USD').
 */
function swiftcurrency_get_current_currency() {
	$currency_manager = swiftcurrency()->get_currency_manager();

	if ( $currency_manager ) {
		return $currency_manager->get_current_currency();
	}

	return function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD';
}

/**
 * Convert an amount from a source currency to the active (or specified) target currency.
 *
 * Retrieves the canonical exchange rate via swiftcurrency_get_exchange_rate() and
 * multiplies. Same-currency conversions always return the original amount untouched.
 *
 * @since 1.0.0
 * @param float       $amount        Amount to convert.
 * @param string|null $from_currency Source currency code. Defaults to the base currency.
 * @param string|null $to_currency   Target currency code. Defaults to the active currency.
 * @return float Converted amount.
 */
function swiftcurrency_convert_price( $amount, $from_currency = null, $to_currency = null ) {
	$currency_manager = swiftcurrency()->get_currency_manager();

	if ( ! $currency_manager ) {
		return (float) $amount;
	}

	$from = $from_currency ? strtoupper( $from_currency ) : strtoupper( $currency_manager->get_base_currency() );
	$to   = $to_currency   ? strtoupper( $to_currency )   : strtoupper( $currency_manager->get_current_currency() );

	// No conversion needed.
	if ( $from === $to ) {
		return (float) $amount;
	}

	$rate = swiftcurrency_get_exchange_rate( $from, $to );

	// A rate of 0 would wipe out every price — treat it as unavailable.
	if ( $rate <= 0 ) {
		swiftcurrency_log(
			sprintf( 'Invalid exchange rate (%.10f) for %s → %s. Returning original amount.', $rate, $from, $to ),
			'warning'
		);
		return (float) $amount;
	}

	return (float) $amount * $rate;
}

/**
 * Convert and format a price with the active currency symbol (uses wc_price).
 *
 * @since 1.0.0
 * @param float       $amount        Amount to format.
 * @param string|null $from_currency Source currency code. Defaults to the base currency.
 * @param array       $args          Extra arguments passed to wc_price().
 * @return string HTML-formatted price string.
 */
function swiftcurrency_format_price( $amount, $from_currency = null, $args = array() ) {
	$converted = swiftcurrency_convert_price( $amount, $from_currency );
	$currency  = swiftcurrency_get_current_currency();

	$currency_manager = swiftcurrency()->get_currency_manager();
	$decimals         = $currency_manager ? $currency_manager->get_currency_decimals( $currency ) : 2;

	$args = wp_parse_args(
		$args,
		array(
			'currency' => $currency,
			'decimals' => $decimals,
		)
	);

	return wc_price( $converted, $args );
}

/**
 * Get the symbol for a currency.
 *
 * @since 1.0.0
 * @param string|null $currency_code Currency code. Defaults to the active currency.
 * @return string Currency symbol (e.g. '$').
 */
function swiftcurrency_get_currency_symbol( $currency_code = null ) {
	$currency_manager = swiftcurrency()->get_currency_manager();

	if ( ! $currency_manager ) {
		if ( function_exists( 'get_woocommerce_currency_symbol' ) ) {
			return get_woocommerce_currency_symbol( $currency_code );
		}
		return $currency_code ? $currency_code : 'USD';
	}

	$code     = $currency_code ? strtoupper( $currency_code ) : $currency_manager->get_current_currency();
	$currency = $currency_manager->get_currency( $code );

	return $currency ? $currency['symbol'] : $code;
}

/**
 * Get the display name for a currency.
 *
 * @since 1.0.0
 * @param string|null $currency_code Currency code. Defaults to the active currency.
 * @return string Currency name (e.g. 'US Dollar').
 */
function swiftcurrency_get_currency_name( $currency_code = null ) {
	$currency_manager = swiftcurrency()->get_currency_manager();

	if ( ! $currency_manager ) {
		return $currency_code;
	}

	$code     = $currency_code ? strtoupper( $currency_code ) : $currency_manager->get_current_currency();
	$currency = $currency_manager->get_currency( $code );

	return $currency ? $currency['name'] : $code;
}

/**
 * Get the exchange rate from one currency to another.
 *
 * Lookup order: in-memory cache → persistent cache → price converter (DB) → currency manager.
 * The resolved rate is stored back into the cache so subsequent calls in the same
 * request are free. Returns 1.0 only as a last resort, and logs a warning when that
 * happens so the gap is visible in the WooCommerce log.
 *
 * Rates are always expressed as "1 $from = X $to".
 *
 * @since 1.0.0
 * @param string $from Source currency code (e.g. 'USD').
 * @param string $to   Target currency code (e.g. 'EUR').
 * @return float Exchange rate. Returns 1.0 when no rate can be found.
 */
function swiftcurrency_get_exchange_rate( $from, $to ) {
	$from = strtoupper( $from );
	$to   = strtoupper( $to );

	if ( $from === $to ) {
		return 1.0;
	}

	// 1. In-memory request cache (avoids repeated lookups within a single page load).
	static $runtime_cache = array();
	$cache_key = $from . '_' . $to;

	if ( isset( $runtime_cache[ $cache_key ] ) ) {
		return $runtime_cache[ $cache_key ];
	}

	$rate = false;

	// 2. Persistent object cache / transient cache.
	$cache = swiftcurrency()->get_cache();
	if ( $cache ) {
		$cached = $cache->get_rate( $from, $to );
		if ( false !== $cached && is_numeric( $cached ) && (float) $cached > 0 ) {
			$rate = (float) $cached;
		}
	}

	// 3. Price converter (reads from the DB rates table).
	if ( false === $rate ) {
		$price_converter = swiftcurrency()->get_price_converter();
		if ( $price_converter ) {
			$db_rate = $price_converter->get_conversion_rate( $from, $to );
			if ( false !== $db_rate && is_numeric( $db_rate ) && (float) $db_rate > 0 ) {
				$rate = (float) $db_rate;
				// Backfill the persistent cache so future requests skip the DB.
				if ( $cache ) {
					$cache->set_rate( $from, $to, $rate );
				}
			}
		}
	}

	// 4. Currency manager (last resort — may derive from stored settings).
	if ( false === $rate ) {
		$currency_manager = swiftcurrency()->get_currency_manager();
		if ( $currency_manager ) {
			$manager_rate = $currency_manager->get_exchange_rate( $from, $to );
			if ( is_numeric( $manager_rate ) && (float) $manager_rate > 0 ) {
				$rate = (float) $manager_rate;
			}
		}
	}

	if ( false === $rate ) {
		swiftcurrency_log(
			sprintf( 'No exchange rate found for %s → %s. Falling back to 1.0.', $from, $to ),
			'warning'
		);
		$rate = 1.0;
	}

	$runtime_cache[ $cache_key ] = $rate;
	return $rate;
}

/**
 * Get the list of enabled currency codes.
 *
 * Free version supports up to 3 currencies (soft limit - no enforcement).
 *
 * @since 1.0.0
 * @return string[] Array of currency codes.
 */
function swiftcurrency_get_enabled_currencies() {
	$settings = swiftcurrency()->get_settings();

	if ( ! $settings ) {
		return array();
	}

	$enabled = (array) $settings->get( 'general', 'enabled_currencies', array() );

	return $enabled;
}

/**
 * Check whether a currency is in the enabled-currencies list.
 *
 * @since 1.0.0
 * @param string $currency_code Currency code to check.
 * @return bool
 */
function swiftcurrency_is_currency_enabled( $currency_code ) {
	$enabled = swiftcurrency_get_enabled_currencies();
	return in_array( strtoupper( $currency_code ), array_map( 'strtoupper', $enabled ), true );
}

/**
 * Get the WooCommerce base currency configured for this plugin.
 *
 * @since 1.0.0
 * @return string Currency code (e.g. 'USD').
 */
function swiftcurrency_get_base_currency() {
	$wc_currency = function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD';
	$settings    = swiftcurrency()->get_settings();

	if ( ! $settings ) {
		return $wc_currency;
	}

	$base = $settings->get( 'general', 'base_currency', '' );
	return $base ? $base : $wc_currency;
}

/**
 * Switch the active currency for the current session.
 *
 * @since 1.0.0
 * @param string $currency_code Currency code to switch to.
 * @return bool True on success, false when the currency is not enabled.
 */
function swiftcurrency_switch_currency( $currency_code ) {
	if ( ! swiftcurrency_is_currency_enabled( $currency_code ) ) {
		return false;
	}

	do_action( 'swiftcurrency_switch_currency', $currency_code );

	return true;
}

/**
 * Get full currency data for a given code.
 *
 * @since 1.0.0
 * @param string $currency_code Currency code.
 * @return array|false Currency data array, or false if not found.
 */
function swiftcurrency_get_currency_data( $currency_code ) {
	$currency_manager = swiftcurrency()->get_currency_manager();

	if ( ! $currency_manager ) {
		return false;
	}

	return $currency_manager->get_currency( strtoupper( $currency_code ) );
}

/**
 * Trigger an immediate exchange rate update for both fiat and crypto.
 *
 * @since 1.0.0
 */
function swiftcurrency_update_rates_now() {
	do_action( 'swiftcurrency_update_rates' );
	do_action( 'swiftcurrency_update_crypto_rates' );
}

/**
 * Get the timestamp of the last successful rate update.
 *
 * @since 1.0.0
 * @return string|false MySQL datetime string, or false if rates have never been updated.
 */
function swiftcurrency_get_last_update_time() {
	return get_option( 'swiftcurrency_last_rate_update', false );
}

/**
 * Get available update intervals for exchange rates, keyed by their value in seconds.
 *
 * Pro add-ons can register additional intervals via the filter.
 *
 * @since 1.0.0
 * @return array<int,string> Interval in seconds => human-readable label.
 *                           The special key 0 represents "manual / no auto-update".
 */
function swiftcurrency_get_update_intervals() {
	$intervals = array(
		6 * HOUR_IN_SECONDS  => __( 'Every 6 Hours', 'swift-currency' ),
		12 * HOUR_IN_SECONDS => __( 'Every 12 Hours', 'swift-currency' ),
		DAY_IN_SECONDS       => __( 'Daily', 'swift-currency' ),
		0                    => __( 'Manual (No Auto-Update)', 'swift-currency' ),
	);

	/**
	 * Filters the available update intervals.
	 *
	 * Keys are seconds (int). Use 0 for "manual / disabled".
	 *
	 * @since 1.0.0
	 * @param array<int,string> $intervals Available intervals.
	 */
	return apply_filters( 'swiftcurrency_update_intervals', $intervals );
}

/**
 * Check whether exchange rates are due for an update.
 *
 * Compares the last update time against the configured update interval.
 *
 * @since 1.0.0
 * @return bool True when an update is needed.
 */
function swiftcurrency_rates_need_update() {
	$last_update = swiftcurrency_get_last_update_time();

	if ( ! $last_update ) {
		return true;
	}

	$settings        = swiftcurrency()->get_settings();
	$update_interval = $settings ? (int) $settings->get( 'rates', 'update_interval', DAY_IN_SECONDS ) : DAY_IN_SECONDS;

	// 0 means "manual only" — never auto-update.
	if ( 0 === $update_interval ) {
		return false;
	}

	$elapsed = time() - (int) strtotime( $last_update );
	return $elapsed >= $update_interval;
}

/**
 * Check whether the SwiftCurrency Pro add-on is active.
 *
 * Third-party code can override this with the `swiftcurrency_is_pro` filter.
 *
 * @since 1.0.0
 * @return bool True when the Pro add-on is active.
 */
function swiftcurrency_is_pro() {
	$is_pro = \Codeies\SwiftCurrency\Utils::is_pro();

	/**
	 * Filters the Pro status.
	 *
	 * @since 1.0.0
	 * @param bool $is_pro Whether the Pro add-on is active.
	 */
	return apply_filters( 'swiftcurrency_is_pro', $is_pro );
}

/**
 * Get the upgrade URL for the Pro version.
 *
 * @since 1.0.0
 * @param string $source Optional UTM source identifier for tracking.
 * @return string Upgrade URL.
 */
function swiftcurrency_get_upgrade_url( $source = '' ) {
	$url = 'https://codeies.com/account/swiftcurrency/';

	if ( $source ) {
		$url = add_query_arg( 'utm_source', rawurlencode( $source ), $url );
	}

	return $url;
}

/**
 * Log a message to the WooCommerce logger.
 *
 * Logging is a no-op when WC_Logger is unavailable or debug logging is
 * disabled in the plugin settings.
 *
 * @since 1.0.0
 * @param string $message Log message.
 * @param string $level   Log level: debug, info, warning, or error.
 * @param string $source  Log source identifier. Defaults to 'swift-currency'.
 */
function swiftcurrency_log( $message, $level = 'info', $source = 'swift-currency' ) {
	if ( ! class_exists( 'WC_Logger' ) ) {
		return;
	}

	$settings = swiftcurrency()->get_settings();
	if ( $settings && ! $settings->get( 'advanced', 'enable_logging', false ) ) {
		return;
	}

	wc_get_logger()->log( $level, $message, array( 'source' => $source ) );
}

/**
 * Sanitize callback for register_setting().
 *
 * @since 1.0.3
 * @param mixed $input Raw settings submitted via the admin form.
 * @return array Sanitized settings safe for database storage.
 */
function swiftcurrency_sanitize_settings( $input ) {
	if ( ! is_array( $input ) ) {
		return array();
	}

	$sanitized = array();
	$settings  = swiftcurrency()->get_settings();
	$defaults  = $settings ? $settings->get_default_settings() : array();

	// Use the currently saved option as fallback so that sections not present
	// in the current tab's POST (e.g. saving Display doesn't wipe General).
	$current = get_option( 'swiftcurrency_settings', array() );

	foreach ( $defaults as $section => $section_defaults ) {
		if ( ! isset( $input[ $section ] ) || ! is_array( $input[ $section ] ) ) {
			// Preserve the existing saved value; fall back to hardcoded default only
			// when nothing has ever been saved (fresh install).
			$sanitized[ $section ] = isset( $current[ $section ] ) ? $current[ $section ] : $section_defaults;
			continue;
		}

		$sanitized[ $section ] = swiftcurrency_sanitize_section( $section, $input[ $section ], $section_defaults );
	}

	/** Allow the Pro add-on to sanitize its own sections (e.g. geolocation, payment_gateways). */
	return apply_filters( 'swiftcurrency_validate_settings', $sanitized, $input );
}

/**
 * Sanitize a single settings section.
 *
 * Every value is passed through the appropriate WordPress sanitization
 * function — no raw user input reaches the database.
 *
 * @since 1.0.3
 * @param string $section  Section key (general, rates, display, pricing, advanced).
 * @param array  $values   Raw submitted values for this section.
 * @param array  $defaults Default values for this section.
 * @return array Sanitized section values.
 */
function swiftcurrency_sanitize_section( $section, $values, $defaults ) {
	$sanitized = array();

	// Read the currently saved option so we can preserve fields that were
	// not included in the current tab's form submission (e.g. saving the
	// Geolocation tab must not wipe out `enabled_currencies` in General).
	$current = get_option( 'swiftcurrency_settings', array() );

	// First pass: every key present in defaults.
	foreach ( $defaults as $key => $default ) {
		if ( isset( $values[ $key ] ) ) {
			$value = $values[ $key ];
		} elseif ( isset( $current[ $section ][ $key ] ) ) {
			// Key was not submitted — preserve the stored value.
			$value = $current[ $section ][ $key ];
		} else {
			// Nothing stored yet (fresh install) — use the hardcoded default.
			$value = $default;
		}

		switch ( $section ) {
			case 'general':
				$sanitized[ $key ] = swiftcurrency_sanitize_general_field( $key, $value );
				break;
			case 'rates':
				$sanitized[ $key ] = swiftcurrency_sanitize_rates_field( $key, $value );
				break;
			case 'display':
				$sanitized[ $key ] = swiftcurrency_sanitize_display_field( $key, $value );
				break;
			case 'pricing':
				$sanitized[ $key ] = swiftcurrency_sanitize_pricing_field( $key, $value );
				break;
			case 'advanced':
				$sanitized[ $key ] = swiftcurrency_sanitize_advanced_field( $key, $value );
				break;
			default:
				$sanitized[ $key ] = is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
				break;
		}
	}

	// Second pass: extra keys submitted but not in defaults (e.g. dynamic
	// display keys such as loc_style_header, loc_flags_footer, etc.).
	foreach ( $values as $key => $value ) {
		if ( isset( $sanitized[ $key ] ) ) {
			continue;
		}

		switch ( $section ) {
			case 'display':
				$sanitized[ $key ] = swiftcurrency_sanitize_display_field( $key, $value );
				break;
			case 'advanced':
				$sanitized[ $key ] = swiftcurrency_sanitize_advanced_field( $key, $value );
				break;
			default:
				$sanitized[ $key ] = is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
				break;
		}
	}

	return $sanitized;
}

/**
 * Sanitize a general-section field.
 *
 * @param string $key   Field key.
 * @param mixed  $value Raw value.
 * @return mixed Sanitized value.
 */
function swiftcurrency_sanitize_general_field( $key, $value ) {
	switch ( $key ) {
		case 'base_currency':
			return strtoupper( sanitize_key( $value ) );

		case 'enabled_currencies':
			if ( ! is_array( $value ) ) {
				return array();
			}
			return array_values( array_unique( array_filter( array_map(
				function ( $code ) {
					return strtoupper( sanitize_key( $code ) );
				},
				$value
			) ) ) );

		case 'save_user_preference':
			return (bool) $value;

		default:
			return sanitize_text_field( (string) $value );
	}
}

/**
 * Sanitize a rates-section field.
 *
 * @param string $key   Field key.
 * @param mixed  $value Raw value.
 * @return mixed Sanitized value.
 */
function swiftcurrency_sanitize_rates_field( $key, $value ) {
	switch ( $key ) {
		case 'provider':
		case 'fallback_provider':
			$value = sanitize_key( $value );
			// Allow the free built-in slugs plus any slug registered by Pro
			// add-ons (e.g. 'exchangerate-api', 'openexchangerates', 'fixer',
			// 'currencylayer'). We apply the same filter used by the factory
			// so the allowlist stays in sync automatically.
			$free_slugs   = array( 'ecb', 'manual', 'binance', 'coingecko' );
			$pro_slugs    = array_keys( (array) apply_filters( 'swiftcurrency_registered_rate_providers', array() ) );
			$allowed      = array_merge( $free_slugs, $pro_slugs );
			if ( in_array( $value, $allowed, true ) ) {
				return $value;
			}
			// Unknown slug — keep the previously-saved value rather than
			// silently downgrading to 'manual'.
			$current = get_option( 'swiftcurrency_settings', array() );
			$saved   = isset( $current['rates'][ $key ] ) ? $current['rates'][ $key ] : 'manual';
			return sanitize_key( $saved );

		case 'crypto_provider':
			$value = sanitize_key( $value );
			return in_array( $value, array( 'coingecko', 'binance', 'manual' ), true ) ? $value : 'coingecko';

		case 'update_interval':
		case 'crypto_update_interval':
			$value     = absint( $value );
			$intervals = array_keys( swiftcurrency_get_update_intervals() );
			return in_array( $value, $intervals, true ) ? $value : DAY_IN_SECONDS;

		case 'api_key':
			return sanitize_text_field( (string) $value );

		case 'auto_update':
			return (bool) $value;

		case 'fallback_rates':
			if ( ! is_array( $value ) ) {
				return array();
			}
			$rates = array();
			foreach ( $value as $code => $rate ) {
				$code = strtoupper( sanitize_key( $code ) );
				if ( '' !== $code ) {
					$rates[ $code ] = (float) $rate;
				}
			}
			return $rates;

		default:
			return sanitize_text_field( (string) $value );
	}
}

/**
 * Sanitize a display-section field.
 *
 * @param string $key   Field key.
 * @param mixed  $value Raw value.
 * @return mixed Sanitized value.
 */
function swiftcurrency_sanitize_display_field( $key, $value ) {
	$allowed_styles = array( 'dropdown', 'pill_dropdown', 'list', 'native_select', 'buttons', 'segmented', 'chips', 'stack', 'glass_float', 'neon' );

	switch ( $key ) {
		case 'switcher_position':
			$value = sanitize_key( $value );
			return in_array( $value, array( 'header', 'footer', 'shortcode', 'widget' ), true ) ? $value : 'header';

		case 'switcher_style':
			$value = sanitize_key( $value );
			return in_array( $value, $allowed_styles, true ) ? $value : 'dropdown';

		case 'show_flags':
		case 'show_currency_code':
		case 'show_currency_symbol':
		case 'show_currency_name':
		case 'placement_header':
		case 'placement_nav':
		case 'placement_cart':
		case 'placement_footer':
		case 'placement_sticky':
			return (bool) $value;

		case 'custom_css':
			return sanitize_textarea_field( (string) $value );

		case 'accent_color':
		case 'text_color':
		case 'bg_color':
		case 'hover_color':
		case 'border_color':
			$color = sanitize_hex_color( $value );
			return $color ? $color : '';

		case 'font_size':
		case 'border_radius':
		case 'border_width':
		case 'padding':
			return absint( $value );

		case 'sticky_side':
			$value = sanitize_key( $value );
			return in_array( $value, array( 'left', 'right' ), true ) ? $value : 'right';

		case 'sticky_offset':
			return min( 98, absint( $value ) );

		case 'sticky_label':
			return sanitize_text_field( (string) $value );

		default:
			if ( preg_match( '/^loc_style_/', $key ) ) {
				$value = sanitize_key( $value );
				return in_array( $value, array_merge( array( '' ), $allowed_styles ), true ) ? $value : '';
			}
			if ( preg_match( '/^loc_(flags|code|symbol|name)_/', $key ) ) {
				return (bool) $value;
			}
			return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
	}
}

/**
 * Sanitize a pricing-section field.
 *
 * @param string $key   Field key.
 * @param mixed  $value Raw value.
 * @return mixed Sanitized value.
 */
function swiftcurrency_sanitize_pricing_field( $key, $value ) {
	switch ( $key ) {
		case 'rounding_mode':
		case 'crypto_rounding_mode':
			$value = sanitize_key( $value );
			return in_array( $value, array( 'nearest', 'up', 'down' ), true ) ? $value : 'nearest';

		case 'price_format':
			return sanitize_text_field( (string) $value );

		case 'decimal_places':
			return min( 6, absint( $value ) );

		case 'crypto_decimal_places':
			return min( 18, absint( $value ) );

		case 'checkout_multi_currency':
			return (bool) $value;

		default:
			return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
	}
}

/**
 * Sanitize an advanced-section field.
 *
 * @param string $key   Field key.
 * @param mixed  $value Raw value.
 * @return mixed Sanitized value.
 */
function swiftcurrency_sanitize_advanced_field( $key, $value ) {
	switch ( $key ) {
		case 'cache_enabled':
		case 'enable_logging':
		case 'delete_on_uninstall':
			return (bool) $value;

		case 'cache_duration':
		case 'log_retention_days':
			return absint( $value );

		default:
			return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
	}
}

/**
 * Normalize an exchange rate to ensure it is a valid floating-point number.
 *
 * @since 1.0.0
 * @param float|string $rate          The raw exchange rate.
 * @param string       $currency_code Target currency code.
 * @param string       $base_currency Base currency code.
 * @return float Normalized rate.
 */
function swiftcurrency_normalize_rate( $rate, $currency_code, $base_currency ) {
	$rate = (float) $rate;

	if ( $rate <= 0 ) {
		return $rate;
	}

	/**
	 * Filter the normalized rate.
	 *
	 * @since 1.0.0
	 * @param float  $rate          The initialized and float-casted rate.
	 * @param string $currency_code Target currency code.
	 * @param string $base_currency Base currency code.
	 */
	return (float) apply_filters( 'swiftcurrency_normalize_rate', $rate, $currency_code, $base_currency );
}
