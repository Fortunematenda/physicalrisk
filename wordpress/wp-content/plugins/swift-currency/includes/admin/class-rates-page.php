<?php
/**
 * Exchange Rates Management Page
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
 * Rates_Page class.
 *
 * @since 1.0.0
 */
class Rates_Page {

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
	 * Cache Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Cache_Manager
	 */
	private $cache;

	/**
	 * Admin Settings instance (used to resolve rate provider instances).
	 *
	 * @var Admin_Settings
	 */
	private $admin_settings;

	/**
	 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
	 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
	 * @param \Codeies\SwiftCurrency\Cache_Manager    $cache            Cache Manager instance.
	 * @param Admin_Settings                          $admin_settings   Admin Settings instance.
	 */
	public function __construct( $settings, $currency_manager, $cache, $admin_settings ) {
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->cache            = $cache;
		$this->admin_settings   = $admin_settings;
	}

	// -------------------------------------------------------------------------
	// Public methods
	// -------------------------------------------------------------------------

	/**
	 * Render the Exchange Rates admin page.
	 *
	 * Handles POST actions (manual rate edit, bulk refresh) before output.
	 *
	 * @since 1.0.0
	 */
	public function render() {
		$this->handle_manual_rate_update();
		$this->handle_refresh_rates();

		$table         = new Exchange_Rates_Table( $this->currency_manager, $this->settings, $this->cache );
		$base_currency = $this->get_base_currency();
		$provider      = $this->settings->get( 'rates', 'provider', 'ecb' );

		$table->prepare_items();
		?>
		<div class="wrap sc-wrap">
			<?php settings_errors( 'swiftcurrency_settings' ); ?>
			<div class="sc-header">
				<div class="sc-header-icon"><span class="dashicons dashicons-money-alt"></span></div>
				<div>
					<div class="sc-header-title"><?php esc_html_e( 'SwiftCurrency', 'swift-currency' ); ?></div>
					<div class="sc-header-subtitle"><?php esc_html_e( 'Multi-Currency for WooCommerce', 'swift-currency' ); ?></div>
				</div>
			</div>

			<div class="sc-settings-body">
				<h1 class="wp-heading-inline"><?php esc_html_e( 'Exchange Rates', 'swift-currency' ); ?></h1>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=swiftcurrency-settings&tab=rates' ) ); ?>" class="page-title-action">
					<?php esc_html_e( 'Settings', 'swift-currency' ); ?>
				</a>
				<hr class="wp-heading-inline">

				<div class="swiftcurrency-rates-header">
					<div class="swiftcurrency-rates-info">
						<p>
							<strong><?php esc_html_e( 'Base Currency:', 'swift-currency' ); ?></strong>
							<?php echo esc_html( $base_currency ); ?>
							<span class="separator">|</span>
							<strong><?php esc_html_e( 'Provider:', 'swift-currency' ); ?></strong>
							<?php
							$providers = array(
								'ecb'               => __( 'European Central Bank', 'swift-currency' ),
								'exchangerate-api'  => __( 'ExchangeRate-API.com', 'swift-currency' ),
								'openexchangerates' => __( 'OpenExchangeRates.org', 'swift-currency' ),
								'manual'            => __( 'Manual Rates', 'swift-currency' ),
							);
							echo esc_html( isset( $providers[ $provider ] ) ? $providers[ $provider ] : ucfirst( $provider ) );
							?>
						</p>
					</div>
					<div class="swiftcurrency-rates-actions">
						<form method="post" style="display: inline;">
							<?php wp_nonce_field( 'swiftcurrency_refresh_rates' ); ?>
							<input type="hidden" name="swiftcurrency_refresh_rates" value="1">
							<button type="submit" class="button button-primary">
								<span class="dashicons dashicons-update"></span>
								<?php esc_html_e( 'Refresh All Rates', 'swift-currency' ); ?>
							</button>
						</form>
					</div>
				</div>

				<?php $table->display(); ?>

				<!-- Edit Rate Modal -->
				<div id="swiftcurrency-edit-rate-modal" class="swiftcurrency-modal-overlay" style="display:none;">
					<div class="swiftcurrency-modal-content">
						<h2><?php esc_html_e( 'Edit Exchange Rate', 'swift-currency' ); ?></h2>
						<form method="post">
							<?php wp_nonce_field( 'swiftcurrency_update_rate' ); ?>
							<input type="hidden" name="swiftcurrency_update_rate" value="1">
							<input type="hidden" name="currency_code" id="edit-currency-code">

							<div class="sc-field">
								<div class="sc-field-label"><?php esc_html_e( 'Currency:', 'swift-currency' ); ?></div>
								<div class="sc-field-input" style="padding-top: 6px;">
									<strong id="edit-currency-display"></strong>
								</div>
							</div>

							<div class="sc-field">
								<div class="sc-field-label">
									<label for="edit-exchange-rate"><?php esc_html_e( 'Exchange Rate:', 'swift-currency' ); ?></label>
									<span class="sc-field-desc"><?php esc_html_e( 'Relative to base currency.', 'swift-currency' ); ?></span>
								</div>
								<div class="sc-field-input">
									<input type="number" name="exchange_rate" id="edit-exchange-rate"
										step="0.00000001" min="0" class="sc-input-md" required>
								</div>
							</div>

							<div class="sc-submit-row">
								<button type="submit" class="sc-btn sc-btn-primary"><?php esc_html_e( 'Update Rate', 'swift-currency' ); ?></button>
								<button type="button" class="sc-btn sc-btn-secondary swiftcurrency-close-modal"><?php esc_html_e( 'Cancel', 'swift-currency' ); ?></button>
							</div>
						</form>
					</div>
				</div>
			</div>
		</div>
		<?php
	}

