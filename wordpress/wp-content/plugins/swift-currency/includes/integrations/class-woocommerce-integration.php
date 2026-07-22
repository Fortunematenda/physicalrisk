<?php
/**
 * WooCommerce Integration Class
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Integrations;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WooCommerce_Integration {

	private $settings;
	private $currency_manager;
	private $price_converter;

	public function __construct( $settings, $currency_manager, $price_converter ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->price_converter  = $price_converter;
		$this->init_hooks();
	}

	private function init_hooks() {
		// Tell WooCommerce what currency we are in — this fixes the symbol everywhere automatically.
		add_filter( 'woocommerce_currency', array( $this, 'filter_wc_currency' ) );

		// Convert product prices.
		add_filter( 'woocommerce_product_get_price',                   array( $this, 'convert_price' ), 10, 2 );
		add_filter( 'woocommerce_product_get_regular_price',           array( $this, 'convert_price' ), 10, 2 );
		add_filter( 'woocommerce_product_get_sale_price',              array( $this, 'convert_price' ), 10, 2 );
		add_filter( 'woocommerce_product_variation_get_price',         array( $this, 'convert_price' ), 10, 2 );
		add_filter( 'woocommerce_product_variation_get_regular_price', array( $this, 'convert_price' ), 10, 2 );
		add_filter( 'woocommerce_product_variation_get_sale_price',    array( $this, 'convert_price' ), 10, 2 );

		// Convert variable product prices range.
		add_filter( 'woocommerce_variation_prices',          array( $this, 'convert_variation_prices' ), 10, 3 );
		add_filter( 'woocommerce_get_variation_prices_hash', array( $this, 'filter_variation_prices_hash' ), 10, 3 );

		// Fix decimal / thousand separators to match the selected currency.
		add_filter( 'wc_price_args', array( $this, 'fix_price_args' ), 999 );
		add_filter( 'woocommerce_price_num_decimals',       array( $this, 'filter_wc_price_decimals' ), 999 );
		add_filter( 'woocommerce_price_decimal_separator',  array( $this, 'filter_wc_decimal_separator' ), 999 );
		add_filter( 'woocommerce_price_thousand_separator', array( $this, 'filter_wc_thousand_separator' ), 999 );

		// Also filter options directly for cases where WC calls get_option instead of the wrapper functions.
		add_filter( 'option_woocommerce_price_num_decimals',       array( $this, 'filter_wc_price_decimals' ), 999 );
		add_filter( 'option_woocommerce_price_decimal_separator',  array( $this, 'filter_wc_decimal_separator' ), 999 );
		add_filter( 'option_woocommerce_price_thousand_separator', array( $this, 'filter_wc_thousand_separator' ), 999 );

		// Estimated hint on cart.
		add_filter( 'woocommerce_cart_totals_order_total_html', array( $this, 'cart_total_hint' ), 20 );

		// Estimated hint on checkout (table row under "Order total").
		add_action( 'woocommerce_review_order_after_order_total', array( $this, 'checkout_total_hint' ), 20 );

		// WooCommerce Blocks support.
		add_action( 'woocommerce_blocks_loaded', array( $this, 'register_store_api_extension' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_blocks_assets' ) );

		// Order admin.
		add_filter( 'woocommerce_get_formatted_order_total', array( $this, 'admin_order_total' ), 10, 2 );

		// Register custom currencies with WooCommerce.
		add_filter( 'woocommerce_currencies', array( $this, 'add_wc_currencies' ) );
		add_filter( 'woocommerce_currency_symbol', array( $this, 'add_wc_currency_symbol' ), 10, 2 );
	}

	// ─── CURRENCY FILTER ─────────────────────────────────────────────────────

	/**
	 * Tell WooCommerce which currency is active.
	 * Uses a static flag to prevent the infinite loop caused by
	 * get_base_currency() internally calling get_woocommerce_currency().
	 */
	public function filter_wc_currency( $currency ) {
		static $running = false;
		if ( $running ) {
			return $currency; // prevent recursion
		}
		$running = true;
		$result  = $this->get_display_currency();
		$running = false;
		return $result;
	}

	// ─── PRICE CONVERSION ────────────────────────────────────────────────────

	/**
	 * Convert a product price from base to the display currency.
	 */
	public function convert_price( $price, $product ) {
		if ( ! is_numeric( $price ) || empty( $price ) ) {
			return $price;
		}

		$base    = $this->get_base();
		$display = $this->get_display_currency();

		if ( $base === $display ) {
			return $price;
		}

		// Custom per-product price?
		$custom = get_post_meta( $product->get_id(), '_swiftcurrency_custom_prices', true );
		if ( is_array( $custom ) && ! empty( $custom[ $display ] ) ) {
			$prices = $custom[ $display ];
			if ( $product->is_on_sale() && ! empty( $prices['sale'] ) ) {
				return (float) $prices['sale'];
			}
			if ( ! empty( $prices['regular'] ) ) {
				return (float) $prices['regular'];
			}
		}

		$converted = $this->price_converter->convert_with_rounding( $price, $base, $display );
		return ( false !== $converted ) ? $converted : $price;
	}

	// ─── PRICE FORMATTING ────────────────────────────────────────────────────

	/**
	 * Adjust separators / decimals to match the selected currency.
	 * The symbol is already correct because WooCommerce now knows the currency
	 * from our filter_wc_currency() hook — so we only need to fix formatting.
	 */
	public function fix_price_args( $args ) {
		if ( is_admin() && empty( $args['currency'] ) && ! wp_doing_ajax() ) {
			return $args;
		}

		$currency = ! empty( $args['currency'] ) ? $args['currency'] : $this->get_display_currency();

		$args['currency']           = $currency;
		$args['decimal_separator']  = $this->currency_manager->get_decimal_separator( $currency );
		$args['thousand_separator'] = $this->currency_manager->get_thousand_separator( $currency );
		$args['decimals']           = $this->currency_manager->get_currency_decimals( $currency );

		return $args;
	}

	/**
	 * Ensure WooCommerce knows the correct number of decimals for the current currency.
	 */
	public function filter_wc_price_decimals( $decimals ) {
		return $this->currency_manager->get_currency_decimals( $this->get_display_currency() );
	}

	/**
	 * Ensure WooCommerce uses the correct decimal separator for the current currency.
	 */
	public function filter_wc_decimal_separator( $separator ) {
		return $this->currency_manager->get_decimal_separator( $this->get_display_currency() );
	}

	/**
	 * Ensure WooCommerce uses the correct thousand separator for the current currency.
	 */
	public function filter_wc_thousand_separator( $separator ) {
		return $this->currency_manager->get_thousand_separator( $this->get_display_currency() );
	}

	// ─── ESTIMATED HINTS ─────────────────────────────────────────────────────

	/**
	 * Cart page: append "approx. $X USD" below the order total.
	 * Only shown when Multi-Currency is OFF and selected != base.
	 */
	public function cart_total_hint( $html ) {
		if ( ! is_cart() || ! WC()->cart ) {
			return $html;
		}

		$selected = $this->get_selected();
		$base     = $this->get_base();

		// Nothing to hint if already in base.
		if ( $selected === $base ) {
			return $html;
		}

		// Total is already in $selected (because convert_price ran).
		$total = WC()->cart->get_total( 'edit' );
		if ( ! $total ) {
			return $html;
		}

		// Show what they'll actually be charged (base currency).
		$approx = $this->price_converter->convert( (float) $total, $selected, $base );
		if ( ! $approx ) {
			return $html;
		}

		$hint = sprintf(
			'<span class="swiftcurrency-approx" style="font-size:0.8em;color:#888;display:block;margin-top:4px;">(%s %s)</span>',
			esc_html__( 'approx.', 'swift-currency' ),
			esc_html( $this->currency_manager->format_price( $approx, $base ) )
		);

		return $html . $hint;
	}

	/**
	 * Checkout page: add a table row showing the approx. amount in the user's
	 * selected currency (only shown when Multi-Currency is OFF).
	 */
	public function checkout_total_hint() {
		if ( ! is_checkout() || ! WC()->cart ) {
			return;
		}

		$multi_checkout = $this->settings->get( 'pricing', 'checkout_multi_currency', false );
		$selected       = $this->get_selected();
		$base           = $this->get_base();

		if ( $selected === $base ) {
			return;
		}

		if ( $multi_checkout ) {
			// Multi-Currency ON: checkout is in selected currency, show base equivalent.
			$total  = WC()->cart->get_total( 'edit' );
			$approx = $this->price_converter->convert( (float) $total, $selected, $base );
			$label  = __( 'Approx. in base', 'swift-currency' );
			$show   = $this->currency_manager->format_price( $approx, $base );
		} else {
			// Multi-Currency OFF: checkout is in base, show selected equivalent.
			$total  = WC()->cart->get_total( 'edit' );
			$approx = $this->price_converter->convert( (float) $total, $base, $selected );
			$label  = sprintf(
				/* translators: %s: Currency code */
				__( 'Approx. in %s', 'swift-currency' ),
				$selected
			);
			$show   = $this->currency_manager->format_price( $approx, $selected );
		}

		if ( ! $approx ) {
			return;
		}
		?>
		<tr class="swiftcurrency-approx-row">
			<th><?php echo esc_html( $label ); ?></th>
			<td><?php echo esc_html( $show ); ?></td>
		</tr>
		<?php
	}

	/**
	 * Register the extension schema for Store API.
	 */
	public function register_store_api_extension() {
		if ( ! class_exists( '\Automattic\WooCommerce\StoreApi\StoreApi' ) ) {
			return;
		}

		\Automattic\WooCommerce\StoreApi\StoreApi::container()
			->get( \Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema::class )
			->register_endpoint_data(
				array(
					'endpoint'        => \Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema::IDENTIFIER,
					'namespace'       => 'swiftcurrency',
					'data_callback'   => array( $this, 'store_api_hint_data' ),
					'schema_callback' => function() {
						return array(
							'hint' => array(
								'description' => 'Estimated amount in alternate currency',
								'type'        => 'string',
								'readonly'    => true,
							),
						);
					},
				)
			);
	}

	/**
	 * The data callback for Store API.
	 */
	public function store_api_hint_data() {
		$selected = $this->get_selected();
		$base     = $this->get_base();

		if ( $selected === $base || ! WC()->cart ) {
			return array( 'hint' => '' );
		}

		$display       = $this->get_display_currency();
		$total         = (float) WC()->cart->get_total( 'edit' );
		$hint_currency = ( $display === $base ) ? $selected : $base;
		$approx        = $this->price_converter->convert( $total, $display, $hint_currency );

		return array(
			'hint' => $approx ? '~' . $this->currency_manager->format_price( $approx, $hint_currency ) : '',
		);
	}

	/**
	 * Enqueue assets for WooCommerce Blocks.
	 */
	public function enqueue_blocks_assets() {
		if ( function_exists( 'is_checkout' ) && ( is_checkout() || is_cart() || has_block( 'woocommerce/checkout' ) || has_block( 'woocommerce/cart' ) ) ) {
			wp_register_script(
				'swiftcurrency-blocks-checkout',
				SWIFTCURRENCY_ASSETS_URL . 'js/blocks-checkout.js',
				array( 'wc-blocks-checkout', 'wp-plugins', 'wp-data', 'wp-element' ),
				SWIFTCURRENCY_VERSION,
				true
			);
			wp_enqueue_script( 'swiftcurrency-blocks-checkout' );
		}
	}

	// ─── ADMIN ORDER ─────────────────────────────────────────────────────────

	public function admin_order_total( $formatted, $order ) {
		if ( ! $order ) {
			return $formatted;
		}
		$dc = $order->get_meta( '_swiftcurrency_display_currency' );
		$dt = $order->get_meta( '_swiftcurrency_display_total' );
		if ( $dc && $dt ) {
			$formatted .= ' <span class="swiftcurrency-approx">(' . esc_html( $this->currency_manager->format_price( $dt, $dc ) ) . ')</span>';
		}
		return $formatted;
	}

	/**
	 * Convert variation prices array.
	 * This ensures the price range on variable products is converted.
	 */
	public function convert_variation_prices( $prices, $product, $for_display ) {
		$base    = $this->get_base();
		$display = $this->get_display_currency();

		if ( $base === $display ) {
			return $prices;
		}

		foreach ( $prices as $price_type => $values ) {
			foreach ( $values as $variation_id => $price ) {
				// Optional: Check for custom variation prices if needed to be 100% consistent with convert_price().
				// But for basic range conversion, converting the base price is usually what's expected.
				$converted = $this->price_converter->convert_with_rounding( $price, $base, $display );
				$prices[ $price_type ][ $variation_id ] = ( false !== $converted ) ? $converted : $price;
			}
		}

		return $prices;
	}

	/**
	 * Include the current currency in the variation prices hash.
	 * This ensures that WooCommerce caches variation prices separately for each currency.
	 */
	public function filter_variation_prices_hash( $hash, $product, $for_display ) {
		$hash[] = $this->get_display_currency();
		return $hash;
	}

	// ─── HELPERS ─────────────────────────────────────────────────────────────

	/**
	 * The currency to DISPLAY / CHARGE in.
	 * - Checkout + Multi-Currency OFF → base (gateway needs base)
	 * - Everything else → user's cookie selection
	 */
	public function get_display_currency() {
		// Force base currency in the admin dashboard to keep reports and order lists consistent.
		if ( is_admin() && ! $this->is_frontend_ajax() ) {
			return $this->get_base();
		}

		$selected       = $this->get_selected();
		$multi_checkout = $this->settings->get( 'pricing', 'checkout_multi_currency', false );

		if ( ! $multi_checkout && $this->is_checkout_context() ) {
			return $this->get_base();
		}

		return $selected;
	}

	/**
	 * Check if the active request is an AJAX call from the frontend.
	 */
	private function is_frontend_ajax() {
		if ( ! wp_doing_ajax() ) {
			return false;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$action = isset( $_REQUEST['action'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['action'] ) ) : '';
		$frontend_actions = array(
			'woocommerce_get_refreshed_fragments',
			'woocommerce_add_to_cart',
			'woocommerce_update_order_review',
			'woocommerce_checkout',
			'swiftcurrency_switch_currency',
			'swiftcurrency_get_rates'
		);
		return in_array( $action, $frontend_actions, true );
	}

	/**
	 * Detect if the current request is within the context of a checkout.
	 */
	private function is_checkout_context() {
		// Standard checkout page.
		if ( function_exists( 'is_checkout' ) && is_checkout() && ! is_wc_endpoint_url( 'order-received' ) ) {
			return true;
		}

		// AJAX checkout requests (Standard WooCommerce).
		if ( wp_doing_ajax() ) {
			$actions = array( 'woocommerce_update_order_review', 'woocommerce_checkout' );
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended
			if ( isset( $_REQUEST['action'] ) && in_array( sanitize_text_field( wp_unslash( $_REQUEST['action'] ) ), $actions, true ) ) {
				return true;
			}
		}

		// Store API requests (WooCommerce Blocks Checkout).
		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			if ( isset( $_SERVER['REQUEST_URI'] ) && strpos( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ), '/wc/store/v1/checkout' ) !== false ) {
				return true;
			}
			// Also include cart requests if triggered from checkout.
			if ( isset( $_SERVER['REQUEST_URI'] ) && strpos( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ), '/wc/store/v1/cart' ) !== false && isset( $_SERVER['HTTP_REFERER'] ) ) {
				if ( strpos( sanitize_text_field( wp_unslash( $_SERVER['HTTP_REFERER'] ) ), '/checkout' ) !== false ) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * User's selected currency — read ONLY from cookie.
	 * Never reads session (session can hold stale checkout overrides).
	 */
	public function get_selected() {
		if ( isset( $_COOKIE['swiftcurrency_selected'] ) ) {
			$code = sanitize_text_field( wp_unslash( $_COOKIE['swiftcurrency_selected'] ) );
			if ( $code ) {
				return $code;
			}
		}
		return $this->get_base();
	}

	/**
	 * Plugin's base currency (from plugin settings, never from WC directly
	 * to avoid triggering the woocommerce_currency filter recursively).
	 */
	private function get_base() {
		return $this->settings->get( 'general', 'base_currency', 'USD' );
	}

	public function set_current_currency( $currency_code ) {
		if ( ! $this->currency_manager->is_currency_enabled( $currency_code ) ) {
			return false;
		}
		if ( function_exists( 'WC' ) && WC()->session ) {
			WC()->session->set( 'swiftcurrency_current', $currency_code );
		}
		setcookie( 'swiftcurrency_selected', $currency_code, time() + ( 30 * DAY_IN_SECONDS ), COOKIEPATH, COOKIE_DOMAIN );
		$_COOKIE['swiftcurrency_selected'] = $currency_code;
		do_action( 'swiftcurrency_after_currency_switch', $currency_code );
		return true;
	}

	/**
	 * Register all SwiftCurrency currencies with WooCommerce.
	 * This ensures custom/crypto codes like SOL are recognized as valid.
	 */
	public function add_wc_currencies( $wc_currencies ) {
		$all = $this->currency_manager->get_all_currencies();
		foreach ( $all as $code => $data ) {
			if ( ! isset( $wc_currencies[ $code ] ) ) {
				$wc_currencies[ $code ] = $data['name'];
			}
		}
		return $wc_currencies;
	}

	/**
	 * Provide the correct symbol for custom currencies in WooCommerce.
	 */
	public function add_wc_currency_symbol( $symbol, $currency ) {
		$data = $this->currency_manager->get_currency( $currency );
		if ( $data && isset( $data['symbol'] ) ) {
			return $data['symbol'];
		}
		return $symbol;
	}
}
