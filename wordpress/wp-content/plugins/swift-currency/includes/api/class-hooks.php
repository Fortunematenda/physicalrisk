<?php
/**
 * Hooks Class
 *
 * Provides custom filters and actions for developers.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency\API;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Hooks class.
 *
 * @class Hooks
 * @version 1.0.0
 */
class Hooks {

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * Currency Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Constructor.
	 *
	 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
	 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
	 */
	public function __construct( $settings, $currency_manager ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->init_hooks();
	}

	/**
	 * Initialize hooks.
	 */
	private function init_hooks() {
		// Add custom hooks that developers can use.
		add_action( 'swiftcurrency_init', array( $this, 'trigger_init' ) );
	}

	/**
	 * Trigger init action.
	 */
	public function trigger_init() {
		/**
		 * Fires when SwiftCurrency is initialized.
		 *
		 * @since 1.0.0
		 *
		 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
		 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
		 */
		do_action( 'swiftcurrency_initialized', $this->settings, $this->currency_manager );
	}

	/**
	 * Apply custom price filter.
	 *
	 * @param float  $price       Price.
	 * @param string $currency    Currency code.
	 * @param int    $product_id  Product ID.
	 * @return float Filtered price.
	 */
	public static function apply_price_filter( $price, $currency, $product_id = 0 ) {
		/**
		 * Filter the converted price.
		 *
		 * @since 1.0.0
		 *
		 * @param float  $price      Converted price.
		 * @param string $currency   Currency code.
		 * @param int    $product_id Product ID.
		 */
		return apply_filters( 'swiftcurrency_converted_price', $price, $currency, $product_id );
	}

	/**
	 * Apply exchange rate filter.
	 *
	 * @param float  $rate Rate.
	 * @param string $from From currency.
	 * @param string $to   To currency.
	 * @return float Filtered rate.
	 */
	public static function apply_rate_filter( $rate, $from, $to ) {
		/**
		 * Filter the exchange rate.
		 *
		 * @since 1.0.0
		 *
		 * @param float  $rate Exchange rate.
		 * @param string $from From currency code.
		 * @param string $to   To currency code.
		 */
		return apply_filters( 'swiftcurrency_exchange_rate', $rate, $from, $to );
	}

	/**
	 * Apply currency list filter.
	 *
	 * @param array $currencies Currencies array.
	 * @return array Filtered currencies.
	 */
	public static function apply_currencies_filter( $currencies ) {
		/**
		 * Filter the available currencies.
		 *
		 * @since 1.0.0
		 *
		 * @param array $currencies Array of currencies.
		 */
		return apply_filters( 'swiftcurrency_available_currencies', $currencies );
	}

	/**
	 * Trigger currency switch action.
	 *
	 * @param string $old_currency Old currency.
	 * @param string $new_currency New currency.
	 */
	public static function trigger_currency_switch( $old_currency, $new_currency ) {
		/**
		 * Fires before currency is switched.
		 *
		 * @since 1.0.0
		 *
		 * @param string $old_currency Previous currency code.
		 * @param string $new_currency New currency code.
		 */
		do_action( 'swiftcurrency_before_currency_switch', $old_currency, $new_currency );

		// Switch happens here...

		/**
		 * Fires after currency is switched.
		 *
		 * @since 1.0.0
		 *
		 * @param string $old_currency Previous currency code.
		 * @param string $new_currency New currency code.
		 */
		do_action( 'swiftcurrency_after_currency_switch', $old_currency, $new_currency );
	}

	/**
	 * Trigger rate update action.
	 *
	 * @param string $currency Currency code.
	 * @param float  $rate     Exchange rate.
	 */
	public static function trigger_rate_update( $currency, $rate ) {
		/**
		 * Fires when exchange rate is updated.
		 *
		 * @since 1.0.0
		 *
		 * @param string $currency Currency code.
		 * @param float  $rate     New exchange rate.
		 */
		do_action( 'swiftcurrency_rate_updated', $currency, $rate );
	}

	/**
	 * Apply geolocation filter.
	 *
	 * @param array $location Location data.
	 * @return array Filtered location.
	 */
	public static function apply_geolocation_filter( $location ) {
		/**
		 * Filter the detected geolocation.
		 *
		 * @since 1.0.0
		 *
		 * @param array $location Location data array.
		 */
		return apply_filters( 'swiftcurrency_geolocation', $location );
	}

	/**
	 * Apply currency symbol filter.
	 *
	 * @param string $symbol   Currency symbol.
	 * @param string $currency Currency code.
	 * @return string Filtered symbol.
	 */
	public static function apply_symbol_filter( $symbol, $currency ) {
		/**
		 * Filter the currency symbol.
		 *
		 * @since 1.0.0
		 *
		 * @param string $symbol   Currency symbol.
		 * @param string $currency Currency code.
		 */
		return apply_filters( 'swiftcurrency_currency_symbol', $symbol, $currency );
	}

	/**
	 * Trigger order currency action.
	 *
	 * @param int    $order_id Order ID.
	 * @param string $currency Currency code.
	 */
	public static function trigger_order_currency( $order_id, $currency ) {
		/**
		 * Fires when order is created with specific currency.
		 *
		 * @since 1.0.0
		 *
		 * @param int    $order_id Order ID.
		 * @param string $currency Currency code used.
		 */
		do_action( 'swiftcurrency_order_currency', $order_id, $currency );
	}
}
