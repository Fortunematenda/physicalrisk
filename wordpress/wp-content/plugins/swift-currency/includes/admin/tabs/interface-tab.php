<?php
/**
 * Tab Interface
 *
 * @package SwiftCurrency
 */

namespace Codeies\SwiftCurrency\Admin\Tabs;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Tab_Interface interface.
 */
interface Tab_Interface {

	/**
	 * Render the tab content.
	 */
	public function render();
}
