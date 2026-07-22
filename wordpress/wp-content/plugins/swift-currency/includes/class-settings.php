<?php

/**
 * Settings Class
 *
 * Handles plugin settings storage, retrieval, and validation.
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
 * Settings class.
 *
 * @class Settings
 * @version 1.0.0
 */
class Settings {

	/**
	 * Settings option name.
	 *
	 * @var string
	 */
	const OPTION_NAME = 'swiftcurrency_settings';

	/**
	 * Cached settings.
	 *
	 * @var array
	 */
	private $settings = null;

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->load_settings();
	}

	/**
	 * Load settings from database.
	 */
	private function load_settings() {
		$this->settings = get_option( self::OPTION_NAME, array() );

		// Ensure all sections exist.
		$this->settings = wp_parse_args(
			$this->settings,
			$this->get_default_settings()
		);
	}

	/**
	 * Get default settings.
	 *
	 * @return array
	 */
	public function get_default_settings() {
		$default_base = function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD';
		$default_base = empty( $default_base ) ? 'USD' : $default_base;
		$defaults = array(
			'version' => SWIFTCURRENCY_VERSION,
			'general' => array(
				'base_currency'        => $default_base,
				'enabled_currencies'   => array( $default_base ),
				'save_user_preference' => true,
			),
			'rates'   => array(
				'provider'               => 'ecb',
				'api_key'                => '',
				'fallback_provider'      => 'manual',
				'auto_update'            => true,
				'update_interval'        => 86400,
				'crypto_provider'        => 'coingecko',
				'crypto_update_interval' => 3600,
				'fallback_rates'         => array(),
			),
			'display' => array(
				'switcher_position'    => 'header',
				'switcher_style'       => 'dropdown',
				'show_flags'           => true,
				'show_currency_code'   => true,
				'show_currency_symbol' => true,
				'show_currency_name'   => false,
				'custom_css'           => '',
			),
			'pricing' => array(
				'rounding_mode'           => 'nearest',
				'decimal_places'          => 2,
				'crypto_rounding_mode'    => 'nearest',
				'crypto_decimal_places'   => 8,
				'price_format'            => '{symbol}{amount}',
				'checkout_multi_currency' => false,
			),
			'advanced' => array(
				'enable_logging'      => false,
				'log_retention_days'  => 30,
				'cache_enabled'       => true,
				'cache_duration'      => 3600,
				'delete_on_uninstall' => false,
			),
		);

		/**
		 * Allow add-ons (e.g. Pro) to append their own settings sections/defaults
		 * without requiring changes to this file.
		 *
		 * @since 1.0.0
		 * @param array $defaults The base plugin defaults.
		 */
		return apply_filters( 'swiftcurrency_default_settings', $defaults );
	}

	/**
	 * Get all settings.
	 *
	 * @return array
	 */
	public function get_all() {
		return $this->settings;
	}

	/**
	 * Get a setting value.
	 *
	 * @param string $section Setting section.
	 * @param string $key     Setting key.
	 * @param mixed  $default Default value.
	 * @return mixed
	 */
	public function get( $section, $key = null, $default = null ) {
		if ( is_null( $key ) ) {
			return isset( $this->settings[ $section ] ) ? $this->settings[ $section ] : $default;
		}

		return isset( $this->settings[ $section ][ $key ] ) ? $this->settings[ $section ][ $key ] : $default;
	}

	/**
	 * Set a setting value.
	 *
	 * @param string $section Setting section.
	 * @param string $key     Setting key.
	 * @param mixed  $value   Setting value.
	 * @return bool
	 */
	public function set( $section, $key, $value ) {
		if ( ! isset( $this->settings[ $section ] ) ) {
			$this->settings[ $section ] = array();
		}

		$this->settings[ $section ][ $key ] = $value;

		return $this->save();
	}

	/**
	 * Set a setting value in memory only (does not save to DB).
	 *
	 * @param string $section Setting section.
	 * @param string $key     Setting key.
	 * @param mixed  $value   Setting value.
	 */
	public function set_memory( $section, $key, $value ) {
		if ( ! isset( $this->settings[ $section ] ) ) {
			$this->settings[ $section ] = array();
		}

		$this->settings[ $section ][ $key ] = $value;
	}

	/**
	 * Update entire section.
	 *
	 * @param string $section Setting section.
	 * @param array  $values  Section values.
	 * @return bool
	 */
	public function update_section( $section, $values ) {
		$this->settings[ $section ] = $values;
		return $this->save();
	}

	/**
	 * Save settings to database.
	 *
	 * @return bool
	 */
	public function save() {
		$result = update_option( self::OPTION_NAME, $this->settings );

		/**
		 * Action hook fired after settings are saved.
		 *
		 * @since 1.0.0
		 * @param array $settings The saved settings.
		 */
		do_action( 'swiftcurrency_settings_saved', $this->settings );

		return $result;
	}

	/**
	 * Reset settings to defaults.
	 *
	 * @return bool
	 */
	public function reset() {
		$this->settings = $this->get_default_settings();
		return $this->save();
	}

	/**
	 * Export settings as JSON.
	 *
	 * @return string
	 */
	public function export() {
		return wp_json_encode( $this->settings, JSON_PRETTY_PRINT );
	}

	/**
	 * Import settings from JSON.
	 *
	 * @param string $json JSON string.
	 * @return bool|WP_Error
	 */
	public function import( $json ) {
		$data = json_decode( $json, true );

		if ( json_last_error() !== JSON_ERROR_NONE ) {
			return new \WP_Error( 'invalid_json', __( 'Invalid JSON format.', 'swift-currency' ) );
		}

		// Validate imported data.
		$validated = $this->validate_settings( $data );

		if ( is_wp_error( $validated ) ) {
			return $validated;
		}

		$this->settings = $validated;
		return $this->save();
	}

	/**
	 * Validate settings.
	 *
	 * @param array $settings Settings to validate.
	 * @return array|WP_Error
	 */
	public function validate_settings( $settings ) {
		if ( ! is_array( $settings ) ) {
			$settings = array();
		}

		$validated = array();
		$defaults  = $this->get_default_settings();

		foreach ( $defaults as $section => $section_defaults ) {
			if ( ! isset( $settings[ $section ] ) ) {
				$validated[ $section ] = isset( $this->settings[ $section ] ) ? $this->settings[ $section ] : $section_defaults;
				continue;
			}

			$validated[ $section ] = $this->validate_section( $section, $settings[ $section ], $section_defaults );
		}

		/**
		 * Allow add-ons (e.g. Pro) to validate and preserve their own settings
		 * sections (e.g. geolocation, payment_gateways) that are not known to
		 * the free plugin.
		 *
		 * @since 1.0.0
		 * @param array $validated The already-validated settings.
		 * @param array $settings  The raw submitted settings array.
		 */
		return apply_filters( 'swiftcurrency_validate_settings', $validated, $settings );
	}

	/**
	 * Validate a specific section.
	 *
	 * @param string $section Section name.
	 * @param array  $values  Sent values.
	 * @param array  $defaults Section defaults.
	 * @return array Validated values.
	 */
	private function validate_section( $section, $values, $defaults ) {
		if ( ! is_array( $values ) ) {
			$values = array();
		}

		$validated = array();

		foreach ( $defaults as $key => $default ) {
			if ( isset( $values[ $key ] ) ) {
				$value = $values[ $key ];
			} else {
				$value = isset( $this->settings[ $section ][ $key ] ) ? $this->settings[ $section ][ $key ] : $default;
			}

			switch ( $section ) {
				case 'general':
					$validated[ $key ] = $this->validate_general_setting( $key, $value );
					break;

				case 'rates':
					$validated[ $key ] = $this->validate_rates_setting( $key, $value );
					break;

				case 'display':
					$validated[ $key ] = $this->validate_display_setting( $key, $value );
					break;

				case 'pricing':
					$validated[ $key ] = $this->validate_pricing_setting( $key, $value );
					break;

				case 'advanced':
					$validated[ $key ] = $this->validate_advanced_setting( $key, $value );
					break;

				default:
					$validated[ $key ] = is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
					break;
			}
		}

		foreach ( $values as $key => $value ) {
			if ( isset( $validated[ $key ] ) ) {
				continue;
			}

			switch ( $section ) {
				case 'display':
					$validated[ $key ] = $this->validate_display_setting( $key, $value );
					break;

				case 'advanced':
					$validated[ $key ] = $this->validate_advanced_setting( $key, $value );
					break;

				default:
					$validated[ $key ] = is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
					break;
			}
		}

		return $validated;
	}

	/**
	 * Validate general settings.
	 *
	 * @param string $key   Setting key.
	 * @param mixed  $value Setting value.
	 * @return mixed
	 */
	private function validate_general_setting( $key, $value ) {
		switch ( $key ) {
			case 'version':
				return sanitize_text_field( (string) $value );

			case 'base_currency':
				return strtoupper( sanitize_key( $value ) );

			case 'enabled_currencies':
				return $this->sanitize_currency_code_array( $value );

			case 'save_user_preference':
				return (bool) $value;

			default:
				return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
		}
	}

	/**
	 * Validate rates settings.
	 *
	 * @param string $key   Setting key.
	 * @param mixed  $value Setting value.
	 * @return mixed
	 */
	private function validate_rates_setting( $key, $value ) {
		$provider_slugs = array( 'ecb', 'manual', 'binance', 'coingecko' );

		switch ( $key ) {
			case 'provider':
			case 'fallback_provider':
				$value = sanitize_key( $value );
				return in_array( $value, $provider_slugs, true ) ? $value : 'manual';

			case 'update_interval':
			case 'crypto_update_interval':
				return $this->sanitize_interval_setting( $value );

			case 'crypto_provider':
				$value = sanitize_key( $value );
				return in_array( $value, array( 'coingecko', 'binance', 'manual' ), true ) ? $value : 'coingecko';

			case 'api_key':
				return sanitize_text_field( $value );

			case 'auto_update':
				return (bool) $value;

			case 'fallback_rates':
				return $this->sanitize_rate_map( $value );

			default:
				return is_scalar( $value ) ? sanitize_text_field( (string) $value ) : array();
		}
	}

	/**
	 * Validate display settings.
	 *
	 * @param string $key   Setting key.
	 * @param mixed  $value Setting value.
	 * @return mixed
	 */
	private function validate_display_setting( $key, $value ) {
		$allowed_styles = array(
			'dropdown',
			'pill_dropdown',
			'list',
			'native_select',
			'buttons',
			'segmented',
			'chips',
			'stack',
			'glass_float',
			'neon',
		);

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
				return sanitize_textarea_field( $value );

			case 'accent_color':
			case 'text_color':
			case 'bg_color':
			case 'hover_color':
			case 'border_color':
				$sanitized = sanitize_hex_color( $value );
				return $sanitized ? $sanitized : '';

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
				return sanitize_text_field( $value );

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
	 * Validate pricing settings.
	 *
	 * @param string $key   Setting key.
	 * @param mixed  $value Setting value.
	 * @return mixed
	 */
	private function validate_pricing_setting( $key, $value ) {
		$allowed_rounding_modes = array( 'nearest', 'up', 'down' );

		switch ( $key ) {
			case 'rounding_mode':
			case 'crypto_rounding_mode':
				$value = sanitize_key( $value );
				return in_array( $value, $allowed_rounding_modes, true ) ? $value : 'nearest';

			case 'price_format':
				return sanitize_text_field( $value );

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
	 * Validate advanced settings.
	 *
	 * @param string $key   Setting key.
	 * @param mixed  $value Setting value.
	 * @return mixed
	 */
	private function validate_advanced_setting( $key, $value ) {
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
	 * Sanitize an array of currency codes.
	 *
	 * @since  1.0.0
	 * @param  mixed $value Raw input (expected to be an array of strings).
	 * @return array        Sanitized array of uppercase ISO 4217 currency codes.
	 */
	private function sanitize_currency_code_array( $value ) {
		$sanitized = array();

		if ( ! is_array( $value ) ) {
			return $sanitized;
		}

		foreach ( $value as $currency_code ) {
			$currency_code = strtoupper( sanitize_key( $currency_code ) );

			if ( '' !== $currency_code ) {
				$sanitized[] = $currency_code;
			}
		}

		return array_values( array_unique( $sanitized ) );
	}

	/**
	 * Sanitize a currency-code-to-rate mapping array.
	 *
	 * @since  1.0.0
	 * @param  mixed $value Raw input (expected to be an associative array).
	 * @return array        Sanitized map of uppercase currency code => float rate.
	 */
	private function sanitize_rate_map( $value ) {
		$sanitized = array();

		if ( ! is_array( $value ) ) {
			return $sanitized;
		}

		foreach ( $value as $currency_code => $rate ) {
			$currency_code = strtoupper( sanitize_key( $currency_code ) );

			if ( '' === $currency_code ) {
				continue;
			}

			$sanitized[ $currency_code ] = (float) $rate;
		}

		return $sanitized;
	}

	/**
	 * Sanitize an update-interval value against the list of registered intervals.
	 *
	 * @since  1.0.0
	 * @param  mixed $value Raw input value (expected integer seconds).
	 * @return int          Validated interval in seconds, or DAY_IN_SECONDS as fallback.
	 */
	private function sanitize_interval_setting( $value ) {
		$interval = absint( $value );
		$allowed  = array_map( 'intval', array_keys( swiftcurrency_get_update_intervals() ) );

		if ( 0 === (int) $value && in_array( 0, $allowed, true ) ) {
			return 0;
		}

		return in_array( $interval, $allowed, true ) ? $interval : DAY_IN_SECONDS;
	}
}
