<?php
/**
 * Currency List Table Class
 *
 * Displays currencies in a WordPress admin table.
 *
 * @package SwiftCurrency
 * @since 1.0.0
 */

namespace Codeies\SwiftCurrency\Admin;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Load WP_List_Table if not loaded.
if ( ! class_exists( 'WP_List_Table' ) ) {
	require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php';
}

/**
 * Currency List Table class.
 *
 * @class Currency_List_Table
 * @version 1.0.0
 */
class Currency_List_Table extends \WP_List_Table {

	/**
	 * Currency Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Currency_Manager
	 */
	private $currency_manager;

	/**
	 * Settings instance.
	 *
	 * @var \Codeies\SwiftCurrency\Settings
	 */
	private $settings;

	/**
	 * Cache Manager instance.
	 *
	 * @var \Codeies\SwiftCurrency\Cache_Manager
	 */
	private $cache;

	/**
	 * Constructor.
	 *
	 * @param \Codeies\SwiftCurrency\Currency_Manager $currency_manager Currency Manager instance.
	 * @param \Codeies\SwiftCurrency\Settings         $settings         Settings instance.
	 * @param \Codeies\SwiftCurrency\Cache_Manager    $cache            Cache Manager instance.
	 */
	public function __construct( $currency_manager, $settings, $cache ) {
		$this->currency_manager = $currency_manager;
		$this->settings         = $settings;
		$this->cache            = $cache;

		parent::__construct(
			array(
				'singular' => 'currency',
				'plural'   => 'currencies',
				'ajax'     => false,
			)
		);
	}

	/**
	 * Get table columns.
	 *
	 * @return array
	 */
	public function get_columns() {
		return array(
			'cb'     => '<input type="checkbox" />',
			'flag'   => __( 'Flag', 'swift-currency' ),
			'code'   => __( 'Code', 'swift-currency' ),
			'name'   => __( 'Name', 'swift-currency' ),
			'symbol' => __( 'Symbol', 'swift-currency' ),
			'type'   => __( 'Type', 'swift-currency' ),
			'status' => __( 'Status', 'swift-currency' ),
			'rate'   => __( 'Exchange Rate', 'swift-currency' ),
		);
	}

	/**
	 * Get sortable columns.
	 *
	 * @return array
	 */
	protected function get_sortable_columns() {
		return array(
			'code' => array( 'code', false ),
			'name' => array( 'name', false ),
		);
	}

	/**
	 * Get bulk actions.
	 *
	 * @return array
	 */
	protected function get_bulk_actions() {
		return array(
			'enable'        => __( 'Enable', 'swift-currency' ),
			'disable'       => __( 'Disable', 'swift-currency' ),
			'delete_custom' => __( 'Delete Custom', 'swift-currency' ),
		);
	}

