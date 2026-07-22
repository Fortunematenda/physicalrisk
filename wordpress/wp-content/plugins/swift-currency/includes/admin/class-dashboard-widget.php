<?php
/**
 * Dashboard Widget Class
 *
 * Displays currency update information in WordPress dashboard.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency\Admin;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Dashboard Widget class.
 *
 * @class Dashboard_Widget
 * @version 1.0.0
 */
class Dashboard_Widget {

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;


	public function __construct( $settings ) {
		$this->settings = $settings;
		$this->init_hooks();
	}

	/**
	 * Initialize hooks.
	 */
	private function init_hooks() {
		add_action( 'wp_dashboard_setup', array( $this, 'add_dashboard_widget' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_scripts' ) );
	}

	/**
	 * Add dashboard widget.
	 */
	public function add_dashboard_widget() {
		wp_add_dashboard_widget(
			'swiftcurrency_status',
			'<span class="dashicons dashicons-money-alt"></span> ' . __( 'SwiftCurrency Status', 'swift-currency' ),
			array( $this, 'render_dashboard_widget' )
		);
	}

	/**
	 * Enqueue scripts and styles for dashboard widget.
	 *
	 * @param string $hook Current page hook.
	 */
	public function enqueue_scripts( $hook ) {
		if ( 'index.php' !== $hook ) {
			return;
		}

		wp_register_style(
			'swiftcurrency-admin',
			SWIFTCURRENCY_ASSETS_URL . 'css/admin.css',
			array(),
			SWIFTCURRENCY_VERSION
		);
		wp_enqueue_style( 'swiftcurrency-admin' );
	}

	/**
	 * Render dashboard widget content.
	 */
	public function render_dashboard_widget() {
		// Get last update time.
		$last_update = get_option( 'swiftcurrency_last_rate_update', false );
		
		// Get next scheduled update.
		$next_update = wp_next_scheduled( 'swiftcurrency_update_rates' );
		
		// Get update interval.
		$update_interval = $this->settings->get( 'rates', 'update_interval', 'daily' );
		$auto_update = $this->settings->get( 'rates', 'auto_update', true );
		
		// Get provider.
		$provider = $this->settings->get( 'rates', 'provider', 'ecb' );
		$provider_names = array(
			'ecb'                => 'European Central Bank',
			'fixer'              => 'Fixer.io',
			'currencylayer'      => 'CurrencyLayer',
			'openexchangerates'  => 'Open Exchange Rates',
			'manual'             => 'Manual Rates',
		);
		$provider_name = isset( $provider_names[ $provider ] ) ? $provider_names[ $provider ] : ucfirst( $provider );
		
		// Get enabled currencies count (respect limit).
		$enabled_currencies = swiftcurrency_get_enabled_currencies();
		$currency_count = count( $enabled_currencies );
		
		?>


		<div class="swiftcurrency-dashboard-widget">
			<div class="swiftcurrency-status-grid">
				<!-- Last Update -->
				<div class="swiftcurrency-status-item <?php echo esc_attr( $last_update ? 'success' : 'warning' ); ?>">
					<div class="swiftcurrency-status-label">
						<?php esc_html_e( 'Last Update', 'swift-currency' ); ?>
					</div>
					<div class="swiftcurrency-status-value">
						<?php
						if ( $last_update ) {
							$timestamp = strtotime( $last_update );
							echo esc_html( human_time_diff( $timestamp, current_time( 'timestamp' ) ) . ' ago' );
						} else {
							esc_html_e( 'Never', 'swift-currency' );
						}
						?>
					</div>
					<?php if ( $last_update ) : ?>
						<div class="swiftcurrency-status-time">
							<?php echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $last_update ) ) ); ?>
						</div>
					<?php endif; ?>
				</div>

				<!-- Next Update -->
				<div class="swiftcurrency-status-item <?php echo esc_attr( $next_update ? 'success' : 'error' ); ?>">
					<div class="swiftcurrency-status-label">
						<?php esc_html_e( 'Next Update', 'swift-currency' ); ?>
					</div>
					<div class="swiftcurrency-status-value">
						<?php
						if ( $next_update ) {
							echo esc_html( human_time_diff( current_time( 'timestamp' ), $next_update ) );
						} else {
							esc_html_e( 'Not Scheduled', 'swift-currency' );
						}
						?>
					</div>
					<?php if ( $next_update ) : ?>
						<div class="swiftcurrency-status-time">
							<?php echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $next_update ) ); ?>
						</div>
					<?php endif; ?>
				</div>

				<!-- Auto Update Status -->
				<div class="swiftcurrency-status-item">
					<div class="swiftcurrency-status-label">
						<?php esc_html_e( 'Auto Update', 'swift-currency' ); ?>
					</div>
					<div class="swiftcurrency-status-value">
						<span class="swiftcurrency-status-icon <?php echo esc_attr( $auto_update ? 'active' : 'inactive' ); ?>"></span>
						<?php echo $auto_update ? esc_html__( 'Enabled', 'swift-currency' ) : esc_html__( 'Disabled', 'swift-currency' ); ?>
						<span style="font-weight: normal; color: #646970;">
							(<?php echo esc_html( ucfirst( str_replace( array( 'sixhourly', 'twelvehourly', 'twicedaily' ), array( '6 hours', '12 hours', 'twice daily' ), $update_interval ) ) ); ?>)
						</span>
					</div>
				</div>

				<!-- Provider & Currencies -->
				<div class="swiftcurrency-status-item">
					<div class="swiftcurrency-status-label">
						<?php esc_html_e( 'Provider', 'swift-currency' ); ?>
					</div>
					<div class="swiftcurrency-status-value">
						<?php echo esc_html( $provider_name ); ?>
					</div>
					<div class="swiftcurrency-status-time">
						<?php
						/* translators: %d: number of currencies */
						echo esc_html( sprintf( _n( '%d currency enabled', '%d currencies enabled', $currency_count, 'swift-currency' ), $currency_count ) );
						?>
					</div>
				</div>
			</div>

			<div class="swiftcurrency-quick-actions">
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=swiftcurrency-rates' ) ); ?>" class="button button-small">
					<span class="dashicons dashicons-update" style="margin-top: 3px;"></span>
					<?php esc_html_e( 'View Rates', 'swift-currency' ); ?>
				</a>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=swiftcurrency-settings' ) ); ?>" class="button button-small">
					<span class="dashicons dashicons-admin-settings" style="margin-top: 3px;"></span>
					<?php esc_html_e( 'Settings', 'swift-currency' ); ?>
				</a>
				<?php if ( ! \Codeies\SwiftCurrency\Utils::is_pro() ) : ?>
					<a href="<?php echo esc_url( swiftcurrency_get_upgrade_url( 'dashboard_widget' ) ); ?>" class="button button-small button-primary" style="background: #d63638; border-color: #d63638;">
						<span class="dashicons dashicons-star-filled" style="margin-top: 3px;"></span>
						<?php esc_html_e( 'Upgrade to Pro', 'swift-currency' ); ?>
					</a>
				<?php elseif ( $auto_update ) : ?>
					<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin.php?page=swiftcurrency-rates&action=refresh_rates' ), 'refresh_rates' ) ); ?>" class="button button-small button-primary">
						<span class="dashicons dashicons-update-alt" style="margin-top: 3px;"></span>
						<?php esc_html_e( 'Update Now', 'swift-currency' ); ?>
					</a>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}
}
