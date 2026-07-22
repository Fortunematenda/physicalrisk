<?php
/**
 * Pricing Settings Tab
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Admin\Tabs;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Pricing_Tab class.
 */
class Pricing_Tab {

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


	public function __construct( $settings, $currency_manager ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
	}

	/**
	 * Render settings tab.
	 */
	public function render() {
		?>
		<form method="post" action="options.php" class="swiftcurrency-form">
			<?php settings_fields( 'swiftcurrency_settings' ); ?>

			<!-- Rounding & Decimals -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-calculator"></span></div>
					<div>
						<h3><?php esc_html_e( 'Rounding & Decimals', 'swift-currency' ); ?></h3>
						<p><?php esc_html_e( 'Control decimal places and rounding behaviour for converted prices.', 'swift-currency' ); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Rounding Mode', 'swift-currency' ); ?>
					</div>
					<div class="sc-field-input">
						<select name="swiftcurrency_settings[pricing][rounding_mode]" id="rounding_mode" class="sc-select-sm">
							<option value="nearest" <?php selected( $this->settings->get( 'pricing', 'rounding_mode', 'nearest' ), 'nearest' ); ?>><?php esc_html_e( 'Round to Nearest', 'swift-currency' ); ?></option>
							<option value="up"      <?php selected( $this->settings->get( 'pricing', 'rounding_mode', 'nearest' ), 'up' ); ?>><?php esc_html_e( 'Round Up', 'swift-currency' ); ?></option>
							<option value="down"    <?php selected( $this->settings->get( 'pricing', 'rounding_mode', 'nearest' ), 'down' ); ?>><?php esc_html_e( 'Round Down', 'swift-currency' ); ?></option>
						</select>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Decimal Places', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'For fiat currencies (0–8).', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<input type="number" name="swiftcurrency_settings[pricing][decimal_places]" id="decimal_places" value="<?php echo esc_attr( $this->settings->get( 'pricing', 'decimal_places', 2 ) ); ?>" min="0" max="8" class="sc-input-xs">
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Crypto Decimal Places', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'For cryptocurrency prices (0–10).', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<input type="number" name="swiftcurrency_settings[pricing][crypto_decimal_places]" id="crypto_decimal_places" value="<?php echo esc_attr( $this->settings->get( 'pricing', 'crypto_decimal_places', 8 ) ); ?>" min="0" max="10" class="sc-input-xs">
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Crypto Rounding Mode', 'swift-currency' ); ?>
					</div>
					<div class="sc-field-input">
						<select name="swiftcurrency_settings[pricing][crypto_rounding_mode]" id="crypto_rounding_mode" class="sc-select-sm">
							<option value="nearest" <?php selected( $this->settings->get( 'pricing', 'crypto_rounding_mode', 'nearest' ), 'nearest' ); ?>><?php esc_html_e( 'Round to Nearest', 'swift-currency' ); ?></option>
							<option value="up"      <?php selected( $this->settings->get( 'pricing', 'crypto_rounding_mode', 'nearest' ), 'up' ); ?>><?php esc_html_e( 'Round Up', 'swift-currency' ); ?></option>
							<option value="down"    <?php selected( $this->settings->get( 'pricing', 'crypto_rounding_mode', 'nearest' ), 'down' ); ?>><?php esc_html_e( 'Round Down', 'swift-currency' ); ?></option>
						</select>
					</div>
				</div>
			</div>

			<!-- Checkout Behaviour -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-cart"></span></div>
					<div>
						<h3><?php esc_html_e( 'Checkout Behaviour', 'swift-currency' ); ?></h3>
						<p><?php esc_html_e( 'How the plugin should handle payments in different currencies.', 'swift-currency' ); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Multi-Currency Checkout', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'Allow customers to pay in their selected currency instead of your base currency.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<label class="sc-toggle">
							<input type="hidden" name="swiftcurrency_settings[pricing][checkout_multi_currency]" value="0">
							<input type="checkbox" name="swiftcurrency_settings[pricing][checkout_multi_currency]" value="1" <?php checked( $this->settings->get( 'pricing', 'checkout_multi_currency', false ) ); ?>>
							<span class="sc-toggle-slider"></span>
						</label>
					</div>
				</div>
			</div>

			<?php
			/**
			 * Hook to render additional sections in Pricing tab.
			 * Used by Pro to add Charm Pricing and other sections.
			 */
			do_action( 'swiftcurrency_admin_pricing_tab_bottom', $this->settings, $this->currency_manager );
			?>

			<div class="sc-submit-row">
				<?php submit_button( null, 'primary', 'submit', false ); ?>
			</div>
		</form>
		<?php
	}
}
