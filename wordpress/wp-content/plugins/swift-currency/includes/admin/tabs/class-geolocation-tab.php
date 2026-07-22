<?php

namespace Codeies\SwiftCurrency\Admin\Tabs;

if (!defined('ABSPATH')) {
	exit;
}

class Geolocation_Tab
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
			do_action( 'swiftcurrency_admin_geolocation_tab_content', $this->settings, $this->currency_manager );
			return;
		}
?>
		<div class="swiftcurrency-pro-feature">
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-location"></span></div>
					<div>
						<h3>
							<?php esc_html_e('Geolocation & Smart Targeting', 'swift-currency'); ?>
							<span class="sc-pro-badge"><?php esc_html_e('PRO', 'swift-currency'); ?></span>
						</h3>
						<p><?php esc_html_e('Automatic currency switching based on visitor location is available in Swift Currency Pro.', 'swift-currency'); ?></p>
					</div>
				</div>

				<div class="sc-pro-feature-content">
					<div class="sc-pro-feature-list">
						<h4><?php esc_html_e('Pro Features Include:', 'swift-currency'); ?></h4>
						<ul>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Instant Geolocation Detection', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('IP-based country lookup with smart caching powered by premium providers.', 'swift-currency'); ?></p>
							</li>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Country-to-Currency Rules', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('Map any country to the perfect default currency and override WooCommerce defaults.', 'swift-currency'); ?></p>
							</li>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Edge Network Compatibility', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('Honor Cloudflare headers and CDN geo data for near-zero latency switching.', 'swift-currency'); ?></p>
							</li>
							<li>
								<span class="dashicons dashicons-yes-alt"></span>
								<strong><?php esc_html_e('Fallback & Consent Controls', 'swift-currency'); ?></strong>
								<p><?php esc_html_e('Built-in privacy prompts plus graceful fallbacks when location data is unavailable.', 'swift-currency'); ?></p>
							</li>
						</ul>
					</div>

					<div class="sc-pro-cta">
						<h4><?php esc_html_e('Upgrade to Swift Currency Pro', 'swift-currency'); ?></h4>
						<p><?php esc_html_e('Unlock automated geolocation, smart rules, and many more premium tools.', 'swift-currency'); ?></p>
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
