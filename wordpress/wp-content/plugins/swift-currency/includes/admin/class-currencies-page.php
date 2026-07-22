<?php

/**
 * Currencies Management Page
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Admin;

// Exit if accessed directly.
if (! defined('ABSPATH')) {
	exit;
}

/**
 * Currencies_Page class.
 */
class Currencies_Page
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
	 * Cache Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Cache_Manager
	 */
	private $cache;


	public function __construct($settings, $currency_manager, $cache)
	{
		$this->settings         = $settings;
		$this->currency_manager = $currency_manager;
		$this->cache            = $cache;
	}

	/**
	 * Render Currencies Management Page.
	 */
	public function render()
	{
		$custom_currencies = get_option('swiftcurrency_custom_currencies', array());
		$message = '';
		$error = '';

		// Handle adding or editing a custom currency
		if (isset($_POST['action']) && 'add_custom_currency' === $_POST['action']) {
			check_admin_referer('add-custom-currency');

			$code     = isset($_POST['custom_currency_code']) ? strtoupper(sanitize_text_field(wp_unslash($_POST['custom_currency_code']))) : '';
			$name     = isset($_POST['custom_currency_name']) ? sanitize_text_field(wp_unslash($_POST['custom_currency_name'])) : '';
			$symbol   = isset($_POST['custom_currency_symbol']) ? sanitize_text_field(wp_unslash($_POST['custom_currency_symbol'])) : '';
			$decimals = isset($_POST['custom_currency_decimals']) ? absint(wp_unslash($_POST['custom_currency_decimals'])) : 2;
			$type     = isset($_POST['custom_currency_type']) ? sanitize_text_field(wp_unslash($_POST['custom_currency_type'])) : 'fiat';
			$flag_url = isset($_POST['custom_currency_flag_url']) ? esc_url_raw(wp_unslash($_POST['custom_currency_flag_url'])) : '';
			$thou_sep = isset($_POST['custom_currency_thousand_separator']) ? sanitize_text_field(wp_unslash($_POST['custom_currency_thousand_separator'])) : ',';
			$dec_sep  = isset($_POST['custom_currency_decimal_separator']) ? sanitize_text_field(wp_unslash($_POST['custom_currency_decimal_separator'])) : '.';

			if (empty($code) || empty($name) || empty($symbol)) {
				$error = __('Code, Name, and Symbol are required fields.', 'swift-currency');
			} else {
				$custom_currencies[$code] = array(
					'name'               => $name,
					'symbol'             => $symbol,
					'decimals'           => $decimals,
					'type'               => in_array($type, array('fiat', 'crypto'), true) ? $type : 'crypto',
					'flag_url'           => $flag_url,
					'thousand_separator' => $thou_sep,
					'decimal_separator'  => $dec_sep,
				);

				update_option('swiftcurrency_custom_currencies', $custom_currencies);

				// Ensure it's re-loaded for the table
				$this->currency_manager->__construct($this->settings); // reload

				$message = __('Currency saved successfully.', 'swift-currency');
			}
		}

		// Handle bulk actions.
		if (isset($_POST['action']) && isset($_POST['currency']) && 'add_custom_currency' !== $_POST['action']) {
			check_admin_referer('bulk-currencies');

			$action     = sanitize_text_field(wp_unslash($_POST['action']));
			$currencies = array_map('sanitize_text_field', wp_unslash($_POST['currency']));

			if ('enable' === $action) {
				$this->bulk_enable_currencies($currencies);
				$message = __('Currencies enabled successfully.', 'swift-currency');
			} elseif ('disable' === $action) {
				$this->bulk_disable_currencies($currencies);
				$message = __('Currencies disabled successfully.', 'swift-currency');
			} elseif ('delete_custom' === $action) {
				foreach ($currencies as $c) {
					if (isset($custom_currencies[$c])) {
						unset($custom_currencies[$c]);
					}
				}
				update_option('swiftcurrency_custom_currencies', $custom_currencies);
				$message = __('Custom currencies deleted successfully.', 'swift-currency');
			}
		}

		if ($message) {
			echo '<div class="notice notice-success"><p>' . esc_html($message) . '</p></div>';
		}
		if ($error) {
			echo '<div class="notice notice-error"><p>' . esc_html($error) . '</p></div>';
		}

		// Create table instance.
		$table = new Currency_List_Table($this->currency_manager, $this->settings, $this->cache);
		$table->prepare_items();

		// Check for edit mode
		$edit_code = '';
		$edit_currency = null;
		if (isset($_GET['currency_action']) && 'edit' === $_GET['currency_action'] && ! empty($_GET['currency_code'])) {
			$edit_code = strtoupper(sanitize_text_field(wp_unslash($_GET['currency_code'])));
			$all_currencies = $this->currency_manager->get_all_currencies();
			if (isset($all_currencies[$edit_code])) {
				$edit_currency = $all_currencies[$edit_code];
			}
		}

		$enabled_currencies = $this->settings->get('general', 'enabled_currencies', array());
		$base_currency      = $this->settings->get('general', 'base_currency', (function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD'));

		// Ensure base is in the count.
		if (! in_array($base_currency, $enabled_currencies, true)) {
			$enabled_currencies[] = $base_currency;
		}

?>
		<div class="wrap sc-wrap">
			<?php settings_errors('swiftcurrency_settings'); ?>
			<div class="sc-header">
				<div class="sc-header-icon"><span class="dashicons dashicons-money-alt"></span></div>
				<div>
					<div class="sc-header-title"><?php esc_html_e('SwiftCurrency', 'swift-currency'); ?></div>
					<div class="sc-header-subtitle"><?php esc_html_e('Multi-Currency for WooCommerce', 'swift-currency'); ?></div>
				</div>
			</div>

			<div class="sc-settings-body">
				<h1 class="wp-heading-inline"><?php esc_html_e('Manage Currencies', 'swift-currency'); ?></h1>
				<a href="<?php echo esc_url(admin_url('admin.php?page=swiftcurrency-settings&tab=general')); ?>" class="page-title-action">
					<?php esc_html_e('Settings', 'swift-currency'); ?>
				</a>
				<hr class="wp-heading-inline">

				<?php $current_view = isset($_GET['currency_type']) ? sanitize_text_field(wp_unslash($_GET['currency_type'])) : 'all'; ?>
				<h2 class="nav-tab-wrapper swiftcurrency-currency-tabs" style="margin-bottom: 20px;">
					<a href="<?php echo esc_url(admin_url('admin.php?page=swiftcurrency-currencies')); ?>" class="nav-tab <?php echo esc_attr( 'all' === $current_view ? 'nav-tab-active' : '' ); ?>">
						<?php esc_html_e('All Currencies', 'swift-currency'); ?>
					</a>
					<a href="<?php echo esc_url(admin_url('admin.php?page=swiftcurrency-currencies&currency_type=fiat')); ?>" class="nav-tab <?php echo esc_attr( 'fiat' === $current_view ? 'nav-tab-active' : '' ); ?>">
						<?php esc_html_e('Fiat', 'swift-currency'); ?>
					</a>
					<a href="<?php echo esc_url(admin_url('admin.php?page=swiftcurrency-currencies&currency_type=crypto')); ?>" class="nav-tab <?php echo esc_attr( 'crypto' === $current_view ? 'nav-tab-active' : '' ); ?>">
						<?php esc_html_e('Crypto', 'swift-currency'); ?>
					</a>
				</h2>

				<div class="swiftcurrency-currency-stats">
					<?php $this->render_currency_stats(); ?>
				</div>

				<div id="col-container" class="wp-clearfix">
					<div id="col-left">
						<div class="col-wrap">
							<div class="form-wrap">
								<h2>
									<?php
									if ($edit_currency) {
										/* translators: %s: Currency code */
										echo esc_html(sprintf(__('Edit Currency: %s', 'swift-currency'), $edit_code));
									} else {
										esc_html_e('Add Custom Currency', 'swift-currency');
									}
									?>
								</h2>
								<?php if ($edit_currency) : ?>
									<p><a href="<?php echo esc_url(admin_url('admin.php?page=swiftcurrency-currencies')); ?>">&larr; <?php esc_html_e('Cancel Edit', 'swift-currency'); ?></a></p>
								<?php endif; ?>
								<form method="post" action="">
									<?php wp_nonce_field('add-custom-currency'); ?>
									<input type="hidden" name="action" value="add_custom_currency">

									<div class="form-field form-required">
										<label for="custom_currency_code"><?php esc_html_e('Currency Code', 'swift-currency'); ?></label>
										<input name="custom_currency_code" id="custom_currency_code" type="text" value="<?php echo esc_attr($edit_code); ?>" size="40" required placeholder="e.g. BTC" maxlength="10" <?php echo esc_attr( $edit_currency ? 'readonly' : '' ); ?>>
										<p><?php esc_html_e('The ISO or custom code for this currency.', 'swift-currency'); ?></p>
									</div>

									<div class="form-field form-required">
										<label for="custom_currency_name"><?php esc_html_e('Currency Name', 'swift-currency'); ?></label>
										<input name="custom_currency_name" id="custom_currency_name" type="text" value="<?php echo esc_attr(isset($edit_currency['name']) ? $edit_currency['name'] : ''); ?>" size="40" required placeholder="e.g. Bitcoin">
										<p><?php esc_html_e('The full name of the currency.', 'swift-currency'); ?></p>
									</div>

									<div class="form-field form-required">
										<label for="custom_currency_symbol"><?php esc_html_e('Symbol', 'swift-currency'); ?></label>
										<input name="custom_currency_symbol" id="custom_currency_symbol" type="text" value="<?php echo esc_attr(isset($edit_currency['symbol']) ? $edit_currency['symbol'] : ''); ?>" size="40" required placeholder="e.g. â‚¿">
									</div>

									<div class="form-field">
										<label for="custom_currency_decimals"><?php esc_html_e('Decimals', 'swift-currency'); ?></label>
										<input name="custom_currency_decimals" id="custom_currency_decimals" type="number" step="1" min="0" max="8" value="<?php echo esc_attr(isset($edit_currency['decimals']) ? $edit_currency['decimals'] : '2'); ?>">
										<p><?php esc_html_e('Number of decimal places.', 'swift-currency'); ?></p>
									</div>

									<div class="form-field">
										<label for="custom_currency_thousand_separator"><?php esc_html_e('Thousand Separator', 'swift-currency'); ?></label>
										<input name="custom_currency_thousand_separator" id="custom_currency_thousand_separator" type="text" value="<?php echo esc_attr(isset($edit_currency['thousand_separator']) ? $edit_currency['thousand_separator'] : ','); ?>" size="2">
									</div>

									<div class="form-field">
										<label for="custom_currency_decimal_separator"><?php esc_html_e('Decimal Separator', 'swift-currency'); ?></label>
										<input name="custom_currency_decimal_separator" id="custom_currency_decimal_separator" type="text" value="<?php echo esc_attr(isset($edit_currency['decimal_separator']) ? $edit_currency['decimal_separator'] : '.'); ?>" size="2">
									</div>

									<div class="form-field">
										<label for="custom_currency_type"><?php esc_html_e('Type', 'swift-currency'); ?></label>
										<select name="custom_currency_type" id="custom_currency_type">
											<?php $current_type = isset($edit_currency['type']) ? $edit_currency['type'] : 'crypto'; ?>
											<option value="fiat" <?php selected($current_type, 'fiat'); ?>><?php esc_html_e('Fiat', 'swift-currency'); ?></option>
											<option value="crypto" <?php selected($current_type, 'crypto'); ?>><?php esc_html_e('Crypto', 'swift-currency'); ?></option>
										</select>
									</div>

									<div class="form-field">
										<label for="custom_currency_flag_url"><?php esc_html_e('Custom Flag URL', 'swift-currency'); ?></label>
										<div style="display: flex; gap: 8px;">
											<input name="custom_currency_flag_url" id="custom_currency_flag_url" type="url" value="<?php echo esc_attr(isset($edit_currency['flag_url']) ? $edit_currency['flag_url'] : ''); ?>" size="40" placeholder="https://...">
											<button type="button" class="button swiftcurrency-upload-flag-btn"><?php esc_html_e('Upload Image', 'swift-currency'); ?></button>
										</div>
										<p><?php esc_html_e('Provide an absolute URL to an icon or flag image to display for this currency.', 'swift-currency'); ?></p>
									</div>

									<p class="submit">
										<input type="submit" name="submit" id="submit" class="button button-primary" value="<?php echo $edit_currency ? esc_attr__('Save Changes', 'swift-currency') : esc_attr__('Add Custom Currency', 'swift-currency'); ?>">
									</p>
								</form>
							</div>
						</div>
					</div>

					<div id="col-right">
						<div class="col-wrap">
							<form method="get">
								<input type="hidden" name="page" value="<?php echo isset($_REQUEST['page']) ? esc_attr(sanitize_text_field(wp_unslash($_REQUEST['page']))) : ''; ?>">
								<?php if (isset($_GET['currency_type'])) : ?>
									<input type="hidden" name="currency_type" value="<?php echo esc_attr(sanitize_text_field(wp_unslash($_GET['currency_type']))); ?>" />
								<?php endif; ?>
								<?php if (isset($_GET['filter_status'])) : ?>
									<input type="hidden" name="filter_status" value="<?php echo esc_attr(sanitize_text_field(wp_unslash($_GET['filter_status']))); ?>" />
								<?php endif; ?>
								<?php $table->search_box(__('Search Currencies', 'swift-currency'), 'currency'); ?>
							</form>
							<form method="post">
								<?php wp_nonce_field('bulk-currencies'); ?>
								<?php $table->display(); ?>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
	<?php
	}

	/**
	 * Render currency statistics.
	 */
	private function render_currency_stats()
	{
		$all_currencies     = $this->currency_manager->get_all_currencies();
		$enabled_currencies = $this->settings->get('general', 'enabled_currencies', array());
		$base_currency      = $this->settings->get('general', 'base_currency', (function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD'));

		// Ensure base is in the count.
		if (! in_array($base_currency, $enabled_currencies, true)) {
			$enabled_currencies[] = $base_currency;
		}

	?>
		<div class="sc-stats-row">
			<div class="sc-stat-card">
				<div class="sc-stat-card-label"><?php esc_html_e('Total Currencies', 'swift-currency'); ?></div>
				<div class="sc-stat-card-value"><?php echo esc_html(count($all_currencies)); ?></div>
			</div>
			<div class="sc-stat-card">
				<div class="sc-stat-card-label"><?php esc_html_e('Enabled Currencies', 'swift-currency'); ?></div>
				<div class="sc-stat-card-value"><?php echo esc_html(count($enabled_currencies)); ?></div>
			</div>
			<div class="sc-stat-card">
				<div class="sc-stat-card-label"><?php esc_html_e('Base Currency', 'swift-currency'); ?></div>
				<div class="sc-stat-card-value"><?php echo esc_html($base_currency); ?></div>
			</div>
		</div>
<?php
	}

	/**
	 * Bulk enable currencies.
	 *
	 * @param array $currency_codes Currency codes to enable.
	 */
	private function bulk_enable_currencies($currency_codes)
	{
		$enabled_currencies = $this->settings->get('general', 'enabled_currencies', array());

		foreach ($currency_codes as $code) {
			if (! in_array($code, $enabled_currencies, true)) {
				$enabled_currencies[] = $code;
			}
		}

		$this->settings->set('general', 'enabled_currencies', $enabled_currencies);
	}

	/**
	 * Bulk disable currencies.
	 *
	 * @param array $currency_codes Currency codes to disable.
	 */
	private function bulk_disable_currencies($currency_codes)
	{
		$enabled_currencies = $this->settings->get('general', 'enabled_currencies', array());
		$base_currency      = $this->settings->get('general', 'base_currency', (function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD'));

		foreach ($currency_codes as $code) {
			if ($code === $base_currency) {
				continue;
			}

			$key = array_search($code, $enabled_currencies, true);
			if (false !== $key) {
				unset($enabled_currencies[$key]);
			}
		}

		$this->settings->set('general', 'enabled_currencies', array_values($enabled_currencies));
	}
}
