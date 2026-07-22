<?php
/**
 * Checkout Handler Class
 *
 * Handles order currency storage and payment gateway filtering.
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Checkout_Handler {

	private $currency_manager;
	private $price_converter;
	private $settings;

	public function __construct( $currency_manager, $price_converter, $settings ) {
		$this->currency_manager = $currency_manager;
		$this->price_converter  = $price_converter;
		$this->settings         = $settings;
		$this->init_hooks();
	}

	private function init_hooks() {
		add_action( 'woocommerce_checkout_create_order', array( $this, 'store_order_currency' ), 10, 2 );
		add_action( 'woocommerce_store_api_checkout_update_order_from_request', array( $this, 'store_order_currency_blocks' ), 10, 2 );
		add_action( 'woocommerce_admin_order_data_after_billing_address', array( $this, 'display_order_currency' ), 10, 1 );
		add_filter( 'woocommerce_email_order_meta_fields', array( $this, 'add_currency_to_email' ), 10, 3 );
	}

	// ─── ORDER META ──────────────────────────────────────────────────────────

	public function store_order_currency( $order, $data ) {
		$base           = $this->settings->get( 'general', 'base_currency', 'USD' );
		$selected       = $this->get_selected();
		$multi_checkout = $this->settings->get( 'pricing', 'checkout_multi_currency', false );

		// Which currency is the order actually charged in?
		$charge_currency = $multi_checkout ? $selected : $base;

		// Exchange rate base → charge.
		$rate = ( $charge_currency !== $base )
			? (float) $this->price_converter->get_conversion_rate( $base, $charge_currency )
			: 1.0;

		$order->update_meta_data( '_order_exchange_rate',   $rate );
		$order->update_meta_data( '_base_currency',         $base );
		$order->update_meta_data( '_swiftcurrency_version', SWIFTCURRENCY_VERSION );

		// When Multi-Currency is OFF, record user's selected currency so we can
		// show the approx. amount in that currency on the admin order screen.
		if ( ! $multi_checkout && $selected !== $base ) {
			$order->update_meta_data( '_swiftcurrency_display_currency', $selected );
			$order_total   = $order->get_total();
			$display_rate  = (float) $this->price_converter->get_conversion_rate( $base, $selected );
			$order->update_meta_data( '_swiftcurrency_display_total', $order_total * $display_rate );
		}

		$order_total = $order->get_total();
		$base_total  = $rate > 0 ? $order_total / $rate : $order_total;
		$order->update_meta_data( '_base_currency_total', $base_total );

		$order->set_currency( $charge_currency );
	}

	public function store_order_currency_blocks( $order, $request ) {
		$this->store_order_currency( $order, array() );
	}

	// ─── ADMIN ───────────────────────────────────────────────────────────────

	public function display_order_currency( $order ) {
		$currency         = $order->get_currency();
		$base             = $order->get_meta( '_base_currency' );
		$rate             = $order->get_meta( '_order_exchange_rate' );
		$base_total       = $order->get_meta( '_base_currency_total' );
		$display_currency = $order->get_meta( '_swiftcurrency_display_currency' );
		$display_total    = $order->get_meta( '_swiftcurrency_display_total' );

		if ( ! $currency ) {
			return;
		}
		?>
		<div class="swiftcurrency-order-info" style="margin-top:12px">
			<strong><?php esc_html_e( 'Order Currency:', 'swift-currency' ); ?></strong> <?php echo esc_html( $currency ); ?>
			<?php if ( $display_currency && $display_total ) : ?>
				<span style="color:#646970;font-size:.9em">(≈ <?php echo esc_html( $this->currency_manager->format_price( $display_total, $display_currency ) ); ?>)</span>
			<?php endif; ?>
			<?php if ( $base && $base !== $currency ) : ?>
				<br><strong><?php esc_html_e( 'Base Currency:', 'swift-currency' ); ?></strong> <?php echo esc_html( $base ); ?>
				<br><strong><?php esc_html_e( 'Rate:', 'swift-currency' ); ?></strong> <?php echo esc_html( number_format( (float) $rate, 8 ) ); ?>
				<?php if ( $base_total ) : ?>
					<br><strong><?php esc_html_e( 'Base Total:', 'swift-currency' ); ?></strong> <?php echo esc_html( $this->currency_manager->format_price( $base_total, $base ) ); ?>
				<?php endif; ?>
			<?php endif; ?>
		</div>
		<?php
	}

	// ─── EMAIL ───────────────────────────────────────────────────────────────

	public function add_currency_to_email( $fields, $sent_to_admin, $order ) {
		if ( $order->get_currency() ) {
			$fields['order_currency'] = array(
				'label' => __( 'Currency', 'swift-currency' ),
				'value' => $order->get_currency(),
			);
		}
		return $fields;
	}

	// ─── HELPERS ─────────────────────────────────────────────────────────────

	/**
	 * Read the user's selected currency from the cookie.
	 * This is the ONLY source of truth — never writes, never touches session.
	 */
	private function get_selected() {
		if ( isset( $_COOKIE['swiftcurrency_selected'] ) ) {
			$code = sanitize_text_field( wp_unslash( $_COOKIE['swiftcurrency_selected'] ) );
			if ( $code ) {
				return $code;
			}
		}
		return $this->settings->get( 'general', 'base_currency', 'USD' );
	}

}
