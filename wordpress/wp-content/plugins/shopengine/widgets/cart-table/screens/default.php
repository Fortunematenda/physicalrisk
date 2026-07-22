<?php
defined('ABSPATH') || exit;
if(get_post_type() == \ShopEngine\Core\Template_Cpt::TYPE) {
	wc()->frontend_includes();

	if(empty(WC()->cart->cart_contents)) {

		WC()->session = new WC_Session_Handler();
		WC()->session->init();
		WC()->customer = new WC_Customer(get_current_user_id(), true);
		WC()->cart = new WC_Cart();

		$demo_products = get_posts(
			array(
				'post_type'   => 'product',
				'numberposts' => 1,
				'post_status' => 'publish',
				'fields'      => 'ids',
				'orderby'     => 'ID',
				'order'       => 'DESC'
			)
		);

		if(!empty($demo_products)) {
			foreach($demo_products as $id) {
				WC()->cart->add_to_cart($id);
			}
		}
	}


	if ( is_plugin_active('auxin-shop/auxin-shop.php') ) {

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

WC()->cart->calculate_totals();
$editor_mode = (\Elementor\Plugin::$instance->editor->is_edit_mode() || is_preview());

if(WC()->cart->is_empty() && $editor_mode){
	$file = '/view.php';
}elseif(WC()->cart->is_empty() && !$editor_mode){
	$file = '/empty.php';
}else{
	$file = '/cart.php';
}

wc_get_template($file, ['settings' => $settings], __DIR__, __DIR__);