	/**
	 * Column checkbox.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_cb( $item ) {
		return sprintf(
			'<input type="checkbox" name="currency[]" value="%s" />',
			esc_attr( $item['code'] )
		);
	}

	/**
	 * Column code.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_code( $item ) {
		$base_currency = $this->settings->get( 'general', 'base_currency', ( function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD' ) );
		$is_base       = $item['code'] === $base_currency;

		$output = '<strong>' . esc_html( $item['code'] ) . '</strong>';

		if ( $is_base ) {
			$output .= ' <span class="swiftcurrency-badge swiftcurrency-badge-primary">' . esc_html__( 'Base', 'swift-currency' ) . '</span>';
		}

		return $output;
	}

	/**
	 * Column flag.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_flag( $item ) {
		// Output the flag
		if ( ! empty( $item['flag_url'] ) ) {
			return '<img src="' . esc_url( $item['flag_url'] ) . '" alt="' . esc_attr( $item['code'] ) . '" style="width: 24px; height: auto;" />';
		}
		
		// Fallback to built-in flag via CSS classes
		return '<span class="swiftcurrency-flag swiftcurrency-flag-' . esc_attr( strtolower( $item['code'] ) ) . '"></span>';
	}

	/**
	 * Column name.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_name( $item ) {
		// Create row actions
		$actions = array(
			'edit' => sprintf(
				'<a href="?page=%s&currency_action=edit&currency_code=%s">%s</a>',
				// phpcs:ignore WordPress.Security.NonceVerification.Recommended
				esc_attr( isset( $_REQUEST['page'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['page'] ) ) : '' ),
				esc_attr( $item['code'] ),
				__( 'Edit', 'swift-currency' )
			),
		);

		return esc_html( $item['name'] ) . $this->row_actions( $actions );
	}

	/**
	 * Column symbol.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_symbol( $item ) {
		return '<span class="swiftcurrency-symbol">' . esc_html( $item['symbol'] ) . '</span>';
	}

	/**
	 * Column type.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_type( $item ) {
		if ( 'crypto' === $item['type'] ) {
			return '<span class="swiftcurrency-badge swiftcurrency-badge-warning">' . esc_html__( 'Crypto', 'swift-currency' ) . '</span>';
		}
		
		return '<span class="swiftcurrency-badge swiftcurrency-badge-secondary">' . esc_html__( 'Fiat', 'swift-currency' ) . '</span>';
	}

	/**
	 * Column status.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_status( $item ) {
		$enabled_currencies = $this->settings->get( 'general', 'enabled_currencies', array() );
		$is_enabled         = in_array( $item['code'], $enabled_currencies, true );

		if ( $is_enabled ) {
			return '<span class="swiftcurrency-badge swiftcurrency-badge-success">' . esc_html__( 'Enabled', 'swift-currency' ) . '</span>';
		}

		return '<span class="swiftcurrency-badge swiftcurrency-badge-disabled">' . esc_html__( 'Disabled', 'swift-currency' ) . '</span>';
	}

	/**
	 * Column rate.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_rate( $item ) {
		$base_currency = $this->settings->get( 'general', 'base_currency', ( function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD' ) );

		if ( $item['code'] === $base_currency ) {
			return '<span class="swiftcurrency-rate">1.0000</span>';
		}

		// Get cached rate if available.
		$rate = $this->cache->get_rate( $base_currency, $item['code'] );

		if ( false !== $rate ) {
			return '<span class="swiftcurrency-rate">' . esc_html( number_format( $rate, 4 ) ) . '</span>';
		}

		return '<span class="swiftcurrency-rate-na">â€”</span>';
	}

	/**
	 * Default column output.
	 *
	 * @param array  $item        Item data.
	 * @param string $column_name Column name.
	 * @return string
	 */
	protected function column_default( $item, $column_name ) {
		return isset( $item[ $column_name ] ) ? esc_html( $item[ $column_name ] ) : '';
	}



