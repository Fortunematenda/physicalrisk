<?php

/**
 * Utilities Class
 *
 * Shared static helpers for SwiftCurrency.
 *
 * @package SwiftCurrency
 * @since   1.0.0
 */

namespace Codeies\SwiftCurrency;

// Exit if accessed directly.
if (! defined('ABSPATH')) {
	exit;
}

/**
 * Utils class.
 *
 * @since 1.0.0
 */
class Utils
{

	/**
	 * Check whether the Pro add-on is active.
	 *
	 * The free plugin never validates any license itself; the Pro add-on
	 * registers the `SwiftCurrencyPro` class on load, so its presence is
	 * the single source of truth.
	 *
	 * @since  1.0.0
	 * @return bool True when the Pro add-on is active, false otherwise.
	 */
	public static function is_pro()
	{
		return class_exists('SwiftCurrencyPro');
	}

	/**
	 * Return the maximum number of currencies allowed for this plan.
	 *
	 * Free version supports up to 3 currencies. Pro version can override via filter.
	 *
	 * @since  1.0.0
	 * @return int
	 */
	public static function get_currency_limit()
	{
		$limit = 3;

		/**
		 * Filter the maximum number of enabled currencies.
		 *
		 * @since 1.0.0
		 * @param int $limit Max currencies allowed.
		 */
		return (int) apply_filters('swiftcurrency_currency_limit', $limit);
	}
}
