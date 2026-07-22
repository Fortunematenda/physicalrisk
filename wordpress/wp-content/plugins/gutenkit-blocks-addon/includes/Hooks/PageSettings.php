<?php
namespace Gutenkit\Hooks;

defined( 'ABSPATH' ) || exit;

use Gutenkit\Helpers\Utils;

class PageSettings {

	use \Gutenkit\Traits\Singleton;

	/**
	 * class constructor.
	 * private for singleton
	 *
	 * @return void
	 * @since 1.0.0
	 */
	public function __construct() {
		add_filter( 'gutenkit/generated_css', array( $this, 'add_page_settings_frontend_css' ), 10 );
	}

	/**
	 * Render page settings Styles in frontend
	 * 
	 * @return void
	 * @since 1.0.0
	 */
	public function add_page_settings_frontend_css($css)
	{
		$post_id = get_the_ID();
		if ($post_id) {
			$page_settings_css = get_post_meta($post_id, 'postBodyCss', true);
			if (!empty($page_settings_css)) {
				$css .= wp_strip_all_tags($page_settings_css);
			}
		}
		return $css;
	}
}
