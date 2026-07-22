<?php

namespace ShopEngine\Core\Page_Templates\Hooks;

use ShopEngine\Compatibility\Conflicts\Theme_Hooks;

defined('ABSPATH') || exit;

class Archive extends Base {

	protected $page_type = 'archive';
	protected $template_part = 'content-archive.php';

	public function init() : void {

		add_action('wp_enqueue_scripts', [$this, 'enqueue_css_with_conflicts_removed'], 9999);
		add_filter('woocommerce_enqueue_styles', [Theme_Hooks::instance(), 'force_load_woocommerce_css'], 9998);

		// add_action('woocommerce_before_shop_loop_item', [$this, 'delayed_hook_conflicts'], 9999);
		$this->delayed_hook_conflicts();
	}

	public function delayed_hook_conflicts() {

		// add_action('template_include', function ($template) {

			// if($this->tpl_loaded) {

				Theme_Hooks::instance()->theme_conflicts_archive_page_after_wp_loaded();
				Theme_Hooks::instance()->theme_conflicts_in_specific_footer_area();
			// }

			// return $template;

		// }, 9991);

		$themeName = get_template();
		if ( $themeName == 'eduma' ) {
			remove_filter('loop_shop_columns', '__return_false');
		}

		if (is_plugin_active('auxin-shop/auxin-shop.php')) {

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

			// Remove rating hook from AUXSHP_Template_Loader class
			global $wp_filter;
			if (isset($wp_filter['woocommerce_after_shop_loop_item_title'])) {
				foreach ($wp_filter['woocommerce_after_shop_loop_item_title']->callbacks[13] as $key => $callback) {
					if (is_array($callback['function']) && 
						is_object($callback['function'][0]) && 
						get_class($callback['function'][0]) === 'AUXSHP_Template_Loader' && 
						$callback['function'][1] === 'auxshp_loop_rating') {
						unset($wp_filter['woocommerce_after_shop_loop_item_title']->callbacks[13][$key]);
					}
				}
			}
		}

		if ( is_plugin_active('auxin-elements/auxin-elements.php') ) {

			remove_action( 'woocommerce_shop_loop_item_title', 'auxin_woocommerce_template_loop_product_title', 10 );
		}

		
	}

	public function enqueue_css_with_conflicts_removed() {
        
			wp_dequeue_style('oceanwp-woocommerce');


			if(!wp_style_is('woocommerce-general', 'registered')) {

				$styles = \WC_Frontend_Scripts::get_styles();

				if($styles) {
					foreach($styles as $handle => $args) {

						wp_register_style($handle, $args['src'], $args['deps'], $args['version'], $args['media']);
					}
				}
			}

			wp_enqueue_style('woocommerce-general');
			wp_enqueue_style('woocommerce-layout');
		
			//Eduma Theme Conflict Issue
			$themeName = get_template();
			
			if ( $themeName == 'eduma' ) {
				wp_dequeue_script('thim-main');
				wp_dequeue_script('thim-custom-script');
			}

		// Remove Auxin Shop CSS if Auxin Shop is active
		if(is_plugin_active('auxin-shop/auxin-shop.php')) {

			wp_dequeue_style('auxin-shop');
			
		}  if ($themeName == 'phlox-pro') {

			wp_dequeue_style('auxin-elementor-base');
		}




		if (function_exists('wp_get_theme')) {
			$theme = wp_get_theme();
			$active_theme = $theme->get('Name');
			
			if($active_theme === 'PHOX' || $active_theme === 'PHOX Child') {
				wp_dequeue_style('wdes-woocommerce');
				wp_dequeue_script('bootstrap');

			} else if ( $themeName == 'woostify' ) {
				wp_dequeue_script('woostify-woocommerce');
			}
		} 
	}


	protected function template_include_pre_condition(): bool {
		//phpcs:ignore WordPress.Security.NonceVerification.Recommended -- It's a fronted user part, not possible to verify nonce here
		return is_product_category() || is_product_tag() || is_tax(get_object_taxonomies('product')) || (is_search() && !empty($_REQUEST['post_type']) && $_REQUEST['post_type'] == 'product');
	}
}
