<?php
/**
 * REST API Class
 *
 * Provides REST API endpoints for SwiftCurrency.
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
 * REST API class.
 *
 * @class REST_API
 * @since 1.0.0
 */
class REST_API {

	/**
	 * API namespace.
	 *
	 * @var string
	 */
	const NAMESPACE = 'swiftcurrency/v1';

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
	 * Cache Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Cache_Manager
	 */
	private $cache;

	/**
	 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
	 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
	 * @param \Codeies\SwiftCurrency\Cache_Manager    $cache            Cache Manager instance.
	 */
	public function __construct( $settings, $currency_manager, $cache ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->cache            = $cache;
		$this->init_hooks();
	}

	// -------------------------------------------------------------------------
	// Hooks
	// -------------------------------------------------------------------------

	/**
	 * Initialize hooks.
	 */
	private function init_hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_filter( 'rest_pre_serve_request', array( $this, 'add_security_headers' ) );
	}

	// -------------------------------------------------------------------------
	// Route registration
	// -------------------------------------------------------------------------

	/**
	 * Register REST API routes.
	 */
	public function register_routes() {
		// Public: currency catalogue.
		register_rest_route(
			self::NAMESPACE,
			'/currencies',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_currencies' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/currencies/(?P<code>[a-zA-Z]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_currency' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'code' => array(
						'required'          => true,
						'validate_callback' => function ( $param ) {
							return (bool) preg_match( '/^[A-Za-z]{3}$/', $param );
						},
					),
				),
			)
		);

		// Public: exchange rates (cached values only — no provider calls).
		register_rest_route(
			self::NAMESPACE,
			'/rates',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_rates' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'base' => array(
						'required' => false,
						'default'  => '',
					),
				),
			)
		);

		// Public: price conversion (cached rates only).
		register_rest_route(
			self::NAMESPACE,
			'/convert',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'convert_price' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'amount' => array(
						'required'          => true,
						'validate_callback' => function ( $param ) {
							return is_numeric( $param ) && $param > 0;
						},
					),
					'from'   => array( 'required' => true ),
					'to'     => array( 'required' => true ),
				),
			)
		);

		// Admin: read settings.
		register_rest_route(
			self::NAMESPACE,
			'/settings',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_settings' ),
				'permission_callback' => array( $this, 'check_admin_permission' ),
			)
		);

		// Admin: update settings.
		register_rest_route(
			self::NAMESPACE,
			'/settings',
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => array( $this, 'update_settings' ),
				'permission_callback' => array( $this, 'check_admin_permission' ),
			)
		);

		// Admin: force-refresh rates.
		register_rest_route(
			self::NAMESPACE,
			'/rates/refresh',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'refresh_rates' ),
				'permission_callback' => array( $this, 'check_admin_permission' ),
			)
		);

		// Public: per-product prices (custom override meta).
		register_rest_route(
			self::NAMESPACE,
			'/products/(?P<id>\d+)/prices',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_product_prices' ),
				'permission_callback' => array( $this, 'check_read_permission' ),
				'args'                => array(
					'id' => array(
						'required'          => true,
						'validate_callback' => function ( $param ) {
							return is_numeric( $param );
						},
					),
				),
			)
		);

		// Admin: update per-product price overrides.
		register_rest_route(
			self::NAMESPACE,
			'/products/(?P<id>\d+)/prices',
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => array( $this, 'update_product_prices' ),
				'permission_callback' => array( $this, 'check_edit_product_permission' ),
				'args'                => array(
					'id'     => array( 'required' => true ),
					'prices' => array( 'required' => true ),
				),
			)
		);
	}

	// -------------------------------------------------------------------------
	// Endpoint callbacks
	// -------------------------------------------------------------------------

	/**
	 * GET /currencies
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function get_currencies( $request ) {
		$base_currency      = $this->currency_manager->get_base_currency();
		$enabled_codes      = $this->settings->get( 'general', 'enabled_currencies', array() );
		$all_currencies     = $this->currency_manager->get_all_currencies();

		$currencies = array();
		foreach ( $all_currencies as $code => $currency ) {
			$currencies[] = array(
				'code'     => $code,
				'name'     => $currency['name'],
				'symbol'   => $currency['symbol'],
				'decimals' => $currency['decimals'],
				'enabled'  => in_array( $code, $enabled_codes, true ),
				'is_base'  => $code === $base_currency,
			);
		}

		return rest_ensure_response( $currencies );
	}

	/**
	 * GET /currencies/{code}
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_currency( $request ) {
		$code     = strtoupper( $request['code'] );
		$currency = $this->currency_manager->get_currency( $code );

		if ( ! $currency ) {
			return new \WP_Error( 'swiftcurrency_not_found', __( 'Currency not found.', 'swift-currency' ), array( 'status' => 404 ) );
		}

		$base_currency = $this->currency_manager->get_base_currency();
		$enabled_codes = $this->settings->get( 'general', 'enabled_currencies', array() );

		return rest_ensure_response( array(
			'code'     => $code,
			'name'     => $currency['name'],
			'symbol'   => $currency['symbol'],
			'decimals' => $currency['decimals'],
			'enabled'  => in_array( $code, $enabled_codes, true ),
			'is_base'  => $code === $base_currency,
		) );
	}

	/**
	 * GET /rates
	 *
	 * Returns cached exchange rates only — does NOT call any provider.
	 * Rates that have not yet been fetched will be null.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function get_rates( $request ) {
		$base = sanitize_text_field( $request->get_param( 'base' ) );
		if ( empty( $base ) ) {
			$base = $this->currency_manager->get_base_currency();
		}
		$base = strtoupper( $base );

		$enabled_codes = $this->settings->get( 'general', 'enabled_currencies', array() );
		$rates         = array();

		foreach ( $enabled_codes as $code ) {
			if ( $code === $base ) {
				$rates[ $code ] = 1.0;
			} else {
				$rate           = $this->cache->get_rate( $base, $code );
				$rates[ $code ] = $rate ? (float) $rate : null;
			}
		}

		return rest_ensure_response( array(
			'base'  => $base,
			'rates' => $rates,
		) );
	}

	/**
	 * POST /convert
	 *
	 * Converts an amount between two currencies using the cached rate.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function convert_price( $request ) {
		$amount = (float) $request['amount'];
		$from   = strtoupper( sanitize_text_field( $request['from'] ) );
		$to     = strtoupper( sanitize_text_field( $request['to'] ) );

		if ( $from === $to ) {
			return rest_ensure_response( array(
				'amount'    => $amount,
				'from'      => $from,
				'to'        => $to,
				'converted' => $amount,
				'rate'      => 1.0,
			) );
		}

		$rate = $this->cache->get_rate( $from, $to );

		if ( ! $rate ) {
			return new \WP_Error(
				'swiftcurrency_rate_unavailable',
				__( 'Exchange rate not available. Please refresh rates first.', 'swift-currency' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response( array(
			'amount'    => $amount,
			'from'      => $from,
			'to'        => $to,
			'converted' => $amount * (float) $rate,
			'rate'      => (float) $rate,
		) );
	}

	/**
	 * GET /settings (admin only)
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function get_settings( $request ) {
		// Read through the Settings object (which uses the canonical option key).
		return rest_ensure_response( $this->settings->get_all() );
	}

	/**
	 * PUT /settings (admin only)
	 *
	 * Merges the supplied JSON into saved settings, runs the existing
	 * validate_settings() pipeline — the same one used during import — and
	 * persists the result.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_settings( $request ) {
		$raw       = $request->get_json_params();
		$validated = $this->settings->validate_settings( $raw );

		if ( is_wp_error( $validated ) ) {
			return $validated;
		}

		// Replace the in-memory settings section by section.
		foreach ( $validated as $section => $values ) {
			$this->settings->update_section( $section, $values );
		}

		// update_section() already calls save() internally per section, but
		// we call save() once more to fire swiftcurrency_settings_saved with
		// the fully-merged state.
		$this->settings->save();

		return rest_ensure_response( array( 'message' => __( 'Settings updated successfully.', 'swift-currency' ) ) );
	}

	/**
	 * POST /rates/refresh (admin only)
	 *
	 * Fires the same WP-Cron action that triggers the scheduled rate update,
	 * allowing an immediate on-demand refresh without waiting for the next
	 * scheduled run.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response
	 */
	public function refresh_rates( $request ) {
		/**
		 * Trigger an immediate fiat rate update.
		 * Cron_Handler is hooked to this action.
		 */
		do_action( 'swiftcurrency_update_rates' );

		/**
		 * Trigger an immediate crypto rate update.
		 * Cron_Handler is hooked to this action.
		 */
		do_action( 'swiftcurrency_update_crypto_rates' );

		return rest_ensure_response( array( 'message' => __( 'Exchange rate refresh triggered.', 'swift-currency' ) ) );
	}

	/**
	 * GET /products/{id}/prices
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_product_prices( $request ) {
		if ( ! function_exists( 'wc_get_product' ) ) {
			return new \WP_Error( 'swiftcurrency_no_wc', __( 'WooCommerce is not active.', 'swift-currency' ), array( 'status' => 503 ) );
		}

		$product_id = (int) $request['id'];
		$product    = wc_get_product( $product_id );

		if ( ! $product ) {
			return new \WP_Error( 'swiftcurrency_not_found', __( 'Product not found.', 'swift-currency' ), array( 'status' => 404 ) );
		}

		$custom_prices = get_post_meta( $product_id, '_swiftcurrency_custom_prices', true );
		if ( ! is_array( $custom_prices ) ) {
			$custom_prices = array();
		}

		$base_currency = $this->currency_manager->get_base_currency();

		$prices = array(
			$base_currency => array(
				'regular' => (float) $product->get_regular_price(),
				'sale'    => $product->get_sale_price() ? (float) $product->get_sale_price() : null,
			),
		);

		foreach ( $custom_prices as $code => $price_data ) {
			$prices[ strtoupper( $code ) ] = array(
				'regular' => ! empty( $price_data['regular'] ) ? (float) $price_data['regular'] : null,
				'sale'    => ! empty( $price_data['sale'] ) ? (float) $price_data['sale'] : null,
			);
		}

		return rest_ensure_response( array(
			'product_id' => $product_id,
			'prices'     => $prices,
		) );
	}

	/**
	 * PUT /products/{id}/prices (admin only)
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function update_product_prices( $request ) {
		$product_id = (int) $request['id'];

		if ( ! get_post( $product_id ) ) {
			return new \WP_Error( 'swiftcurrency_not_found', __( 'Product not found.', 'swift-currency' ), array( 'status' => 404 ) );
		}

		$raw_prices = $request['prices'];
		if ( ! is_array( $raw_prices ) ) {
			return new \WP_Error( 'swiftcurrency_invalid_data', __( 'prices must be an object.', 'swift-currency' ), array( 'status' => 400 ) );
		}

		// Sanitize: only numeric values, keyed by uppercase currency codes.
		$sanitized_prices = array();
		foreach ( $raw_prices as $code => $price_data ) {
			$code = strtoupper( sanitize_text_field( $code ) );
			if ( ! preg_match( '/^[A-Z]{3,4}$/', $code ) ) {
				continue;
			}
			$sanitized_prices[ $code ] = array(
				'regular' => isset( $price_data['regular'] ) && is_numeric( $price_data['regular'] ) ? (float) $price_data['regular'] : null,
				'sale'    => isset( $price_data['sale'] ) && is_numeric( $price_data['sale'] ) ? (float) $price_data['sale'] : null,
			);
		}

		update_post_meta( $product_id, '_swiftcurrency_custom_prices', $sanitized_prices );

		return rest_ensure_response( array( 'message' => __( 'Product prices updated successfully.', 'swift-currency' ) ) );
	}

	// -------------------------------------------------------------------------
	// Permission callbacks
	// -------------------------------------------------------------------------

	/**
	 * Check that the current user has admin-level access.
	 *
	 * Authentication only — no Pro-tier check here.
	 * The correct capability to perform admin actions is manage_woocommerce
	 * (when WC is active) or manage_options (without WC).
	 *
	 * @since  1.0.0
	 * @return bool
	 */
	public function check_admin_permission() {
		return current_user_can( 'manage_woocommerce' ) || current_user_can( 'manage_options' );
	}

	/**
	 * Check if the current user has permission to read product prices.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool
	 */
	public function check_read_permission( $request ) {
		$product_id = (int) $request['id'];

		if ( ! function_exists( 'wc_get_product' ) ) {
			return $this->check_admin_permission();
		}

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return false;
		}

		// If product is published, it's public.
		if ( 'publish' === $product->get_status() ) {
			return true;
		}

		// Otherwise, check for admin or edit permissions.
		return $this->check_edit_product_permission( $request );
	}

	/**
	 * Check if the current user has permission to edit a specific product.
	 *
	 * @param \WP_REST_Request $request Request object.
	 * @return bool
	 */
	public function check_edit_product_permission( $request ) {
		$product_id = (int) $request['id'];
		return current_user_can( 'edit_post', $product_id );
	}

	// -------------------------------------------------------------------------
	// Security
	// -------------------------------------------------------------------------

	/**
	 * Add security headers to REST API responses.
	 *
	 * @since 1.0.2
	 * @return bool
	 */
	public function add_security_headers( $served ) {
		header( 'X-Content-Type-Options: nosniff' );
		header( 'X-Frame-Options: DENY' );
		return $served;
	}
}
