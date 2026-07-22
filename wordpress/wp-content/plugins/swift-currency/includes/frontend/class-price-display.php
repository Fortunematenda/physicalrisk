<?php
/**
 * Price Display Class
 *
 * Handles frontend price display formatting.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency\Frontend;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Price Display class.
 *
 * @class Price_Display
 * @version 1.0.0
 */
class Price_Display {

	/**
	 * Currency Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Constructor.
	 *
	 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
	 */
	public function __construct( $currency_manager ) {
		$this->currency_manager = $currency_manager;
		$this->init_hooks();
	}

	/**
	 * Initialize hooks.
	 */
	private function init_hooks() {
		// Add currency info to product pages.
		add_action( 'woocommerce_single_product_summary', array( $this, 'display_currency_info' ), 15 );
	}

	/**
	 * Display currency information on product pages.
	 */
	public function display_currency_info() {
		$current_currency = $this->currency_manager->get_base_currency();
		$base_currency = $this->currency_manager->get_base_currency();

		// Only show if not base currency.
		if ( $current_currency === $base_currency ) {
			return;
		}

		$currency_name = $this->currency_manager->get_currency_name( $current_currency );

		?>
		<div class="swiftcurrency-info">
			<small class="swiftcurrency-notice">
				<?php
				echo wp_kses_post(
					sprintf(
						/* translators: %s: currency name */
						__( 'Prices shown in %s', 'swift-currency' ),
						'<strong>' . esc_html( $currency_name ) . '</strong>'
					)
				);
				?>
			</small>
		</div>
		<?php
	}
}
