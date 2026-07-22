<?php

namespace Codeies\SwiftCurrency\Admin\Tabs;

if (!defined('ABSPATH')) {
	exit;
}

class PaymentGateways_Tab
{

	private $settings;
	private $currency_manager;

	public function __construct($settings, $currency_manager)
	{
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
	}

	public function render()
	{
		// When Pro is active, let it render the real tab content.
		if ( \Codeies\SwiftCurrency\Utils::is_pro() ) {
			do_action( 'swiftcurrency_admin_gateways_tab_content', $this->settings, $this->currency_manager );
			return;
		}
?>
		<div class="swiftcurrency-pro-feature">
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-cart"></span></div>
					<div>
						<h3>
							<?php esc_html_e('Payment Gateway Management', 'swift-currency'); ?>
							<span class="sc-pro-badge"><?php esc_html_e('PRO', 'swift-currency'); ?></span>
						</h3>
						<p><?php esc_html_e('Advanced payment gateway features are available in Swift Currency Pro.', 'swift-currency'); ?></p>
					</div>
				</div>

				<div class="sc-pro-feature-content">
					<div class="sc-pro-feature-list">
						<h4><?php esc_html_e('Pro Features Include:', 'swift-currency'); ?></h4>
						<ul>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Payment Gateway Restrictions', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('Control which currencies each payment gateway supports and restrict gateways by currency.', 'swift-currency'); ?></p>
							</li>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Auto-Convert Unsupported Currencies', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('Automatically convert to base currency if a gateway doesn\'t support the customer\'s selection.', 'swift-currency'); ?></p>
							</li>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Gateway Currency Mapping', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('Map specific currencies to specific payment gateways for better control.', 'swift-currency'); ?></p>
							</li>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Per-Gateway Checkout Restrictions', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('Restrict or configure checkout behaviour per individual payment gateway — independently of the global multi-currency checkout toggle available in the Pricing tab.', 'swift-currency'); ?></p>
							</li>
						</ul>
					</div>

					<div class="sc-pro-cta">
						<h4><?php esc_html_e('Upgrade to Swift Currency Pro', 'swift-currency'); ?></h4>
						<p><?php esc_html_e('Get access to advanced payment gateway management and many more premium features.', 'swift-currency'); ?></p>
						<a href="https://codeies.com/account/swiftcurrency/" target="_blank" class="button button-primary button-large">
							<?php esc_html_e('Upgrade to Pro', 'swift-currency'); ?>
						</a>
					</div>
				</div>
			</div>
		</div>

<?php
	}
}