	/**
	 * Prepare items for display.
	 */
	public function prepare_items() {
		$columns  = $this->get_columns();
		$hidden   = array();
		$sortable = $this->get_sortable_columns();

		$this->_column_headers = array( $columns, $hidden, $sortable );

		// Get all currencies.
		$all_currencies = $this->currency_manager->get_all_currencies();
		$items          = array();
		
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$search = isset( $_REQUEST['s'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['s'] ) ) : '';
		
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$filter_status = isset( $_GET['filter_status'] ) ? sanitize_text_field( wp_unslash( $_GET['filter_status'] ) ) : '';

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$currency_type = isset( $_GET['currency_type'] ) ? sanitize_text_field( wp_unslash( $_GET['currency_type'] ) ) : 'all';

		$enabled_currencies = $this->settings->get( 'general', 'enabled_currencies', array() );

		foreach ( $all_currencies as $code => $currency ) {
			$type = isset( $currency['type'] ) ? $currency['type'] : 'fiat';
			
			// Filter by type
			if ( 'fiat' === $currency_type && 'fiat' !== $type ) continue;
			if ( 'crypto' === $currency_type && 'crypto' !== $type ) continue;
			
			// Filter by status
			$is_enabled = in_array( $code, $enabled_currencies, true );
			if ( 'enabled' === $filter_status && ! $is_enabled ) continue;
			if ( 'disabled' === $filter_status && $is_enabled ) continue;

			// Handle search
			if ( $search ) {
				$search_lower = strtolower( $search );
				$code_match = strpos( strtolower( $code ), $search_lower ) !== false;
				$name_match = strpos( strtolower( $currency['name'] ), $search_lower ) !== false;
				if ( ! $code_match && ! $name_match ) {
					continue;
				}
			}

			$items[] = array(
				'code'     => $code,
				'name'     => $currency['name'],
				'symbol'   => $currency['symbol'],
				'type'     => $type,
				'flag_url' => isset( $currency['flag_url'] ) ? $currency['flag_url'] : '',
			);
		}

		// Handle sorting.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Sorting params are display-only.
		$orderby = isset( $_GET['orderby'] ) ? sanitize_text_field( wp_unslash( $_GET['orderby'] ) ) : 'code';
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Sorting params are display-only.
		$order   = isset( $_GET['order'] ) ? sanitize_text_field( wp_unslash( $_GET['order'] ) ) : 'asc';

		usort(
			$items,
			function( $a, $b ) use ( $orderby, $order ) {
				$result = strcmp( $a[ $orderby ], $b[ $orderby ] );
				return ( 'asc' === $order ) ? $result : -$result;
			}
		);

		// Pagination.
		$per_page     = 20;
		$current_page = $this->get_pagenum();
		$total_items  = count( $items );

		$this->set_pagination_args(
			array(
				'total_items' => $total_items,
				'per_page'    => $per_page,
				'total_pages' => ceil( $total_items / $per_page ),
			)
		);

		$this->items = array_slice( $items, ( ( $current_page - 1 ) * $per_page ), $per_page );
	}

	/**
	 * Display when no items found.
	 */
	public function no_items() {
		esc_html_e( 'No currencies found.', 'swift-currency' );
	}

	/**
	 * Extra table navigation.
	 *
	 * @param string $which Top or bottom.
	 */
	protected function extra_tablenav( $which ) {
		if ( 'top' === $which ) {
			?>
			<div class="alignleft actions">
				<select name="filter_status" id="filter-status">
					<option value=""><?php esc_html_e( 'All Statuses', 'swift-currency' ); ?></option>
					<?php
					// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Filter param is display-only.
					$filter_status = isset( $_GET['filter_status'] ) ? sanitize_text_field( wp_unslash( $_GET['filter_status'] ) ) : '';
					?>
					<option value="enabled" <?php selected( 'enabled', $filter_status ); ?>>
						<?php esc_html_e( 'Enabled', 'swift-currency' ); ?>
					</option>
					<option value="disabled" <?php selected( 'disabled', $filter_status ); ?>>
						<?php esc_html_e( 'Disabled', 'swift-currency' ); ?>
					</option>
				</select>
				<?php 
				// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Filter param check.
				if ( isset( $_GET['currency_type'] ) ) : ?>
					<?php // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Passing filter param through hidden input. ?>
					<input type="hidden" name="currency_type" value="<?php echo esc_attr( sanitize_text_field( wp_unslash( $_GET['currency_type'] ) ) ); ?>" />
				<?php endif; ?>
				<input type="submit" class="button" value="<?php esc_attr_e( 'Filter', 'swift-currency' ); ?>">
			</div>
			<?php
		}
	}
	/**
	 * Get table classes.
	 *
	 * @return array
	 */
	protected function get_table_classes() {
		return array( 'wp-list-table', 'widefat', 'fixed', 'striped', $this->_args['plural'], 'swiftcurrency-currency-table' );
	}
}
