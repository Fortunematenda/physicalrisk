<?php
/**
 * AJAX Handler Class
 *
 * Handles AJAX requests for currency switching and price updates.
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
 * AJAX Handler class.
 *
 * @class AJAX_Handler
 * @version 1.0.0
 */
class AJAX_Handler {

	/**
	 * Settings instance.
	 *
	 * @var Settings
	 */
	private $settings;

	/**
	 * Currency Manager instance.
	 *
	 * @var Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Price Converter instance.
	 *
	 * @var Price_Converter
	 */
	private $price_converter;

	/**
	 * Constructor.
	 *
	 * @param Settings         $settings         Settings instance.
	 * @param Currency_Manager $currency_manager Currency Manager instance.
	 * @param Price_Converter  $price_converter  Price Converter instance.
	 */
	public function __construct( $settings, $currency_manager, $price_converter ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->price_converter  = $price_converter;
		$this->init_hooks();
	}

	/**
	 * Initialize hooks.
	 */
	private function init_hooks() {
		// Currency switching.
		add_action( 'wp_ajax_swiftcurrency_switch_currency', array( $this, 'switch_currency' ) );
		add_action( 'wp_ajax_nopriv_swiftcurrency_switch_currency', array( $this, 'switch_currency' ) );

		// Get converted prices.
		add_action( 'wp_ajax_swiftcurrency_get_prices', array( $this, 'get_converted_prices' ) );
		add_action( 'wp_ajax_nopriv_swiftcurrency_get_prices', array( $this, 'get_converted_prices' ) );

		// Get cart totals.
		add_action( 'wp_ajax_swiftcurrency_get_cart_totals', array( $this, 'get_cart_totals' ) );
		add_action( 'wp_ajax_nopriv_swiftcurrency_get_cart_totals', array( $this, 'get_cart_totals' ) );
	}

	/**
	 * Switch currency via AJAX.
	 */
	public function switch_currency() {
		$nonce = isset( $_POST['nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['nonce'] ) ) : '';

		// Strictly verify nonce to prevent CSRF.
		check_ajax_referer( 'swiftcurrency_nonce', 'nonce' );

		$currency_code = isset( $_POST['currency'] ) ? sanitize_text_field( wp_unslash( $_POST['currency'] ) ) : '';

		if ( empty( $currency_code ) ) {
			wp_send_json_error( array(
				'message' => __( 'Currency code is required.', 'swift-currency' ),
			) );
		}

		$currency_code = strtoupper( $currency_code );

		if ( ! $this->currency_manager->is_currency_enabled( $currency_code ) && $currency_code !== $this->currency_manager->get_base_currency() ) {
			wp_send_json_error( array(
				'message' => __( 'Invalid currency code.', 'swift-currency' ),
			) );
		}

		// Get old currency from cookie/session.
		$old_currency = $this->currency_manager->get_base_currency();
		if ( isset( $_COOKIE['swiftcurrency_selected'] ) ) {
			$old_currency = sanitize_text_field( wp_unslash( $_COOKIE['swiftcurrency_selected'] ) );
		} elseif ( WC()->session && WC()->session->get( 'swiftcurrency_current' ) ) {
			$old_currency = WC()->session->get( 'swiftcurrency_current' );
		}

		/**
		 * Action hook before currency switch.
		 *
		 * @since 1.0.0
		 * @param string $old_currency Previous currency.
		 * @param string $currency_code New currency.
		 */
		do_action( 'swiftcurrency_before_currency_switch', $old_currency, $currency_code );

		// Switch currency - store in cookie and session.
		setcookie( 'swiftcurrency_selected', $currency_code, time() + ( 30 * DAY_IN_SECONDS ), COOKIEPATH, COOKIE_DOMAIN );

		// Mark this as a manual choice so geolocation does not override it.
		setcookie( 'swiftcurrency_manual', '1', time() + ( 30 * DAY_IN_SECONDS ), COOKIEPATH, COOKIE_DOMAIN );

		if ( WC()->session ) {
			WC()->session->set( 'swiftcurrency_current', $currency_code );
		}

		/**
		 * Action hook after currency switch.
		 *
		 * @since 1.0.0
		 * @param string $old_currency Previous currency.
		 * @param string $currency_code New currency.
		 */
		do_action( 'swiftcurrency_after_currency_switch', $old_currency, $currency_code );

		wp_send_json_success( array(
			'message'      => __( 'Currency switched successfully.', 'swift-currency' ),
			'currency'     => $currency_code,
			'symbol'       => $this->currency_manager->get_currency_symbol( $currency_code ),
			'old_currency' => $old_currency,
		) );
	}

	/**
	 * Get converted prices via AJAX.
	 */
	public function get_converted_prices() {
		check_ajax_referer( 'swiftcurrency_nonce', 'nonce' );

		$product_ids = isset( $_POST['product_ids'] ) ? array_map( 'absint', $_POST['product_ids'] ) : array();

		if ( empty( $product_ids ) ) {
			wp_send_json_error( array(
				'message' => __( 'No product IDs provided.', 'swift-currency' ),
			) );
		}

		// Get current currency from cookie/session.
		$current_currency = $this->currency_manager->get_base_currency();
		if ( isset( $_COOKIE['swiftcurrency_selected'] ) ) {
			$current_currency = sanitize_text_field( wp_unslash( $_COOKIE['swiftcurrency_selected'] ) );
		} elseif ( WC()->session && WC()->session->get( 'swiftcurrency_current' ) ) {
			$current_currency = WC()->session->get( 'swiftcurrency_current' );
		}

		$prices = array();

		foreach ( $product_ids as $product_id ) {
			$product = wc_get_product( $product_id );

			if ( ! $product ) {
				continue;
			}

			$prices[ $product_id ] = array(
				'price'         => $product->get_price(),
				'regular_price' => $product->get_regular_price(),
				'sale_price'    => $product->get_sale_price(),
				'price_html'    => $product->get_price_html(),
			);
		}

		wp_send_json_success( array(
			'currency' => $current_currency,
			'prices'   => $prices,
		) );
	}

	/**
	 * Get cart totals via AJAX.
	 */
	public function get_cart_totals() {
		check_ajax_referer( 'swiftcurrency_nonce', 'nonce' );

		if ( ! WC()->cart ) {
			wp_send_json_error( array(
				'message' => __( 'Cart not available.', 'swift-currency' ),
			) );
		}

		WC()->cart->calculate_totals();

		$checkout_handler = new Checkout_Handler();
		$totals = $checkout_handler->convert_cart_totals();

		wp_send_json_success( $totals );
	}
}
