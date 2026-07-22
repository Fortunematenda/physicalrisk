<?php

/**
 * Rates Settings Tab
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Admin\Tabs;

// Exit if accessed directly.
if (! defined('ABSPATH')) {
	exit;
}

/**
 * Rates_Tab class.
 */
class Rates_Tab
{

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
	public function __construct($settings, $currency_manager)
	{
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
	}

	/**
	 * Enqueue tab assets.
	 */
	public function enqueue_assets()
	{
		$script = "
		(function(){
			var provSel = document.getElementById('rate_provider');
			if (!provSel) return;
			function toggleApiKey() {
				var v = provSel.value;
				var row = document.querySelector('.sc-provider-api-key');
				if (row) row.style.display = (v === 'ecb' || v === 'manual') ? 'none' : '';
			}
			provSel.addEventListener('change', toggleApiKey);
			toggleApiKey();
		})();";

		wp_add_inline_script('swiftcurrency-admin', $script);
	}

	/**
	 * Render settings tab.
	 */
	public function render()
	{
		$provider = $this->settings->get('rates', 'provider', 'ecb');
		$api_key  = $this->settings->get('rates', 'api_key', '');
?>
		<form method="post" action="options.php" class="swiftcurrency-form">
			<?php settings_fields('swiftcurrency_settings'); ?>

			<!-- Fiat Rate Providers -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-tickets-alt"></span></div>
					<div>
						<h3><?php esc_html_e('Fiat Rate Provider', 'swift-currency'); ?></h3>
						<p><?php esc_html_e('Choose the service that supplies live exchange rates for fiat currencies.', 'swift-currency'); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e('Provider', 'swift-currency'); ?>
						<span class="sc-field-desc"><?php esc_html_e('Free providers require no API key.', 'swift-currency'); ?></span>
					</div>
					<div class="sc-field-input">
						<select name="swiftcurrency_settings[rates][provider]" id="rate_provider" class="sc-select-md">
							<option value="ecb" <?php selected($provider, 'ecb'); ?>><?php esc_html_e('European Central Bank (Free)', 'swift-currency'); ?></option>
							<?php
							/**
							 * Hook to add more rate providers.
							 * Used by Pro to add ExchangeRate-API, Fixer, etc.
							 */
							do_action('swiftcurrency_admin_rates_tab_providers', $provider);
							?>
							<option value="manual" <?php selected($provider, 'manual'); ?>><?php esc_html_e('Manual Rates', 'swift-currency'); ?></option>
						</select>
					</div>
				</div>

				<div class="sc-field sc-provider-api-key" <?php echo ( 'ecb' === $provider || 'manual' === $provider ) ? 'style="display:none;"' : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Static safe strings only. ?>>
					<div class="sc-field-label">
						<?php esc_html_e('API Key', 'swift-currency'); ?>
						<span class="sc-field-desc"><?php esc_html_e('Enter your API key for the selected provider.', 'swift-currency'); ?></span>
					</div>
					<div class="sc-field-input sc-field-inline">
						<input type="text" name="swiftcurrency_settings[rates][api_key]" id="api_key" value="<?php echo esc_attr($api_key); ?>" class="sc-input-md">
						<button type="button" class="button button-secondary sc-btn-test" id="test-api-connection">
							<span class="dashicons dashicons-update"></span>
							<?php esc_html_e('Test Connection', 'swift-currency'); ?>
						</button>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e('Update Interval', 'swift-currency'); ?>
						<span class="sc-field-desc"><?php esc_html_e('How often to fetch new exchange rates.', 'swift-currency'); ?></span>
					</div>
					<div class="sc-field-input">
						<select name="swiftcurrency_settings[rates][update_interval]" id="update_interval" class="sc-select-sm">
							<?php
							$intervals = swiftcurrency_get_update_intervals();
							foreach ($intervals as $val => $label) {
								echo '<option value="' . esc_attr($val) . '" ' . selected($this->settings->get('rates', 'update_interval', 3600), $val, false) . '>' . esc_html($label) . '</option>';
							}
							?>
						</select>
					</div>
				</div>
			</div>

			<!-- Crypto Rate Providers -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-chart-line"></span></div>
					<div>
						<h3><?php esc_html_e('Cryptocurrency Rate Provider', 'swift-currency'); ?></h3>
						<p><?php esc_html_e('Choose the service that supplies live rates for cryptocurrency pairs.', 'swift-currency'); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e('Crypto Provider', 'swift-currency'); ?>
					</div>
					<div class="sc-field-input sc-field-inline">
						<select name="swiftcurrency_settings[rates][crypto_provider]" id="crypto_provider" class="sc-select-md">
							<option value="coingecko" <?php selected($this->settings->get('rates', 'crypto_provider', 'coingecko'), 'coingecko'); ?>><?php esc_html_e('CoinGecko (Free)', 'swift-currency'); ?></option>
							<option value="binance" <?php selected($this->settings->get('rates', 'crypto_provider', 'coingecko'), 'binance'); ?>><?php esc_html_e('Binance (Free)', 'swift-currency'); ?></option>
							<option value="manual" <?php selected($this->settings->get('rates', 'crypto_provider', 'coingecko'), 'manual'); ?>><?php esc_html_e('Manual Rates', 'swift-currency'); ?></option>
						</select>
						<button type="button" class="button button-secondary sc-btn-test" id="test-crypto-api">
							<span class="dashicons dashicons-update"></span>
							<?php esc_html_e('Test Connection', 'swift-currency'); ?>
						</button>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e('Crypto Update Interval', 'swift-currency'); ?>
						<span class="sc-field-desc"><?php esc_html_e('Recommended: Every Hour.', 'swift-currency'); ?></span>
					</div>
					<div class="sc-field-input">
						<select name="swiftcurrency_settings[rates][crypto_update_interval]" id="crypto_update_interval" class="sc-select-sm">
							<?php
							// Both fiat and crypto now use the same interval set.
							foreach ($intervals as $val => $label) {
								echo '<option value="' . esc_attr($val) . '" ' . selected($this->settings->get('rates', 'crypto_update_interval', 3600), $val, false) . '>' . esc_html($label) . '</option>';
							}
							?>
						</select>
					</div>
				</div>
			</div>

			<div class="sc-submit-row">
				<?php submit_button(null, 'primary', 'submit', false); ?>
			</div>
		</form>
<?php
	}
}
