<?php
/**
 * Advanced Settings Tab
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Admin\Tabs;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Advanced_Tab class.
 */
class Advanced_Tab {

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * Constructor.
	 *
	 * @param \Codeies\SwiftCurrency\Settings $settings Settings instance.
	 */
	public function __construct( $settings ) {
		$this->settings = $settings;
	}

	/**
	 * Render settings tab.
	 */
	public function render() {
		?>
		<div class="swiftcurrency-form">
			<!-- Cache Settings -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-database"></span></div>
					<div>
						<h3><?php esc_html_e( 'Caching', 'swift-currency' ); ?></h3>
						<p><?php esc_html_e( 'Control how exchange rates are cached to improve performance.', 'swift-currency' ); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Enable Rate Caching', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'Cache exchange rates locally to reduce API requests.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<label class="sc-toggle">
							<input type="checkbox" data-section="advanced" data-key="cache_enabled" class="sc-auto-save"
								   <?php checked( $this->settings->get( 'advanced', 'cache_enabled', true ) ); ?>>
							<span class="sc-toggle-slider"></span>
						</label>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Cache Duration', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'How long (in seconds) to keep cached rates.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<input type="number" data-section="advanced" data-key="cache_duration" class="sc-input-md sc-auto-save" 
							   value="<?php echo esc_attr( $this->settings->get( 'advanced', 'cache_duration', 3600 ) ); ?>" min="300" step="300">
						<p class="sc-field-hint"><?php esc_html_e( 'Minimum recommended: 3600 (1 hour).', 'swift-currency' ); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Clear Cache', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'Force-refresh all cached exchange rate data.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<button type="button" class="button button-secondary" id="clear-rate-cache">
							<span class="dashicons dashicons-trash"></span>
							<?php esc_html_e( 'Clear Cache Now', 'swift-currency' ); ?>
						</button>
						<span id="clear-cache-status" style="margin-left:10px;"></span>
					</div>
				</div>
			</div>

				<!-- Debug & Logging -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-media-text"></span></div>
					<div>
						<h3><?php esc_html_e( 'Logging & Debug', 'swift-currency' ); ?></h3>
						<p><?php esc_html_e( 'Track plugin activity and troubleshoot issues.', 'swift-currency' ); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Enable Logging', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'Record exchange rate updates and errors to a log file.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<label class="sc-toggle">
							<input type="checkbox" data-section="advanced" data-key="enable_logging" class="sc-auto-save"
								   <?php checked( $this->settings->get( 'advanced', 'enable_logging', false ) ); ?>>
							<span class="sc-toggle-slider"></span>
						</label>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Log Retention', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'Number of days to keep log entries.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<input type="number" data-section="advanced" data-key="log_retention_days" class="sc-input-sm sc-auto-save" 
							   value="<?php echo esc_attr( $this->settings->get( 'advanced', 'log_retention_days', 30 ) ); ?>" min="1" max="90">
						<span class="sc-field-hint"><?php esc_html_e( 'days', 'swift-currency' ); ?></span>
					</div>
				</div>
			</div>

			<!-- System Maintenance -->
			<div class="sc-card">
				<div class="sc-card-header">
					<div class="sc-card-header-icon"><span class="dashicons dashicons-admin-tools"></span></div>
					<div>
						<h3><?php esc_html_e( 'Maintenance', 'swift-currency' ); ?></h3>
						<p><?php esc_html_e( 'Cleanup and uninstallation preferences.', 'swift-currency' ); ?></p>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label">
						<?php esc_html_e( 'Delete Data on Uninstall', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'Permanently remove all settings and cached rates when the plugin is deleted.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<label class="sc-toggle">
							<input type="checkbox" data-section="advanced" data-key="delete_on_uninstall" class="sc-auto-save"
								   <?php checked( $this->settings->get( 'advanced', 'delete_on_uninstall', false ) ); ?>>
							<span class="sc-toggle-slider"></span>
						</label>
					</div>
				</div>

				<div class="sc-field">
					<div class="sc-field-label sc-field-label-danger">
						<?php esc_html_e( 'Reset All Settings', 'swift-currency' ); ?>
						<span class="sc-field-desc"><?php esc_html_e( 'This will permanently delete all SwiftCurrency settings. This action cannot be undone.', 'swift-currency' ); ?></span>
					</div>
					<div class="sc-field-input">
						<button type="button" class="button sc-btn-danger" id="reset-all-settings">
							<span class="dashicons dashicons-warning"></span>
							<?php esc_html_e( 'Reset Settings', 'swift-currency' ); ?>
						</button>
					</div>
				</div>
			</div>
		</div>
		<?php
	}
}
