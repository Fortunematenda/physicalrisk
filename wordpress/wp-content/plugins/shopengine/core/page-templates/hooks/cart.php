<?php

namespace ShopEngine\Core\Page_Templates\Hooks;

defined('ABSPATH') || exit;

use ShopEngine\Core\Builders\Templates;
use ShopEngine\Utils\Shipping_Calculation;
 
class Cart extends Base {

	protected $page_type = 'cart';
	protected $template_part = 'content-cart.php';

	public function init() : void {

		add_action('woocommerce_shipping_init', function () {
			\ShopEngine\Widgets\Widget_Helper::instance()->wc_template_filter();
		});

		add_action('template_redirect', function () {
			Shipping_Calculation::output();
		});

		// add_action('wp_loaded', [$this, 'delayed_hook_conflicts'], 9999);
		$this->delayed_hook_conflicts();

		do_action( 'woocommerce_check_cart_items' );

		// Dequeue Facebook Pixel script if active
		add_action('wp_enqueue_scripts', function () {
			if(is_plugin_active('pixelyoursite/facebook-pixel-master.php')) {
				
				wp_dequeue_script('pys');
			}
			
			$themeName = get_template();
			if ($themeName == 'phlox-pro') {

				wp_dequeue_style('auxin-elementor-base');
			}

		}, 20);
	}

	public function delayed_hook_conflicts() {

		$themeName = get_template();

		if ( $themeName == 'porto' ) {
			remove_action( 'woocommerce_after_cart', 'woocommerce_cross_sell_display', 20 );
		}


		if( $themeName == 'woostify' ) {	
			remove_action( 'woocommerce_after_cart', 'woocommerce_cross_sell_display' );
			remove_filter( 'woocommerce_cross_sells_columns', 'woostify_cross_sell_display_columns' );
		}

		// revert this hook for cart page and editor mode
		if ( $themeName == 'flatsome' || $themeName == 'hestia' ) {
			add_action( 'woocommerce_cart_collaterals', 'woocommerce_cross_sell_display' );
			remove_action( 'woocommerce_after_cart', 'woocommerce_cross_sell_display' );
		}

		if ( is_plugin_active( 'auxin-shop/auxin-shop.php' ) ) {

			remove_filter('wc_get_template', 'auxshp_get_wc_template', 11, 2);

			// Remove Auxin Shop template loader filter
			global $wp_filter;
			if (isset($wp_filter['woocommerce_locate_template'])) {
				foreach ($wp_filter['woocommerce_locate_template']->callbacks as $priority => $callbacks) {
					foreach ($callbacks as $key => $callback) {
						if (is_array($callback['function']) && 
							is_object($callback['function'][0]) && 
							get_class($callback['function'][0]) === 'AUXSHP_Template_Loader' && 
							$callback['function'][1] === 'load_templates') {
							unset($wp_filter['woocommerce_locate_template']->callbacks[$priority][$key]);
						}
					}
				}
			}
		}
	}

	protected function template_include_pre_condition(): bool {
		//phpcs:ignore WordPress.Security.NonceVerification.Recommended -- It's a fronted user part, not possible to verify nonce here
		return (is_cart() || (isset($_REQUEST['wc-ajax']) &&  $_REQUEST['wc-ajax'] == 'update_shipping_method'));
	}

}
