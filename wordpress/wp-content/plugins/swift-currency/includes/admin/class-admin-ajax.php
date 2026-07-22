<?php
/**
 * Admin AJAX Handler
 *
 * All wp_ajax_swiftcurrency_* AJAX endpoints are registered here, keeping
 * Admin_Settings focused on menu/page rendering only.
 *
 * @package SwiftCurrency
 * @since   1.0.0
 */

namespace Codeies\SwiftCurrency\Admin;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Admin_Ajax class.
 *
 * @since 1.0.0
 */
class Admin_Ajax {

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * Cache Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Cache_Manager
	 */
	private $cache;

	/**
	 * Rate provider factory.
	 *
	 * @var \Codeies\SwiftCurrency\Providers\Rate_Provider_Factory
	 */
	private $factory;

	/**
	 * @param \Codeies\SwiftCurrency\Settings                        $settings Settings instance.
	 * @param \Codeies\SwiftCurrency\Cache_Manager                   $cache    Cache Manager instance.
	 * @param \Codeies\SwiftCurrency\Providers\Rate_Provider_Factory $factory  Rate provider factory.
	 */
	public function __construct( $settings, $cache, $factory ) {
		$this->settings = $settings;
		$this->cache    = $cache;
		$this->factory  = $factory;
		$this->init_hooks();
	}

	/**
	 * Register AJAX action hooks.
	 */
	private function init_hooks() {
		add_action( 'wp_ajax_swiftcurrency_save_settings',    array( $this, 'save_settings' ) );
		add_action( 'wp_ajax_swiftcurrency_test_api',         array( $this, 'test_api' ) );
		add_action( 'wp_ajax_swiftcurrency_sync_wc_currency', array( $this, 'sync_wc_currency' ) );
		add_action( 'wp_ajax_swiftcurrency_clear_cache',      array( $this, 'clear_cache' ) );
		add_action( 'wp_ajax_swiftcurrency_reset_settings',   array( $this, 'reset_settings' ) );
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * Verify the swiftcurrency_admin nonce and confirm the caller has admin
	 * capability. Sends a JSON error and terminates if either check fails.
	 *
	 * @param string|null $cap Capability override. Defaults to manage_woocommerce|manage_options.
	 */
	private function verify_request( $cap = null ) {
		check_ajax_referer( 'swiftcurrency_admin', 'nonce' );

		if ( null === $cap ) {
			$cap = current_user_can( 'manage_woocommerce' ) ? 'manage_woocommerce' : 'manage_options';
		}

		if ( ! current_user_can( $cap ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', 'swift-currency' ) ), 403 );
		}
	}

	// -------------------------------------------------------------------------
	// Handlers
	// -------------------------------------------------------------------------

	/**
	 * AJAX: Save a single settings key/value pair.
	 *
	 * Expects POST: section (string), key (string), value (mixed).
	 */
	public function save_settings() {
		check_ajax_referer( 'swiftcurrency_admin', 'nonce' );
		$this->verify_request();

		$section = isset( $_POST['section'] ) ? sanitize_text_field( wp_unslash( $_POST['section'] ) ) : '';
		$key     = isset( $_POST['key'] )     ? sanitize_text_field( wp_unslash( $_POST['key'] ) )     : '';
		$raw_val = isset( $_POST['value'] )   ? wp_unslash( $_POST['value'] )                          : null; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Sanitized below based on type.

		if ( empty( $section ) || empty( $key ) ) {
			wp_send_json_error( array( 'message' => __( 'Missing required fields.', 'swift-currency' ) ), 400 );
		}

		// Sanitize value: arrays (e.g. enabled_currencies) vs scalars.
		if ( is_array( $raw_val ) ) {
			$value = array_map( 'sanitize_text_field', $raw_val );
		} else {
			$value = sanitize_text_field( $raw_val );
		}

		$this->settings->set( $section, $key, $value );
		wp_send_json_success( array( 'message' => __( 'Settings updated successfully.', 'swift-currency' ) ) );
	}

	/**
	 * AJAX: Test a rate provider connection.
	 *
	 * Expects POST: provider (string), api_key (string, optional).
	 */
	public function test_api() {
		check_ajax_referer( 'swiftcurrency_admin', 'nonce' );
		$this->verify_request();

		$provider_name = isset( $_POST['provider'] ) ? sanitize_text_field( wp_unslash( $_POST['provider'] ) ) : 'ecb';
		$api_key       = isset( $_POST['api_key'] )  ? sanitize_text_field( wp_unslash( $_POST['api_key'] ) )  : '';

		// Apply key in memory so the provider uses it without persisting.
		if ( ! empty( $api_key ) ) {
			$this->settings->set_memory( 'rates', 'api_key', $api_key );
		}

		$provider = $this->factory->make( $provider_name );
		if ( ! $provider ) {
			wp_send_json_error( array( 'message' => __( 'Invalid rate provider.', 'swift-currency' ) ), 400 );
		}

		try {
			$test_base = ( 'ecb' === $provider_name ) ? 'EUR' : 'USD';
			if ( false === $provider->fetch_rates( $test_base ) ) {
				wp_send_json_error( array( 'message' => $provider->get_last_error() ?: __( 'Connection failed.', 'swift-currency' ) ) );
			}
			wp_send_json_success( array( 'message' => __( 'API connection successful!', 'swift-currency' ) ) );
		} catch ( \Exception $e ) {
			wp_send_json_error( array( 'message' => $e->getMessage() ) );
		}
	}

	/**
	 * AJAX: Sync WooCommerce base currency with the plugin's base currency.
	 *
	 * Expects POST: currency (string).
	 */
	public function sync_wc_currency() {
		check_ajax_referer( 'swiftcurrency_admin', 'nonce' );
		$this->verify_request();

		if ( ! class_exists( 'WooCommerce' ) ) {
			wp_send_json_error( array( 'message' => __( 'WooCommerce is not active.', 'swift-currency' ) ), 503 );
		}

		$currency = isset( $_POST['currency'] ) ? sanitize_text_field( wp_unslash( $_POST['currency'] ) ) : '';
		if ( ! $currency ) {
			wp_send_json_error( array( 'message' => __( 'Invalid currency.', 'swift-currency' ) ), 400 );
		}

		update_option( 'woocommerce_currency', $currency );
		wp_send_json_success( array( 'message' => __( 'WooCommerce currency updated.', 'swift-currency' ) ) );
	}

	/**
	 * AJAX: Clear all cached exchange rates.
	 */
	public function clear_cache() {
		$this->verify_request( 'manage_options' );
		$this->cache->clear_all();
		wp_send_json_success( array( 'message' => __( 'Cache cleared successfully.', 'swift-currency' ) ) );
	}

	/**
	 * AJAX: Reset all plugin settings to defaults.
	 */
	public function reset_settings() {
		$this->verify_request( 'manage_options' );
		$this->settings->reset();
		wp_send_json_success( array( 'message' => __( 'Settings reset successfully.', 'swift-currency' ) ) );
	}
}