	/**
	 * Refresh all enabled currency rates from their respective providers.
	 *
	 * @since 1.0.0
	 * @return array{success: bool, message: string}
	 */
	public function refresh_all_rates() {
		$base_currency        = $this->get_base_currency();
		$fiat_provider_name   = $this->settings->get( 'rates', 'provider', 'ecb' );
		$crypto_provider_name = $this->settings->get( 'rates', 'crypto_provider', 'binance' );
		$enabled_currencies   = $this->settings->get( 'general', 'enabled_currencies', array() );

		$fiat_targets   = array();
		$crypto_targets = array();

		foreach ( $enabled_currencies as $code ) {
			if ( $code === $base_currency ) {
				continue;
			}

			if ( $this->currency_manager->is_crypto( $code ) ) {
				$crypto_targets[] = $code;
			} else {
				$fiat_targets[] = $code;
			}
		}

		$total_cached = 0;
		$errors       = array();

		// -- Fiat rates --
		if ( ! empty( $fiat_targets ) ) {
			$fiat_provider = $this->admin_settings->get_rate_provider( $fiat_provider_name );

			if ( $fiat_provider && $fiat_provider->is_available() ) {
				$rates = $this->fetch_fiat_rates_with_fallback( $fiat_provider, $base_currency, $crypto_provider_name );

				if ( is_array( $rates ) && ! empty( $rates ) ) {
					$result        = $this->process_refreshed_rates( $rates, $fiat_targets, $base_currency, 'fiat' );
					$total_cached += $result['count'];
					if ( ! empty( $result['missing'] ) ) {
						/* translators: 1: provider name, 2: comma-separated currency codes */
						$errors[] = sprintf( __( 'Fiat (%1$s) does not support: %2$s', 'swift-currency' ), $fiat_provider->get_provider_name(), implode( ', ', $result['missing'] ) );
					}
				} elseif ( false === $rates ) {
					$error_msg = $fiat_provider->get_last_error();
					if ( empty( $error_msg ) && isset( $fiat_provider->custom_fallback_error ) ) {
						$error_msg = $fiat_provider->custom_fallback_error;
					}
					/* translators: 1: provider name, 2: error message */
					$errors[] = sprintf( __( 'Fiat (%1$s): %2$s', 'swift-currency' ), $fiat_provider->get_provider_name(), $error_msg );
				} else {
					/* translators: 1: provider name */
					$errors[] = sprintf( __( 'Fiat (%1$s): No rates returned.', 'swift-currency' ), $fiat_provider->get_provider_name() );
				}
			}
		}

		// -- Crypto rates --
		if ( ! empty( $crypto_targets ) ) {
			$crypto_provider = $this->admin_settings->get_rate_provider( $crypto_provider_name );

			if ( $crypto_provider && $crypto_provider->is_available() ) {
				$rates = $crypto_provider->fetch_rates( $base_currency );

				if ( is_array( $rates ) && ! empty( $rates ) ) {
					$result        = $this->process_refreshed_rates( $rates, $crypto_targets, $base_currency, 'crypto' );
					$total_cached += $result['count'];
					if ( ! empty( $result['missing'] ) ) {
						/* translators: 1: provider name, 2: comma-separated currency codes */
						$errors[] = sprintf( __( 'Crypto (%1$s) does not support: %2$s', 'swift-currency' ), $crypto_provider->get_provider_name(), implode( ', ', $result['missing'] ) );
					}
				} elseif ( false === $rates ) {
					/* translators: 1: provider name, 2: error message */
					$errors[] = sprintf( __( 'Crypto (%1$s): %2$s', 'swift-currency' ), $crypto_provider->get_provider_name(), $crypto_provider->get_last_error() );
				} else {
					/* translators: 1: provider name, 2: base currency */
					$errors[] = sprintf( __( 'Crypto (%1$s): No supported pairs found for %2$s base.', 'swift-currency' ), $crypto_provider->get_provider_name(), $base_currency );
				}
			}
		}

		if ( $total_cached > 0 ) {
			/* translators: %d: number of rates refreshed */
			$message = sprintf( __( 'Successfully refreshed %d exchange rates.', 'swift-currency' ), $total_cached );
			if ( ! empty( $errors ) ) {
				$message .= ' ' . __( 'Some errors occurred:', 'swift-currency' ) . ' ' . implode( '; ', $errors );
			}
			return array( 'success' => true, 'message' => $message );
		}

		return array(
			'success' => false,
			'message' => __( 'Failed to refresh rates.', 'swift-currency' )
				. ( ! empty( $errors ) ? ' ' . implode( '; ', $errors ) : '' ),
		);
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Handle the "manual rate edit" POST action.
	 *
	 * @since 1.0.0
	 */
	private function handle_manual_rate_update() {
		if ( ! isset( $_POST['swiftcurrency_update_rate'], $_POST['currency_code'], $_POST['exchange_rate'] ) ) {
			return;
		}

		check_admin_referer( 'swiftcurrency_update_rate' );

		$currency_code = sanitize_text_field( wp_unslash( $_POST['currency_code'] ) );
		$exchange_rate = (float) $_POST['exchange_rate'];
		$base_currency = $this->get_base_currency();

		if ( $exchange_rate > 0 ) {
			// Normalize rate.
			$exchange_rate = swiftcurrency_normalize_rate( $exchange_rate, $currency_code, $base_currency );

			$this->cache->set_rate( $base_currency, $currency_code, $exchange_rate, YEAR_IN_SECONDS );
			$this->cache->set( "rate_updated_{$base_currency}_{$currency_code}", current_time( 'timestamp' ), YEAR_IN_SECONDS );
			$this->cache->set( "rate_source_{$base_currency}_{$currency_code}", 'manual', YEAR_IN_SECONDS );

			echo '<div class="notice notice-success"><p>' . esc_html__( 'Exchange rate updated successfully.', 'swift-currency' ) . '</p></div>';
		}
	}

	/**
	 * Handle the "refresh all rates" POST action.
	 *
	 * @since 1.0.0
	 */
	private function handle_refresh_rates() {
		if ( ! isset( $_POST['swiftcurrency_refresh_rates'] ) ) {
			return;
		}

		check_admin_referer( 'swiftcurrency_refresh_rates' );

		$result = $this->refresh_all_rates();
		$class  = $result['success'] ? 'notice-success' : 'notice-error';

		echo '<div class="notice ' . esc_attr( $class ) . '"><p>' . esc_html( $result['message'] ) . '</p></div>';
	}

	/**
	 * Normalise and cache a set of refreshed rates for the given targets.
	 *
	 * @since 1.0.0
	 * @param array  $rates         All fetched rates (keyed by uppercase code).
	 * @param array  $targets       Currency codes to process.
	 * @param string $base_currency Base currency code.
	 * @param string $type          Rate type label ('fiat' or 'crypto') stored in cache.
	 * @return array{count: int, missing: string[]}
	 */
	private function process_refreshed_rates( $rates, $targets, $base_currency, $type ) {
		$cache_duration   = DAY_IN_SECONDS;
		$current_time     = current_time( 'timestamp' );
		$count            = 0;
		$missing          = array();

		// Normalise keys to uppercase once, outside the inner loop.
		$normalised = array();
		foreach ( $rates as $code => $rate ) {
			$normalised[ strtoupper( $code ) ] = $rate;
		}

		foreach ( $targets as $code ) {
			$code = strtoupper( trim( $code ) );

			if ( isset( $normalised[ $code ] ) ) {
				$rate = swiftcurrency_normalize_rate( $normalised[ $code ], $code, $base_currency );
				$this->cache->set_rate( $base_currency, $code, $rate, $cache_duration );
				$this->cache->set( "rate_updated_{$base_currency}_{$code}", $current_time, $cache_duration );
				$this->cache->set( "rate_source_{$base_currency}_{$code}", $type, $cache_duration );
				$count++;
			} else {
				$missing[] = $code;
			}
		}

		return array( 'count' => $count, 'missing' => $missing );
	}

	/**
	 * Fetch fiat rates, with a crypto-base fallback.
	 *
	 * When the base currency is a cryptocurrency, fiat providers cannot price
	 * against it directly. We fetch USD-based fiat rates, then convert using
	 * the crypto provider's base→USD bridge rate.
	 *
	 * NOTE: This logic mirrors Cron_Handler::fetch_fiat_rates_with_fallback().
	 * If you update this method, update that one too.
	 *
	 * @since 1.0.0
	 * @param object $fiat_provider        Fiat rate provider instance.
	 * @param string $base_currency        Plugin base currency.
	 * @param string $crypto_provider_name Crypto provider slug for the bridge.
	 * @return array|false Converted rates keyed by currency code, or false on failure.
	 */
	private function fetch_fiat_rates_with_fallback( $fiat_provider, $base_currency, $crypto_provider_name ) {
		if ( ! $this->currency_manager->is_crypto( $base_currency ) ) {
			return $fiat_provider->fetch_rates( $base_currency );
		}

		$fallback_base = 'USD';
		$fiat_rates    = $fiat_provider->fetch_rates( $fallback_base );

		if ( ! is_array( $fiat_rates ) || empty( $fiat_rates ) ) {
			return $fiat_rates;
		}

		$crypto_provider = $this->admin_settings->get_rate_provider( $crypto_provider_name );

		if ( ! $crypto_provider || ! $crypto_provider->is_available() ) {
			$fiat_provider->custom_fallback_error = __( 'Crypto base currency requires a valid crypto provider to link to fiat rates.', 'swift-currency' );
			return false;
		}

		$crypto_rates = $crypto_provider->fetch_rates( $fallback_base );

		if ( ! is_array( $crypto_rates ) || empty( $crypto_rates[ $base_currency ] ) ) {
			$fiat_provider->custom_fallback_error = sprintf(
				/* translators: %s: base currency code */
				__( 'Base currency %s not found in crypto provider rates when calculating fiat fallback.', 'swift-currency' ),
				$base_currency
			);
			return false;
		}

		// crypto_rates[ $base_currency ] = how much base fits in 1 USD.
		// Invert to get: 1 base = how much USD.
		$base_to_usd     = 1 / $crypto_rates[ $base_currency ];
		$converted_rates = array();

		foreach ( $fiat_rates as $currency => $rate ) {
			$converted_rates[ $currency ] = $base_to_usd * $rate;
		}
		$converted_rates[ $fallback_base ] = $base_to_usd;

		return $converted_rates;
	}

	/**
	 * Get the configured base currency, falling back to the WC store currency.
	 *
	 * @since 1.0.0
	 * @return string Currency code.
	 */
	private function get_base_currency() {
		return $this->settings->get(
			'general',
			'base_currency',
			function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD'
		);
	}
}
