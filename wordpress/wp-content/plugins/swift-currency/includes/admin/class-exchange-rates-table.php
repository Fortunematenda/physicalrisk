<?php
/**
 * Exchange Rates List Table Class
 *
 * Displays exchange rates in a WordPress admin table.
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
 * Exchange Rates List Table class.
 *
 * @class Exchange_Rates_Table
 * @version 1.0.0
 */
class Exchange_Rates_Table extends \WP_List_Table {

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
				'singular' => 'rate',
				'plural'   => 'rates',
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
			'currency'    => __( 'Currency', 'swift-currency' ),
			'rate'        => __( 'Exchange Rate', 'swift-currency' ),
			'last_update' => __( 'Last Updated', 'swift-currency' ),
			'source'      => __( 'Source', 'swift-currency' ),
			'actions'     => __( 'Actions', 'swift-currency' ),
		);
	}

	/**
	 * Column currency.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_currency( $item ) {
		$output  = '<strong>' . esc_html( $item['code'] ) . '</strong>';
		$output .= '<br><span class="description">' . esc_html( $item['name'] ) . '</span>';
		return $output;
	}

	/**
	 * Column rate.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_rate( $item ) {
		if ( isset( $item['rate'] ) && false !== $item['rate'] && $item['rate'] > 0 ) {
			$rate_display = number_format( (float) $item['rate'], 6 );
			$output = '<span class="swiftcurrency-rate-value">' . esc_html( $rate_display ) . '</span>';
			
			// Show natural rate hint if the rate is very small (inverted).
			if ( (float) $item['rate'] < 0.1 ) {
				$natural_rate = 1 / (float) $item['rate'];
				$output .= '<br><span class="sc-rate-hint" style="color: #666; font-size: 11px;">';
				/* translators: 1: currency code, 2: rate, 3: base currency code */
				$output .= sprintf( esc_html__( '1 %1$s = %2$s %3$s', 'swift-currency' ), esc_html( $item['code'] ), esc_html( number_format( $natural_rate, 2 ) ), esc_html( swiftcurrency_get_base_currency() ) );
				$output .= '</span>';
			}
			return $output;
		}
		return '<span class="swiftcurrency-rate-na">' . esc_html__( 'N/A', 'swift-currency' ) . '</span>';
	}

	/**
	 * Column last update.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_last_update( $item ) {
		if ( isset( $item['updated'] ) && $item['updated'] ) {
			return '<span class="swiftcurrency-rate-time">' . esc_html( human_time_diff( $item['updated'], current_time( 'timestamp' ) ) ) . ' ' . esc_html__( 'ago', 'swift-currency' ) . '</span>';
		}
		return '<span class="swiftcurrency-rate-na">' . esc_html__( 'N/A', 'swift-currency' ) . '</span>';
	}

	/**
	 * Column source.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_source( $item ) {
		// Check if manually set.
		if ( isset( $item['source'] ) && 'manual' === $item['source'] ) {
			return '<span class="swiftcurrency-rate-source manual-source">' . esc_html__( 'Manual', 'swift-currency' ) . '</span>';
		}

		$is_crypto = isset( $item['type'] ) && 'crypto' === $item['type'];
		$provider_key = $is_crypto ? 'crypto_provider' : 'provider';
		$default_provider = $is_crypto ? 'coingecko' : 'ecb';
		
		$provider = $this->settings->get( 'rates', $provider_key, $default_provider );
		
		$sources = array(
			'ecb'               => __( 'ECB', 'swift-currency' ),
			'openexchangerates' => __( 'OpenExchangeRates', 'swift-currency' ),
			'manual'            => __( 'Manual', 'swift-currency' ),
			'binance'           => __( 'Binance', 'swift-currency' ),
			'coingecko'         => __( 'CoinGecko', 'swift-currency' ),
		);

		$source_name = isset( $sources[ $provider ] ) ? $sources[ $provider ] : ucfirst( $provider );
		
		return '<span class="swiftcurrency-rate-source">' . esc_html( $source_name ) . '</span>';
	}

	/**
	 * Column actions.
	 *
	 * @param array $item Item data.
	 * @return string
	 */
	protected function column_actions( $item ) {
		$base_currency = $this->settings->get( 'general', 'base_currency', ( function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD' ) );
		
		if ( $item['code'] === $base_currency ) {
			return '<span class="swiftcurrency-rate-na">â€”</span>';
		}

		$actions = array();
		
		$actions[] = sprintf(
			'<a href="#" class="swiftcurrency-edit-rate" data-currency="%s" data-rate="%s">%s</a>',
			esc_attr( $item['code'] ),
			esc_attr( $item['rate'] ),
			esc_html__( 'Edit', 'swift-currency' )
		);

		return implode( ' | ', $actions );
	}

	/**
	 * Prepare items for display.
	 */
	public function prepare_items() {
		$columns  = $this->get_columns();
		$hidden   = array();
		$sortable = array();

		$this->_column_headers = array( $columns, $hidden, $sortable );

		// Get enabled currencies.
		$enabled_currencies = $this->settings->get( 'general', 'enabled_currencies', array() );
		$base_currency      = $this->settings->get( 'general', 'base_currency', ( function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'USD' ) );
		$all_currencies     = $this->currency_manager->get_all_currencies();

		$items = array();

		// Add base currency.
		if ( isset( $all_currencies[ $base_currency ] ) ) {
			$data = $all_currencies[ $base_currency ];
			$items[] = array(
				'code'    => $base_currency,
				'name'    => $data['name'],
				'type'    => isset( $data['type'] ) ? $data['type'] : 'fiat',
				'rate'    => 1.0,
				'updated' => current_time( 'timestamp' ),
			);
		}

		// Add enabled currencies.
		foreach ( $enabled_currencies as $code ) {
			if ( $code === $base_currency || ! isset( $all_currencies[ $code ] ) ) {
				continue;
			}

			$rate    = $this->cache->get_rate( $base_currency, $code );
			$updated = $this->cache->get( 'rate_updated_' . $base_currency . '_' . $code );
			$source  = $this->cache->get( 'rate_source_' . $base_currency . '_' . $code );
			$data    = $all_currencies[ $code ];

			$items[] = array(
				'code'    => $code,
				'name'    => $data['name'],
				'type'    => isset( $data['type'] ) ? $data['type'] : 'fiat',
				'rate'    => $rate,
				'updated' => $updated ? $updated : false,
				'source'  => $source ? $source : 'auto',
			);
		}

		$this->items = $items;
	}

	/**
	 * Display when no items found.
	 */
	public function no_items() {
		esc_html_e( 'No exchange rates found. Please enable some currencies first.', 'swift-currency' );
	}

	/**
	 * Get table classes.
	 *
	 * @return array
	 */
	protected function get_table_classes() {
		return array( 'wp-list-table', 'widefat', 'fixed', 'striped', $this->_args['plural'], 'swiftcurrency-rates-table' );
	}
}
