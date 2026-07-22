<?php

/**
 * General Settings Tab
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Admin\Tabs;

// Exit if accessed directly.
if (! defined('ABSPATH')) {
	exit;
}

/**
 * General_Tab class.
 */
class General_Tab
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


	public function __construct($settings, $currency_manager)
	{
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
	}

	/**
	 * Get flag URL for a currency code.
	 *
	 * @param string $code Currency code.
	 * @return string Flag URL.
	 */
	private function get_flag_url($code)
	{
		$code = strtoupper($code);
		$lower_code = strtolower($code);

		// 1. Try full currency code (e.g. BTC -> btc.svg, USD -> usd.svg)
		$flag_path = SWIFTCURRENCY_PLUGIN_DIR . 'assets/images/flags/' . $lower_code . '.svg';
		if (file_exists($flag_path)) {
			return SWIFTCURRENCY_PLUGIN_URL . 'assets/images/flags/' . $lower_code . '.svg';
		}

		// 2. Specific mappings
		$mappings = array(
			'EUR' => 'eu',
			'USD' => 'us',
			'GBP' => 'gb',
			'JPY' => 'jp',
			'CAD' => 'ca',
			'AUD' => 'au',
			'CHF' => 'ch',
			'CNY' => 'cn',
			'INR' => 'in',
		);

		if (isset($mappings[$code])) {
			$country_code = $mappings[$code];
			$flag_path = SWIFTCURRENCY_PLUGIN_DIR . 'assets/images/flags/' . $country_code . '.svg';
			if (file_exists($flag_path)) {
				return SWIFTCURRENCY_PLUGIN_URL . 'assets/images/flags/' . $country_code . '.svg';
			}
		}

		// 3. Fallback to 2-letter substr (least reliable)
		$country_code = strtolower(substr($code, 0, 2));
		$flag_path = SWIFTCURRENCY_PLUGIN_DIR . 'assets/images/flags/' . $country_code . '.svg';
		if (file_exists($flag_path)) {
			return SWIFTCURRENCY_PLUGIN_URL . 'assets/images/flags/' . $country_code . '.svg';
		}

		return '';
	}

	/**
	 * Enqueue tab assets.
	 */
	public function enqueue_assets()
	{
		$script = "
		(function(){
			var syncBtn = document.querySelector('.sc-sync-wc-currency');
			if (!syncBtn) return;
			syncBtn.addEventListener('click', function(){
				var btn    = this;
				var status = btn.nextElementSibling;
				var data   = new FormData();
				data.append('action', 'swiftcurrency_sync_wc_currency');
				data.append('nonce',  btn.dataset.nonce);
				data.append('currency', btn.dataset.pluginCurrency);
				btn.disabled = true;
				status.textContent = '" . esc_js(__('Updating…', 'swift-currency')) . "';
				fetch('" . esc_url(admin_url('admin-ajax.php')) . "', { method:'POST', body:data })
					.then(function(r){ return r.json(); })
					.then(function(res){
						if ( res.success ) {
							status.textContent = '" . esc_js(__('Done! Reload to verify.', 'swift-currency')) . "';
							btn.closest('.notice').style.borderLeftColor = '#46b450';
						} else {
							status.textContent = res.data && res.data.message ? res.data.message : '" . esc_js(__('Failed.', 'swift-currency')) . "';
							btn.disabled = false;
						}
					})
					.catch(function(){ status.textContent = '" . esc_js(__('Error.', 'swift-currency')) . "'; btn.disabled = false; });
			});
		})();";

		wp_add_inline_script('swiftcurrency-admin', $script);
	}

	/**
	 * Render settings tab.
	 */
	public function render()
	{
		if (! \Codeies\SwiftCurrency\Utils::is_pro()) {
?>
			<div class="sc-upgrade-notice-full">
				<div class="sc-upgrade-info">
					<span class="dashicons dashicons-warning"></span>
					<div class="sc-upgrade-text">
						<strong><?php esc_html_e('Free version supports upto 3 currencies. Upgrade for more!', 'swift-currency'); ?></strong>
					</div>
				</div>
				<a href="https://codeies.com/account/swiftcurrency/" target="_blank" class="sc-btn-upgrade">
					<?php esc_html_e('Upgrade Now', 'swift-currency'); ?>
					<span class="dashicons dashicons-arrow-right-alt2"></span>
				</a>
			</div>
<?php
		}

		$plugin_base    = $this->settings->get('general', 'base_currency', 'USD');
		$enabled_currencies = $this->settings->get('general', 'enabled_currencies', array());
		$enabled_currencies = is_array($enabled_currencies) ? $enabled_currencies : array();

		// Ensure base is in the list and at the top if not already.
		if (! in_array($plugin_base, $enabled_currencies, true)) {
			\array_unshift($enabled_currencies, $plugin_base);
		} else {
			// Move base to top for consistent UI.
			$enabled_currencies = \array_diff($enabled_currencies, array($plugin_base));
			\array_unshift($enabled_currencies, $plugin_base);
		}

		$all_currencies = $this->currency_manager->get_all_currencies();

		$fiat_currencies   = array();
		$crypto_currencies = array();
		foreach ($all_currencies as $code => $currency) {
			if ($this->currency_manager->is_crypto($code)) {
				$crypto_currencies[$code] = $currency;
			} else {
				$fiat_currencies[$code] = $currency;
			}
		}

		// WooCommerce currency mismatch notice.
		$wc_active = class_exists('WooCommerce');
		$wc_base   = $wc_active ? get_option('woocommerce_currency') : '';

		// Verify that we are comparing the plugin's base currency setting with WC's base.
		if ($wc_active && $wc_base && $wc_base !== $plugin_base) {
?>
			<div class="notice notice-warning inline">
				<p>
					<?php
					echo wp_kses_post(
						sprintf(
							/* translators: 1: plugin base currency, 2: WooCommerce base currency */
							__('<strong>Currency Mismatch:</strong> SwiftCurrency is using <strong>%1$s</strong> as the base currency, but WooCommerce is set to <strong>%2$s</strong>. Prices displayed in WooCommerce may be incorrect.', 'swift-currency'),
							esc_html($plugin_base),
							esc_html($wc_base)
						)
					);
					?>
					&nbsp;
					<button type="button"
						class="button button-secondary sc-sync-wc-currency"
						data-plugin-currency="<?php echo esc_attr($plugin_base); ?>"
						data-nonce="<?php echo esc_attr(wp_create_nonce('swiftcurrency_admin')); ?>">
						<?php
						echo wp_kses_post(
							sprintf(
								/* translators: %s: plugin base currency code */
								__('Update WooCommerce to %s', 'swift-currency'),
								esc_html($plugin_base)
							)
						);
						?>
					</button>
					<span class="sc-sync-status" style="margin-left:8px;"></span>
				</p>
			</div>
		<?php
		}
		?>
		<form method="post" action="options.php" class="swiftcurrency-form">
			<?php settings_fields('swiftcurrency_settings'); ?>

			<!-- Base Currency -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-admin-site-alt3"></span></div>
					<div>
						<h3><?php esc_html_e('Store Currency', 'swift-currency'); ?></h3>
						<p><?php esc_html_e('Define your base currency and which currencies customers can switch to.', 'swift-currency'); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e('Base Currency', 'swift-currency'); ?>
						<span class="sc-field-desc"><?php esc_html_e('Your store\'s primary currency. All prices are converted from this.', 'swift-currency'); ?></span>
					</div>
					<div class="sc-field-input">
						<select name="swiftcurrency_settings[general][base_currency]" id="base_currency" class="sc-select-md">
							<?php if (! empty($fiat_currencies)) : ?>
								<optgroup label="<?php esc_attr_e('Fiat Currencies', 'swift-currency'); ?>">
									<?php foreach ($fiat_currencies as $code => $currency) : ?>
										<option value="<?php echo esc_attr($code); ?>" <?php selected($plugin_base, $code); ?>>
											<?php echo esc_html($code . ' — ' . $currency['name']); ?>
										</option>
									<?php endforeach; ?>
								</optgroup>
							<?php endif; ?>

							<?php if (! empty($crypto_currencies)) : ?>
								<optgroup label="<?php esc_attr_e('Cryptocurrencies', 'swift-currency'); ?>">
									<?php foreach ($crypto_currencies as $code => $currency) : ?>
										<option value="<?php echo esc_attr($code); ?>" <?php selected($plugin_base, $code); ?>>
											<?php echo esc_html($code . ' — ' . $currency['name']); ?>
										</option>
									<?php endforeach; ?>
								</optgroup>
							<?php endif; ?>
						</select>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e('Enabled Currencies', 'swift-currency'); ?>
						<span class="sc-field-desc">
							<?php esc_html_e('Select currencies customers can switch to.', 'swift-currency'); ?>
						</span>
					</div>
					<div class="sc-field-input">
						<div class="sc-enabled-currencies-wrap">
							<div class="sc-active-currencies" id="sc-active-currencies">
								<input type="hidden" name="swiftcurrency_settings[general][enabled_currencies]" value="">
								<?php
								// We already consolidation base currency at the start of render()

								foreach ($enabled_currencies as $code) :
									$currency = $all_currencies[$code] ?? null;
									if (! $currency) continue;
									$flag_url = $this->get_flag_url($code);
									$is_base  = ($code === $plugin_base);
								?>
									<div class="sc-active-currency-item<?php echo esc_attr( $is_base ? ' is-base' : '' ); ?>" data-code="<?php echo esc_attr($code); ?>">
										<div class="sc-active-currency-info">
											<?php if ($flag_url) : ?>
												<img src="<?php echo esc_url($flag_url); ?>" alt="<?php echo esc_attr($code); ?>" class="sc-flag">
											<?php else : ?>
												<span class="sc-flag-placeholder"><?php echo esc_html(substr($code, 0, 2)); ?></span>
											<?php endif; ?>
											<span class="sc-code"><?php echo esc_html($code); ?></span>
											<span class="sc-name"><?php echo esc_html($currency['name']); ?></span>
											<?php if ($this->currency_manager->is_crypto($code)) : ?>
												<span class="sc-crypto-badge"><?php esc_html_e('Crypto', 'swift-currency'); ?></span>
											<?php endif; ?>
											<?php if ($is_base) : ?>
												<span class="sc-base-badge"><?php esc_html_e('Base', 'swift-currency'); ?></span>
											<?php endif; ?>
										</div>
										<input type="hidden" name="swiftcurrency_settings[general][enabled_currencies][]" value="<?php echo esc_attr($code); ?>">
										<?php if (! $is_base) : ?>
											<button type="button" class="sc-remove-currency" title="<?php esc_attr_e('Remove', 'swift-currency'); ?>">
												<span class="dashicons dashicons-no-alt"></span>
											</button>
										<?php endif; ?>
									</div>
								<?php endforeach; ?>
							</div>

							<div class="sc-add-currency-wrap">
								<button type="button" class="button button-secondary sc-add-currency-trigger" id="sc-add-currency-trigger">
									<span class="dashicons dashicons-plus"></span> <?php esc_html_e('Add Currency', 'swift-currency'); ?>
								</button>
								<span class="sc-crypto-ready-note">
									<span class="dashicons dashicons-money-alt"></span>
									<?php esc_html_e('Crypto-Ready', 'swift-currency'); ?>
								</span>

								<p class="sc-field-hint-bottom">
									<?php
									printf(
										/* translators: %s: URL to currencies page */
										wp_kses_post(__('Can\'t find your currency? <a href="%s">Add custom fiat or crypto currencies</a>.', 'swift-currency')),
										esc_url(admin_url('admin.php?page=swiftcurrency-currencies'))
									);
									?>
								</p>

								<div class="sc-currency-selection-panel" id="sc-currency-selection-panel">
									<div class="sc-selection-search">
										<span class="dashicons dashicons-search"></span>
										<input type="text" id="sc-selection-search-input" placeholder="<?php esc_attr_e('Search currencies…', 'swift-currency'); ?>">
									</div>
									<div class="sc-selection-list" id="sc-selection-list">
										<?php if (! empty($fiat_currencies)) : ?>
											<div class="sc-selection-header"><?php esc_html_e('Fiat Currencies', 'swift-currency'); ?></div>
											<?php
											foreach ($fiat_currencies as $code => $currency) :
												$flag_url = $this->get_flag_url($code);
												$is_enabled = in_array($code, $enabled_currencies, true);
											?>
											<div class="sc-selection-item<?php echo esc_attr( $is_enabled ? ' is-selected' : '' ); ?>"
													data-code="<?php echo esc_attr($code); ?>"
													data-name="<?php echo esc_attr($currency['name']); ?>"
													data-flag="<?php echo esc_url($flag_url); ?>">
													<div class="sc-selection-item-info">
														<?php if ($flag_url) : ?>
															<img src="<?php echo esc_url($flag_url); ?>" alt="" class="sc-flag">
														<?php else : ?>
															<span class="sc-flag-placeholder"><?php echo esc_html(substr($code, 0, 2)); ?></span>
														<?php endif; ?>
														<span class="sc-item-code"><?php echo esc_html($code); ?></span>
														<span class="sc-item-name"><?php echo esc_html($currency['name']); ?></span>
													</div>
													<span class="sc-selection-check dashicons dashicons-yes"></span>
												</div>
											<?php endforeach; ?>
										<?php endif; ?>

										<?php if (! empty($crypto_currencies)) : ?>
											<div class="sc-selection-header"><?php esc_html_e('Cryptocurrencies', 'swift-currency'); ?></div>
											<?php
											foreach ($crypto_currencies as $code => $currency) :
												$flag_url = $this->get_flag_url($code);
												$is_enabled = in_array($code, $enabled_currencies, true);
											?>
											<div class="sc-selection-item<?php echo esc_attr( $is_enabled ? ' is-selected' : '' ); ?>"
													data-code="<?php echo esc_attr($code); ?>"
													data-name="<?php echo esc_attr($currency['name']); ?>"
													data-flag="<?php echo esc_url($flag_url); ?>">
													<div class="sc-selection-item-info">
														<?php if ($flag_url) : ?>
															<img src="<?php echo esc_url($flag_url); ?>" alt="" class="sc-flag">
														<?php else : ?>
															<span class="sc-flag-placeholder"><?php echo esc_html(substr($code, 0, 2)); ?></span>
														<?php endif; ?>
														<span class="sc-item-code"><?php echo esc_html($code); ?></span>
														<span class="sc-item-name"><?php echo esc_html($currency['name']); ?></span>
														<span class="sc-crypto-badge sc-badge-sm"><?php esc_html_e('Crypto', 'swift-currency'); ?></span>
													</div>
													<span class="sc-selection-check dashicons dashicons-yes"></span>
												</div>
											<?php endforeach; ?>
										<?php endif; ?>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<?php
			/**
			 * Hook to render additional sections in General tab.
			 */
			do_action('swiftcurrency_admin_general_tab_bottom', $this->settings);
			?>

			<div class="sc-submit-row">
				<?php submit_button(null, 'primary', 'submit', false); ?>
			</div>
		</form>

<?php
	}
}
